import { useConversation, useRawConversation } from "@elevenlabs/react";
import type { DisconnectionDetails } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BACKEND_PATH } from "@/lib/backend";
import { log } from "@/lib/logger";

/**
 * Lifecycle of a single call attempt.
 * - requesting-mic: waiting on the browser permission prompt (thread stays visible)
 * - fetching-token / connecting: call screen shows "Connecting…"
 * - connected: timer running
 * - reconnecting: network hiccup, LiveKit is retrying
 */
export type CallPhase = "idle" | "requesting-mic" | "fetching-token" | "connecting" | "connected" | "reconnecting";

/** How a call attempt ended. Reported exactly once per attempt. */
export type CallOutcome =
  | { type: "ended"; by: "user" | "agent"; durationMs: number }
  | { type: "canceled" }
  | { type: "mic-denied"; detail: string }
  | { type: "dropped"; reason: string; durationMs: number }
  | { type: "failed"; reason: string };

export interface Caption {
  id: string;
  role: "user" | "agent";
  text: string;
}

export interface DebugError {
  id: string;
  at: number;
  message: string;
}

export interface VoiceCallDebug {
  phase: CallPhase;
  sdkStatus: string;
  sdkMessage: string | undefined;
  mode: "speaking" | "listening";
  isMuted: boolean;
  conversationId: string | null;
  lastDisconnectReason: string | null;
  errors: DebugError[];
}

interface UseVoiceCallOptions {
  onOutcome: (outcome: CallOutcome) => void;
  /** Every final transcript line (user speech or agent reply) while a call is live. */
  onTranscript?: (role: "user" | "agent", text: string) => void;
}

/** Per-call session config: client tools + dynamic variables built at start time. */
export interface VoiceSessionConfig {
  clientTools?: Record<string, (parameters: Record<string, unknown>) => Promise<string>>;
  dynamicVariables?: Record<string, string>;
}

const MAX_CAPTIONS = 4;
const CONNECT_TIMEOUT_MS = 25_000;
const SDK_IDLE_WAIT_MS = 6_000;

/** LiveKit DisconnectReason codes that mean the other side ended the call on purpose. */
const GRACEFUL_ROOM_REASONS = new Set<string>(["4", "5", "10"]);

let captionCounter = 0;

function describeDisconnect(d: DisconnectionDetails): string {
  if (d.reason === "user") return "user (ended by client)";
  if (d.reason === "agent") {
    const why = d.context?.reason ?? d.closeReason ?? "closed";
    return `agent (${why}${d.closeCode ? `, code ${d.closeCode}` : ""})`;
  }
  return `error (${d.message}${d.closeCode ? `, code ${d.closeCode}` : ""})`;
}

function isGracefulAgentEnd(d: DisconnectionDetails): boolean {
  if (d.reason !== "agent") return false;
  const why = d.context?.reason ?? "";
  return why === "agent disconnected" || GRACEFUL_ROOM_REASONS.has(why);
}

