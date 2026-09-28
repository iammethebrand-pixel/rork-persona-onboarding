import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GOOGLE_CLIENT_ID, GSI_SCRIPT_URL, isGoogleSignInAllowedHost } from "@/lib/googleConfig";
import { log } from "@/lib/logger";
import { onboardingApi } from "@/lib/onboardingApi";
import { useThread } from "@/state/ThreadProvider";

/** Lifecycle of Google sign-in on this page. */
export type GoogleSignInStatus =
  | "unavailable-host"
  | "loading"
  | "load-failed"
  | "ready"
  | "in-progress"
  | "verifying"
  | "connected"
  | "canceled"
  | "failed";

export interface GoogleNotice {
  /** Which card the user tapped, so the note appears under that card only. */
  cardId: string;
  text: string;
  detail?: string;
}

export interface GoogleConnectedEvent {
  email: string;
  givenName: string | null;
}

export const CANCEL_NOTE = "No worries, you can connect anytime";
/** After the popup closes and focus returns, wait this long for a credential before calling it a cancel. */
const CANCEL_GRACE_MS = 1600;

let scriptPromise: Promise<void> | null = null;

/** Loads the Google Identity Services script once per page. */
function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google?.accounts?.id ? resolve() : reject(new Error("GIS loaded without accounts.id")));
    script.onerror = () => reject(new Error("GIS script failed to load"));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    scriptPromise = null;
    throw err;
  });
  return scriptPromise;
}

export const connectedMessage = (email: string): string => `You're connected! I'll keep an eye on ${email} for you.`;

/**
 * Google sign-in for the Connect Gmail cards. Loads GIS once, renders Google's own button,
 * sends the ID token to the server for verification, then updates the thread.
 * Only the basic profile (name + email) is requested — no Gmail scopes.
 */
export const [GoogleSignInProvider, useGoogleSignIn] = createContextHook(() => {
  const { deviceId, postPersona, mergeSessionLocal, getSnapshot, refreshSession, recordStoreError } = useThread();
  const isAllowedHost = useMemo<boolean>(() => isGoogleSignInAllowedHost(), []);
  const [status, setStatus] = useState<GoogleSignInStatus>(isAllowedHost ? "loading" : "unavailable-host");
  const [notice, setNotice] = useState<GoogleNotice | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const statusRef = useRef<GoogleSignInStatus>(status);
  statusRef.current = status;
  const activeCardRef = useRef<string | null>(null);
  const cancelTimerRef = useRef<number | null>(null);
  const listenersRef = useRef<Set<(event: GoogleConnectedEvent) => void>>(new Set());
  const threadRef = useRef({ deviceId, postPersona, mergeSessionLocal, getSnapshot, refreshSession, recordStoreError });
  threadRef.current = { deviceId, postPersona, mergeSessionLocal, getSnapshot, refreshSession, recordStoreError };

  const clearCancelWatch = useCallback(() => {
    if (cancelTimerRef.current !== null) window.clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = null;
  }, []);

  const showCancelNote = useCallback((detail?: string) => {
    const cardId = activeCardRef.current;
    if (cardId) setNotice({ cardId, text: CANCEL_NOTE, detail });
  }, []);

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      clearCancelWatch();
      const credential = response?.credential;
      if (!credential) {
        setStatus("failed");
        setLastError("Google returned no credential");
        showCancelNote();
        return;
      }
      setStatus("verifying");
      setNotice(null);
      const t = threadRef.current;
      const result = await onboardingApi.verifyGoogleLogin(t.deviceId, credential);
      if (!result.ok) {
        log.warn("google sign-in rejected", result.reason);
        setStatus("failed");
        setLastError(result.reason);
        t.recordStoreError(`google sign-in: ${result.reason}`);
        showCancelNote(result.reason);
        return;
      }

      log.info("google sign-in connected", { domain: result.email.split("@")[1] ?? "" });
      const current = t.getSnapshot().session;
      const patch: Parameters<typeof t.mergeSessionLocal>[0] = {
        gmail_status: "connected",
        gmail_email: result.email,
      };
      if (!current?.user_name?.trim() && result.given_name) patch.user_name = result.given_name;
      t.mergeSessionLocal(patch);
      setStatus("connected");
      setLastError(null);
      setNotice(null);
      t.postPersona(connectedMessage(result.email), undefined, { channel: "text", source: "app" });
      const event: GoogleConnectedEvent = { email: result.email, givenName: result.given_name };
      listenersRef.current.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          log.warn("google connected listener failed", err);
        }
      });
      void t.refreshSession();
    },
    [clearCancelWatch, showCancelNote],
  );

  const handleCredentialRef = useRef(handleCredential);
  handleCredentialRef.current = handleCredential;

  // Load + initialize GIS once (only on hosts Google accepts).
  useEffect(() => {
    if (!isAllowedHost) {
      log.info("google sign-in disabled on this host", window.location.hostname);
      return;
    }
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled) return;
        const gid = window.google?.accounts?.id;
        if (!gid) throw new Error("accounts.id missing");
        gid.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => void handleCredentialRef.current(response),
          ux_mode: "popup",
          auto_select: false,
          context: "use",
        });
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        log.error("google sign-in failed to load", message);
        setLastError(message);
        setStatus("load-failed");
      });
    return () => {
      cancelled = true;
    };
  }, [isAllowedHost]);

  // Detect a closed popup: focus comes back to the page but no credential arrives.
  useEffect(() => {
    const onReturn = (): void => {
      if (document.visibilityState === "hidden") return;
      if (statusRef.current !== "in-progress") return;
      clearCancelWatch();
      cancelTimerRef.current = window.setTimeout(() => {
        cancelTimerRef.current = null;
        if (statusRef.current !== "in-progress") return;
        log.info("google sign-in closed without a credential");
        setStatus("canceled");
        showCancelNote();
      }, CANCEL_GRACE_MS);
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      clearCancelWatch();
    };
  }, [clearCancelWatch, showCancelNote]);

  /** Renders Google's own "Continue with Google" button into `parent` for the given card. */
  const renderButton = useCallback((parent: HTMLElement, cardId: string, width: number): boolean => {
    const gid = window.google?.accounts?.id;
    if (!gid) return false;
    parent.innerHTML = "";
    gid.renderButton(parent, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width,
      click_listener: () => {
        activeCardRef.current = cardId;
        setActiveCardId(cardId);
        setNotice(null);
        setStatus("in-progress");
        log.info("google sign-in started", { cardId });
      },
    });
    return true;
  }, []);

  /** Lets the page react to a successful connection (e.g. tell a live call). Returns an unsubscribe. */
  const onConnected = useCallback((fn: (event: GoogleConnectedEvent) => void): (() => void) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  /** Clears sign-in state (used by Reset onboarding). */
  const reset = useCallback(() => {
    clearCancelWatch();
    window.google?.accounts?.id?.disableAutoSelect();
    setNotice(null);
    setLastError(null);
    activeCardRef.current = null;
    setActiveCardId(null);
    setStatus(isAllowedHost ? (window.google?.accounts?.id ? "ready" : "loading") : "unavailable-host");
  }, [clearCancelWatch, isAllowedHost]);

  const isButtonReady = status !== "unavailable-host" && status !== "loading" && status !== "load-failed";

  return useMemo(
    () => ({
      status,
      isAllowedHost,
      isButtonReady,
      isVerifying: status === "verifying",
      activeCardId,
      notice,
      lastError,
      renderButton,
      onConnected,
      reset,
    }),
    [status, isAllowedHost, isButtonReady, activeCardId, notice, lastError, renderButton, onConnected, reset],
  );
});
