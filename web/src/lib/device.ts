const DEVICE_KEY = "persona.deviceId";
const CALL_FLAG_KEY = "persona.callLive";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

let cachedDeviceId: string | null = null;

/** Stable anonymous id for this browser (no login yet). */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = safeGet(DEVICE_KEY);
  if (stored && /^[A-Za-z0-9-]{8,64}$/.test(stored)) {
    cachedDeviceId = stored;
    return stored;
  }
  const fresh = randomId();
  safeSet(DEVICE_KEY, fresh);
  cachedDeviceId = fresh;
  return fresh;
}

const spentKey = (deviceId: string): string => `persona.spentActions.${deviceId}`;
const MAX_SPENT = 50;

/** Message ids whose quick-reply buttons were already used (kept across refreshes). */
export function loadSpentActions(deviceId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(safeGet(spentKey(deviceId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveSpentActions(deviceId: string, ids: string[]): void {
  safeSet(spentKey(deviceId), ids.length ? JSON.stringify(ids.slice(-MAX_SPENT)) : null);
}

/** Remembers that a call is live so a refresh mid-call can be detected on the next load. */
export function setCallLiveFlag(isLive: boolean): void {
  safeSet(CALL_FLAG_KEY, isLive ? String(Date.now()) : null);
}

/** Returns true (and clears the flag) if the previous page load was mid-call. */
export function consumeCallLiveFlag(): boolean {
  const value = safeGet(CALL_FLAG_KEY);
  if (value === null) return false;
  safeSet(CALL_FLAG_KEY, null);
  return true;
}