function isPermissionError(value: unknown): boolean {
  if (value instanceof DOMException) {
    return ["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(value.name);
  }
  const text = value instanceof Error ? value.message : String(value ?? "");
  return /permission|notallowed|denied/i.test(text);
}

function errorMessage(value: unknown): string {
  if (value instanceof DOMException) return `${value.name}: ${value.message}`;
  if (value instanceof Error) return value.message;
  return String(value);
}

interface RoomLike {
  on: (event: string, fn: () => void) => unknown;
  off: (event: string, fn: () => void) => unknown;
}

/** Best-effort access to the underlying LiveKit room to surface reconnect state. */
function getLiveKitRoom(conversation: unknown): RoomLike | null {
  const room = (conversation as { connection?: { room?: unknown } } | null)?.connection?.room as
    | Partial<RoomLike>
    | undefined;
  if (room && typeof room.on === "function" && typeof room.off === "function") return room as RoomLike;
  return null;
}

/**
 * Owns a single ElevenLabs WebRTC voice call: mic permission, token fetch,
 * session start/stop, captions, timer, reconnect state and debug info.
 * Every attempt resolves to exactly one `CallOutcome` via `onOutcome`.
 * Must be rendered inside `<ConversationProvider>`.
 */
export function useVoiceCall({ onOutcome, onTranscript }: UseVoiceCallOptions) {
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const [phase, setPhase] = useState<CallPhase>("idle");
  const phaseRef = useRef<CallPhase>("idle");
  const attemptRef = useRef<number>(0);
  const settledRef = useRef<boolean>(true);
  const sdkBusyRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const connectedAtRef = useRef<number | null>(null);

  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastDisconnectReason, setLastDisconnectReason] = useState<string | null>(null);
  const [errors, setErrors] = useState<DebugError[]>([]);

  const updatePhase = useCallback((next: CallPhase) => {
    if (phaseRef.current === next) return;
    log.info(`phase: ${phaseRef.current} → ${next}`);
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const recordError = useCallback((message: string, context?: unknown) => {
    log.error(`error: ${message}`, context);
    setErrors((prev) => [{ id: `${Date.now()}_${prev.length}`, at: Date.now(), message }, ...prev].slice(0, 8));
  }, []);

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const elapsedNow = useCallback((): number => {
    const at = connectedAtRef.current;
    return at ? Date.now() - at : 0;
  }, []);

  /** Resolves the current attempt. Idempotent: later events for the same attempt are ignored. */
  const finish = useCallback(
    (outcome: CallOutcome) => {
      if (settledRef.current) return;
      settledRef.current = true;
      attemptRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      clearConnectTimeout();
      connectedAtRef.current = null;
      setConnectedAt(null);
      updatePhase("idle");
      log.info("outcome", outcome);
      onOutcomeRef.current(outcome);
    },
    [clearConnectTimeout, updatePhase],
  );

  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => {
      log.info("connected", { conversationId: id });
      setConversationId(id);
      if (settledRef.current) return;
      clearConnectTimeout();
      const now = Date.now();
      connectedAtRef.current = now;
      setConnectedAt(now);
      updatePhase("connected");
    },
    onDisconnect: (details) => {
      const reason = describeDisconnect(details);
      log.info("disconnected", { reason, details });
      setLastDisconnectReason(reason);
      if (settledRef.current) return;
      const durationMs = elapsedNow();
      if (details.reason === "user") {
        finish({ type: "ended", by: "user", durationMs });
      } else if (isGracefulAgentEnd(details) && durationMs > 0) {
        finish({ type: "ended", by: "agent", durationMs });
      } else if (durationMs > 0) {
        finish({ type: "dropped", reason, durationMs });
      } else {
        finish({ type: "failed", reason });
      }
    },
    onError: (message, context) => {
      recordError(message, context);
      if (settledRef.current) return;
      const p = phaseRef.current;
      // While connected, errors may be non-fatal; fatal ones arrive via onDisconnect.
      if (p === "connecting" || p === "fetching-token") {
        if (isPermissionError(context) || isPermissionError(message)) {
          finish({ type: "mic-denied", detail: message });
        } else {
          finish({ type: "failed", reason: message });
        }
      }
    },
    onStatusChange: ({ status }) => {
      log.info(`sdk status: ${status}`);
      if (status === "connecting" || status === "connected") sdkBusyRef.current = true;
      if (status === "disconnected") sdkBusyRef.current = false;
    },
    onModeChange: ({ mode }) => log.info(`mode: ${mode}`),
    onMessage: ({ message, role }) => {
      const text = message.trim();
      if (!text) return;
      setCaptions((prev) => [...prev, { id: `c${captionCounter++}`, role, text }].slice(-MAX_CAPTIONS));
      if (!settledRef.current) onTranscriptRef.current?.(role, text);
    },
    onUnhandledClientToolCall: (call) => {
      recordError(`unhandled client tool: ${call.tool_name}`);
    },
  });

  const {
    startSession,
    endSession,
    sendUserMessage,
    sendContextualUpdate,
    setMuted,
    isMuted,
    isSpeaking,
    mode,
    status: sdkStatus,
    message: sdkMessage,
    getOutputByteFrequencyData,
  } = conversation;

  /** Waits for a previous (canceled) SDK session to fully release before starting another. */
  const waitForSdkIdle = useCallback(async (attempt: number): Promise<boolean> => {
    const deadline = Date.now() + SDK_IDLE_WAIT_MS;
    while (sdkBusyRef.current && Date.now() < deadline) {
      await new Promise<void>((r) => window.setTimeout(r, 100));
      if (attempt !== attemptRef.current) return false;
    }
    return attempt === attemptRef.current;
  }, []);

  const start = useCallback(async (config?: VoiceSessionConfig) => {
    if (phaseRef.current !== "idle") {
      log.warn("start ignored: call already in progress");
      return;
    }
    const attempt = ++attemptRef.current;
    settledRef.current = false;
    setCaptions([]);
    setConversationId(null);
    updatePhase("requesting-mic");

    // 1) Mic permission — only requested on explicit user tap.
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone not available in this browser");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      if (attempt !== attemptRef.current) return;
      const detail = errorMessage(err);
      recordError(`mic: ${detail}`, err);
      finish({ type: "mic-denied", detail });
      return;
    }
    if (attempt !== attemptRef.current) return;

    // 2) Conversation token from Rork Cloud (secrets stay server-side).
    updatePhase("fetching-token");
    const controller = new AbortController();
    abortRef.current = controller;
    connectTimeoutRef.current = window.setTimeout(() => {
      if (attempt !== attemptRef.current) return;
      recordError("connect timeout");
      endSession();
      finish({ type: "failed", reason: "Timed out while connecting" });
    }, CONNECT_TIMEOUT_MS);

    let token: string;
    try {
      const res = await fetch(`${BACKEND_PATH}/get-elevenlabs-token`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as { token?: string; error?: string } | null;
      if (!res.ok || !body?.token) {
        throw new Error(body?.error ?? `Token request failed (${res.status})`);
      }
      token = body.token;
    } catch (err) {
      if (attempt !== attemptRef.current) return;
      if (controller.signal.aborted) return;
      const reason = errorMessage(err);
      recordError(`token: ${reason}`, err);
      finish({ type: "failed", reason });
      return;
    }
    if (attempt !== attemptRef.current) return;
    abortRef.current = null;

    // 3) Start the WebRTC session (after any prior canceled session releases).
    updatePhase("connecting");
    const ready = await waitForSdkIdle(attempt);
    if (!ready) return;
    log.info("starting session (webrtc)");
    sdkBusyRef.current = true;
    startSession({
      conversationToken: token,
      connectionType: "webrtc",
      clientTools: config?.clientTools,
      dynamicVariables: config?.dynamicVariables,
    });
  }, [endSession, finish, recordError, startSession, updatePhase, waitForSdkIdle]);

  const hangUp = useCallback(() => {
    const p = phaseRef.current;
    if (p === "idle") return;
    log.info(`hang up (phase: ${p})`);
    const durationMs = elapsedNow();
    const wasLive = p === "connected" || p === "reconnecting";
    // Settle first so the resulting onDisconnect("user") is ignored.
    finish(wasLive ? { type: "ended", by: "user", durationMs } : { type: "canceled" });
    try {
      endSession();
    } catch (err) {
      log.warn("endSession threw", err);
    }
  }, [elapsedNow, endSession, finish]);

  const toggleMute = useCallback(() => {
    const p = phaseRef.current;
    if (p !== "connected" && p !== "reconnecting") return;
    try {
      setMuted(!isMuted);
      log.info(`mic ${!isMuted ? "muted" : "unmuted"}`);
    } catch (err) {
      recordError(`mute: ${errorMessage(err)}`, err);
    }
  }, [isMuted, recordError, setMuted]);

  // Surface LiveKit reconnect attempts as "Reconnecting…".
  const rawConversation = useRawConversation();
  useEffect(() => {
    const room = getLiveKitRoom(rawConversation);
    if (!room) return;
    const onReconnecting = (): void => {
      if (phaseRef.current === "connected") updatePhase("reconnecting");
    };
    const onReconnected = (): void => {
      if (phaseRef.current === "reconnecting") updatePhase("connected");
    };
    room.on("reconnecting", onReconnecting);
    room.on("signalReconnecting", onReconnecting);
    room.on("reconnected", onReconnected);
    return () => {
      room.off("reconnecting", onReconnecting);
      room.off("signalReconnecting", onReconnecting);
      room.off("reconnected", onReconnected);
    };
  }, [rawConversation, updatePhase]);

  // Browser-level network signal as a fallback for reconnect state.
  useEffect(() => {
    const onOffline = (): void => {
      log.warn("browser offline");
      if (phaseRef.current === "connected") updatePhase("reconnecting");
    };
    const onOnline = (): void => {
      log.info("browser online");
      if (phaseRef.current === "reconnecting") updatePhase("connected");
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [updatePhase]);

  // Closing or refreshing the tab ends the session. The attempt is settled silently
  // (no outcome) so the next load can show "we got cut off" instead.
  useEffect(() => {
    const onPageHide = (): void => {
      if (phaseRef.current === "idle") return;
      log.info("page hidden/unloading — ending session");
      settledRef.current = true;
      attemptRef.current += 1;
      abortRef.current?.abort();
      try {
        endSession();
      } catch {
        /* page is going away */
      }
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [endSession]);

  // Clean up timers on unmount.
  useEffect(() => clearConnectTimeout, [clearConnectTimeout]);

  const isActive = phase !== "idle";
  const isOnCallScreen = phase !== "idle" && phase !== "requesting-mic";
  const isLive = phase === "connected" || phase === "reconnecting";

  /** Sends a typed message into the live call. Returns false if no call is live. */
  const sendText = useCallback(
    (text: string): boolean => {
      const p = phaseRef.current;
      if (p !== "connected" && p !== "reconnecting") return false;
      try {
        sendUserMessage(text);
        return true;
      } catch (err) {
        recordError(`sendUserMessage: ${errorMessage(err)}`, err);
        return false;
      }
    },
    [recordError, sendUserMessage],
  );

  /** Quietly tells the live agent about something that happened in the UI. */
  const sendContext = useCallback(
    (text: string): void => {
      const p = phaseRef.current;
      if (p !== "connected" && p !== "reconnecting") return;
      try {
        sendContextualUpdate(text);
      } catch (err) {
        log.warn("sendContextualUpdate failed", err);
      }
    },
    [sendContextualUpdate],
  );

  const debug = useMemo<VoiceCallDebug>(
    () => ({
      phase,
      sdkStatus,
      sdkMessage,
      mode,
      isMuted,
      conversationId,
      lastDisconnectReason,
      errors,
    }),
    [phase, sdkStatus, sdkMessage, mode, isMuted, conversationId, lastDisconnectReason, errors],
  );

  return {
    phase,
    isActive,
    isOnCallScreen,
    isLive,
    sendText,
    sendContext,
    connectedAt,
    captions,
    isMuted,
    isSpeaking,
    start,
    hangUp,
    toggleMute,
    getOutputByteFrequencyData,
    debug,
  };
}

export type VoiceCall = ReturnType<typeof useVoiceCall>;
