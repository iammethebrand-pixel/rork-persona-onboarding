// functions/onboarding-store.ts — Durable Object that owns Persona's onboarding data.
//
// One singleton instance ("global") holds two SQLite tables:
//   onboarding_sessions  — one row per device (device_id is unique)
//   onboarding_messages  — every thread line (voice transcript + text chat)
//
// The browser never talks to this directly; the Worker entrypoint forwards
// validated routes here via env.DO with X-Rork-DO-Class / X-Rork-DO-Id.

import { DurableObject } from "cloudflare:workers";

const GMAIL_STATUSES = new Set<string>(["unknown", "pending", "connected", "declined", "other_provider", "later"]);
const TEXT_FIELDS = ["user_name", "help_need", "gmail_status", "gmail_email", "gmail_note", "agent_name"] as const;
const ROLES = new Set<string>(["persona", "user", "system"]);
const CHANNELS = new Set<string>(["voice", "text"]);

const MAX_FIELD_CHARS = 200;
const MAX_MESSAGE_CHARS = 4000;
const MAX_META_CHARS = 2000;

type SessionRow = {
  id: string;
  device_id: string;
  user_name: string | null;
  help_need: string | null;
  gmail_status: string;
  gmail_email: string | null;
  gmail_note: string | null;
  agent_name: string | null;
  graduated: number;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: string;
  channel: string;
  text: string;
  meta: string | null;
  created_at: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

function cleanField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = (typeof value === "string" ? value : String(value)).trim().slice(0, MAX_FIELD_CHARS);
  return text.length > 0 ? text : null;
}

function toSession(row: SessionRow) {
  return { ...row, graduated: row.graduated === 1 };
}

function toMessage(row: MessageRow) {
  let meta: unknown = null;
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta);
    } catch {
      meta = null;
    }
  }
  return { ...row, meta };
}

