// Persona Onboarding backend — a vanilla Cloudflare Worker.
//
// Secrets (server-only, set in the project envs, never shipped to the browser):
//   ELEVENLABS_API_KEY   — ElevenLabs API key
//   ELEVENLABS_AGENT_ID  — ElevenLabs Conversational AI agent id
//
// Onboarding data lives in the OnboardingStore Durable Object (SQLite).

export { OnboardingStore } from "./onboarding-store";

type Env = {
  DO: Fetcher;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_AGENT_ID?: string;
};

const ELEVENLABS_TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token";
const ELEVENLABS_SIGNED_URL = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/** Public Google OAuth Web Client ID (not a secret). ID tokens must be issued for this audience. */
const GOOGLE_CLIENT_ID = "345280845969-cibe7ofokq0nkohc2prhisirefhvd6gt.apps.googleusercontent.com";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_ISSUERS = new Set<string>(["accounts.google.com", "https://accounts.google.com"]);
const MAX_CREDENTIAL_CHARS = 8192;

const STORE_ROUTES = new Set<string>(["/get-or-create-session", "/update-session", "/add-message", "/reset-session"]);
const STORE_INSTANCE = "global";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function readSecrets(env: Env, tag: string): { apiKey: string; agentId: string } | Response {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const agentId = env.ELEVENLABS_AGENT_ID?.trim();
  if (!apiKey || !agentId) {
    console.error(`[${tag}] missing secrets`, { hasApiKey: Boolean(apiKey), hasAgentId: Boolean(agentId) });
    return json({ error: "Voice calling isn't configured yet." }, 500);
  }
  return { apiKey, agentId };
}

/** Calls an ElevenLabs GET endpoint with the agent id and returns one string field from the response. */
async function fetchElevenLabsField(
  env: Env,
  tag: string,
  endpoint: string,
  field: "token" | "signed_url",
): Promise<{ value: string } | Response> {
  const secrets = readSecrets(env, tag);
  if (secrets instanceof Response) return secrets;

  const url = new URL(endpoint);
  url.searchParams.set("agent_id", secrets.agentId);

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { method: "GET", headers: { "xi-api-key": secrets.apiKey } });
  } catch (err) {
    console.error(`[${tag}] network error`, err instanceof Error ? err.message : String(err));
    return json({ error: "Couldn't reach the voice service." }, 502);
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 300);
    console.error(`[${tag}] upstream error`, upstream.status, detail);
    return json({ error: "The voice service rejected the request.", upstreamStatus: upstream.status }, 502);
  }

  const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  const value = data?.[field];
  if (typeof value !== "string" || value.length === 0) {
    console.error(`[${tag}] upstream response had no ${field}`);
    return json({ error: "The voice service returned an invalid response." }, 502);
  }
  return { value };
}

/** Mints a short-lived WebRTC conversation token. Returns only `{ token }`. */
async function getElevenLabsToken(env: Env): Promise<Response> {
  const result = await fetchElevenLabsField(env, "get-elevenlabs-token", ELEVENLABS_TOKEN_URL, "token");
  return result instanceof Response ? result : json({ token: result.value });
}

/** Mints a signed WebSocket URL for text-only chat. Returns only `{ signedUrl }`. */
async function getElevenLabsSignedUrl(env: Env): Promise<Response> {
  const result = await fetchElevenLabsField(env, "get-elevenlabs-signed-url", ELEVENLABS_SIGNED_URL, "signed_url");
  return result instanceof Response ? result : json({ signedUrl: result.value });
}

/** Forwards a validated onboarding route to the OnboardingStore Durable Object. */
async function forwardToStore(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const wrapped = new Request(request.url, request);
  wrapped.headers.set("X-Rork-DO-Class", "OnboardingStore");
  wrapped.headers.set("X-Rork-DO-Id", STORE_INSTANCE);
  try {
    return await env.DO.fetch(wrapped);
  } catch (err) {
    console.error("[store] dispatch failed", err instanceof Error ? err.message : String(err));
    return json({ error: "Storage is unavailable right now." }, 503);
  }
}

