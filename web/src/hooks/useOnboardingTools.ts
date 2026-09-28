import { useMemo, useRef } from "react";

import { useThread } from "@/state/ThreadProvider";
import { GMAIL_STATUSES, type GmailStatus, type SessionPatch } from "@/types/onboarding";

/** Client tool map handed to both voice and text ElevenLabs sessions. */
export type OnboardingClientTools = Record<string, (parameters: Record<string, unknown>) => Promise<string>>;

const MAX_FIELD = 200;

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, MAX_FIELD);
}

/**
 * The six clientTools configured on the Persona agent. Every handler updates
 * the UI instantly, saves via update-session (retried once), returns a short
 * status string and never throws.
 */
export function useOnboardingTools(): OnboardingClientTools {
  const thread = useThread();
  const threadRef = useRef(thread);
  threadRef.current = thread;

  return useMemo<OnboardingClientTools>(() => {
    const t = () => threadRef.current;

    const savePatch = async (patch: SessionPatch, label: string): Promise<string> => {
      const ok = await t().updateSession(patch);
      return ok ? `saved ${label}` : "save failed";
    };

    const saveText = async (field: "user_name" | "help_need" | "agent_name", raw: unknown): Promise<string> => {
      const value = clean(raw);
      if (!value) return `missing ${field}`;
      return savePatch({ [field]: value }, `${field}=${value}`);
    };

    const tools: Record<string, (p: Record<string, unknown>) => Promise<string>> = {
      save_user_name: (p) => saveText("user_name", p.name),
      save_help_need: (p) => saveText("help_need", p.need),
      save_agent_name: (p) => saveText("agent_name", p.name),
      save_gmail_status: async (p) => {
        const status = clean(p.status).toLowerCase().replace(/[\s-]+/g, "_");
        if (!(GMAIL_STATUSES as readonly string[]).includes(status)) {
          return `invalid status "${status}" (use ${GMAIL_STATUSES.join("|")})`;
        }
        const note = clean(p.note);
        const patch: SessionPatch = { gmail_status: status as GmailStatus };
        if (note) patch.gmail_note = note;
        return savePatch(patch, `gmail_status=${status}${note ? ` gmail_note=${note}` : ""}`);
      },
      open_gmail_connect: async () => {
        t().postCard("gmail-connect");
        return "shown gmail connect card";
      },
      graduate: async () => {
        const result = await savePatch({ graduated: true }, "graduated=true");
        t().postCard("finish");
        return result;
      },
    };

    // Wrap every handler: log the call for the debug panel and never throw.
    const wrapped: OnboardingClientTools = {};
    for (const [name, handler] of Object.entries(tools)) {
      wrapped[name] = async (parameters: Record<string, unknown>) => {
        const params = parameters && typeof parameters === "object" ? parameters : {};
        let result: string;
        try {
          result = await handler(params);
        } catch (err) {
          result = "save failed";
          t().recordStoreError(`${name} threw: ${err instanceof Error ? err.message : String(err)}`);
        }
        t().logToolCall(name, params, result);
        return result;
      };
    }
    return wrapped;
  }, []);
}