export class OnboardingStore extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS onboarding_sessions (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL UNIQUE,
        user_name TEXT,
        help_need TEXT,
        gmail_status TEXT NOT NULL DEFAULT 'unknown',
        gmail_email TEXT,
        gmail_note TEXT,
        agent_name TEXT,
        graduated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS onboarding_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        channel TEXT NOT NULL,
        text TEXT NOT NULL,
        meta TEXT,
        created_at TEXT NOT NULL
      )
    `);
    sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_session ON onboarding_messages (session_id)");
  }

  private findSession(deviceId: string): SessionRow | null {
    const rows = this.ctx.storage.sql
      .exec<SessionRow>("SELECT * FROM onboarding_sessions WHERE device_id = ?", deviceId)
      .toArray();
    return rows[0] ?? null;
  }

  private getOrCreate(deviceId: string): SessionRow {
    const existing = this.findSession(deviceId);
    if (existing) return existing;
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO onboarding_sessions (id, device_id, gmail_status, graduated, created_at, updated_at)
       VALUES (?, ?, 'unknown', 0, ?, ?)`,
      crypto.randomUUID(),
      deviceId,
      now,
      now,
    );
    const created = this.findSession(deviceId);
    if (!created) throw new Error("session insert failed");
    return created;
  }

  private listMessages(sessionId: string) {
    return this.ctx.storage.sql
      .exec<MessageRow>(
        "SELECT id, session_id, role, channel, text, meta, created_at FROM onboarding_messages WHERE session_id = ? ORDER BY rowid ASC",
        sessionId,
      )
      .toArray()
      .map(toMessage);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object") throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const deviceId = body.device_id;
    if (!isValidDeviceId(deviceId)) return json({ error: "Invalid device_id" }, 400);

    try {
      switch (url.pathname) {
        case "/get-or-create-session": {
          const session = this.getOrCreate(deviceId);
          return json({ session: toSession(session), messages: this.listMessages(session.id) });
        }
        case "/update-session":
          return this.updateSession(deviceId, body.patch);
        case "/add-message":
          return this.addMessage(deviceId, body.message);
        case "/google-connected":
          return this.googleConnected(deviceId, body.email, body.given_name);
        case "/reset-session": {
          const existing = this.findSession(deviceId);
          if (existing) {
            this.ctx.storage.sql.exec("DELETE FROM onboarding_messages WHERE session_id = ?", existing.id);
            this.ctx.storage.sql.exec("DELETE FROM onboarding_sessions WHERE id = ?", existing.id);
          }
          const fresh = this.getOrCreate(deviceId);
          return json({ session: toSession(fresh), messages: [] });
        }
        default:
          return json({ error: "Not found" }, 404);
      }
    } catch (err) {
      console.error("[onboarding-store]", url.pathname, err instanceof Error ? err.message : String(err));
      return json({ error: "Storage error" }, 500);
    }
  }

  private updateSession(deviceId: string, rawPatch: unknown): Response {
    if (!rawPatch || typeof rawPatch !== "object") return json({ error: "Invalid patch" }, 400);
    const patch = rawPatch as Record<string, unknown>;
    const session = this.getOrCreate(deviceId);

    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    for (const field of TEXT_FIELDS) {
      if (!(field in patch)) continue;
      let value = cleanField(patch[field]);
      if (field === "gmail_status") {
        value = value ? value.toLowerCase() : "unknown";
        if (!GMAIL_STATUSES.has(value)) return json({ error: `Invalid gmail_status: ${value}` }, 400);
      }
      sets.push(`${field} = ?`);
      values.push(value);
    }

    if ("graduated" in patch) {
      const raw = patch.graduated;
      const graduated = raw === true || raw === "true" || raw === 1;
      sets.push("graduated = ?");
      values.push(graduated ? 1 : 0);
    }

    if (sets.length > 0) {
      sets.push("updated_at = ?");
      values.push(new Date().toISOString());
      this.ctx.storage.sql.exec(`UPDATE onboarding_sessions SET ${sets.join(", ")} WHERE id = ?`, ...values, session.id);
    }

    const updated = this.findSession(deviceId) ?? session;
    return json({ session: toSession(updated) });
  }

  /**
   * Internal route (only the Worker calls it, after verifying the Google ID token):
   * marks Gmail connected, stores the email, and fills user_name from given_name only if it is empty.
   */
  private googleConnected(deviceId: string, rawEmail: unknown, rawGivenName: unknown): Response {
    const email = cleanField(rawEmail);
    if (!email || !email.includes("@")) return json({ error: "Invalid email" }, 400);
    const givenName = cleanField(rawGivenName);
    const session = this.getOrCreate(deviceId);
    this.ctx.storage.sql.exec(
      `UPDATE onboarding_sessions
         SET gmail_status = 'connected',
             gmail_email = ?,
             user_name = CASE WHEN user_name IS NULL OR TRIM(user_name) = '' THEN ? ELSE user_name END,
             updated_at = ?
       WHERE id = ?`,
      email,
      givenName,
      new Date().toISOString(),
      session.id,
    );
    const updated = this.findSession(deviceId) ?? session;
    return json({ session: toSession(updated) });
  }

  private addMessage(deviceId: string, rawMessage: unknown): Response {
    if (!rawMessage || typeof rawMessage !== "object") return json({ error: "Invalid message" }, 400);
    const message = rawMessage as Record<string, unknown>;

    const role = typeof message.role === "string" ? message.role : "";
    const channel = typeof message.channel === "string" ? message.channel : "text";
    const text = typeof message.text === "string" ? message.text.trim().slice(0, MAX_MESSAGE_CHARS) : "";
    if (!ROLES.has(role)) return json({ error: "Invalid role" }, 400);
    if (!CHANNELS.has(channel)) return json({ error: "Invalid channel" }, 400);
    if (!text) return json({ error: "Empty text" }, 400);

    const id =
      typeof message.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(message.id) ? message.id : crypto.randomUUID();

    let meta: string | null = null;
    if (message.meta && typeof message.meta === "object") {
      const encoded = JSON.stringify(message.meta);
      if (encoded.length <= MAX_META_CHARS) meta = encoded;
    }

    const session = this.getOrCreate(deviceId);
    const createdAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO onboarding_messages (id, session_id, role, channel, text, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      session.id,
      role,
      channel,
      text,
      meta,
      createdAt,
    );
    return json({ ok: true, id });
  }
}