/** Calls a store route directly from the Worker (used for internal-only routes). */
async function callStore(request: Request, env: Env, path: string, body: unknown): Promise<Response> {
  const url = new URL(path, request.url);
  const internal = new Request(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Rork-DO-Class": "OnboardingStore",
      "X-Rork-DO-Id": STORE_INSTANCE,
    },
    body: JSON.stringify(body),
  });
  return env.DO.fetch(internal);
}

type GoogleLoginResult =
  | { ok: true; email: string; given_name: string | null }
  | { ok: false; reason: string };

/**
 * Verifies a Google Identity Services ID token via Google's tokeninfo endpoint,
 * then marks the device's session as Gmail-connected. The token itself is never stored.
 * Always responds 200 with `{ ok, ... }` so the client can show a friendly reason.
 */
async function verifyGoogleLogin(request: Request, env: Env): Promise<Response> {
  const fail = (reason: string, log?: string): Response => {
    if (log) console.warn("[verify-google-login]", log);
    return json({ ok: false, reason } satisfies GoogleLoginResult);
  };

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Something went wrong sending your sign-in. Please try again.", "invalid json");
  }

  const deviceId = body.device_id;
  const credential = body.credential;
  if (typeof deviceId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) {
    return fail("Something went wrong on this device. Please refresh and try again.", "invalid device_id");
  }
  if (typeof credential !== "string" || credential.length < 20 || credential.length > MAX_CREDENTIAL_CHARS) {
    return fail("Google didn't send a valid sign-in. Please try again.", "invalid credential shape");
  }

  let info: Record<string, unknown> | null;
  try {
    const url = new URL(GOOGLE_TOKENINFO_URL);
    url.searchParams.set("id_token", credential);
    const res = await fetch(url.toString(), { method: "GET" });
    info = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !info) return fail("Google couldn't confirm that sign-in. Please try again.", `tokeninfo ${res.status}`);
  } catch (err) {
    return fail("Couldn't reach Google right now. Please try again in a moment.", err instanceof Error ? err.message : String(err));
  }

  const aud = typeof info.aud === "string" ? info.aud : "";
  const iss = typeof info.iss === "string" ? info.iss : "";
  const email = typeof info.email === "string" ? info.email.trim() : "";
  const emailVerified = info.email_verified === true || info.email_verified === "true";
  const exp = Number(info.exp);
  const givenName = typeof info.given_name === "string" && info.given_name.trim() ? info.given_name.trim() : null;

  if (aud !== GOOGLE_CLIENT_ID) return fail("That sign-in wasn't meant for Persona. Please try again.", "aud mismatch");
  if (!GOOGLE_ISSUERS.has(iss)) return fail("That sign-in didn't come from Google. Please try again.", "iss mismatch");
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return fail("That sign-in expired. Please try again.", "expired");
  if (!email || !email.includes("@")) return fail("Google didn't share an email address.", "no email");
  if (!emailVerified) return fail("That Google email isn't verified yet.", "email not verified");

  try {
    const res = await callStore(request, env, "/google-connected", { device_id: deviceId, email, given_name: givenName });
    if (!res.ok) return fail("Signed in, but couldn't save it. Please try again.", `store ${res.status}`);
  } catch (err) {
    return fail("Signed in, but couldn't save it. Please try again.", err instanceof Error ? err.message : String(err));
  }

  console.info("[verify-google-login] connected", { domain: email.split("@")[1] ?? "" });
  return json({ ok: true, email, given_name: givenName } satisfies GoogleLoginResult);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/get-elevenlabs-token") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return getElevenLabsToken(env);
    }

    if (url.pathname === "/get-elevenlabs-signed-url") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return getElevenLabsSignedUrl(env);
    }

    if (url.pathname === "/verify-google-login") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return verifyGoogleLogin(request, env);
    }

    if (STORE_ROUTES.has(url.pathname)) {
      return forwardToStore(request, env);
    }

    if (url.pathname === "/ping") {
      return json({ ok: true, now: new Date().toISOString() });
    }

    return json({ error: "Not found" }, 404);
  },
};
