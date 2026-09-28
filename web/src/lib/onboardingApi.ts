import { BACKEND_PATH } from "@/lib/backend";
import type { NewStoredMessage, OnboardingSession, SessionPatch, StoredMessage } from "@/types/onboarding";

const REQUEST_TIMEOUT_MS = 12_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_PATH}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new Error(body?.error ?? `${path} failed (${res.status})`);
    return body;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`${path} timed out`);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    window.clearTimeout(timer);
  }
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Runs `fn`, and if it throws, waits briefly and tries exactly once more. */
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 450): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise<void>((r) => window.setTimeout(r, delayMs));
    return fn();
  }
}

export type GoogleLoginResult =
  | { ok: true; email: string; given_name: string | null; reason?: undefined }
  | { ok: false; reason: string; email?: undefined; given_name?: undefined };

export interface SessionBundle {
  session: OnboardingSession;
  messages: StoredMessage[];
}

/** Thin client for Persona's onboarding routes on Rork Cloud. The browser never touches the DB directly. */
export const onboardingApi = {
  getOrCreateSession: (deviceId: string) => post<SessionBundle>("/get-or-create-session", { device_id: deviceId }),
  updateSession: (deviceId: string, patch: SessionPatch) =>
    post<{ session: OnboardingSession }>("/update-session", { device_id: deviceId, patch }),
  addMessage: (deviceId: string, message: NewStoredMessage) =>
    post<{ ok: true; id: string }>("/add-message", { device_id: deviceId, message }),
  resetSession: (deviceId: string) => post<SessionBundle>("/reset-session", { device_id: deviceId }),
  /** Sends the Google ID token to the server for verification. Never rejects. */
  verifyGoogleLogin: async (deviceId: string, credential: string): Promise<GoogleLoginResult> => {
    try {
      const res = await withRetry(() =>
        post<GoogleLoginResult>("/verify-google-login", { device_id: deviceId, credential }),
      );
      if (res.ok === true && typeof res.email === "string") {
        return { ok: true, email: res.email, given_name: res.given_name ?? null };
      }
      return { ok: false, reason: res.reason || "Google sign-in didn't go through." };
    } catch {
      return { ok: false, reason: "Couldn't reach Persona's server. Please try again." };
    }
  },
  getSignedUrl: async (): Promise<string> => {
    const body = await request<{ signedUrl?: string }>("/get-elevenlabs-signed-url");
    if (!body.signedUrl) throw new Error("No signed URL returned");
    return body.signedUrl;
  },
};
