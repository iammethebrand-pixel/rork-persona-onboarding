import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { consumeCallLiveFlag, getDeviceId, loadSpentActions, saveSpentActions } from "@/lib/device";
import { log } from "@/lib/logger";
import { onboardingApi, withRetry } from "@/lib/onboardingApi";
import type {
  NewStoredMessage,
  OnboardingSession,
  SessionPatch,
  StoreError,
  StoredMessage,
  StoredMessageMeta,
  ToolCallLog,
} from "@/types/onboarding";
import type { CallMarker, MessageChannel, ThreadAction, ThreadCard, ThreadMessage } from "@/types/thread";

let idCounter = 0;
const nextId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export const GREETING_TEXT = "Hey! I'm Persona. Want to hop on a quick call so I can get you set up?";
export const CUT_OFF_TEXT = "Looks like we got cut off. Want me to call back?";

const GREETING_DELAY_MS = 1300;
const MAX_TOOL_LOGS = 10;
const MAX_STORE_ERRORS = 8;

type ActionInput = Omit<ThreadAction, "id">;

interface PostOptions {
  channel?: MessageChannel;
  /** Save to Rork Cloud (default true). */
  persist?: boolean;
}

function withActionIds(actions: ActionInput[] | undefined): ThreadAction[] | undefined {
  return actions?.map((a) => ({ ...a, id: nextId("a") }));
}

/** Converts a saved row back into a thread message. */
function fromStored(row: StoredMessage): ThreadMessage {
  const createdAt = Date.parse(row.created_at) || Date.now();
  const meta = row.meta ?? {};
  const base = { id: row.id, createdAt, channel: row.channel };
  if (row.role === "user") return { ...base, kind: "user", text: row.text };
  if (row.role === "persona") {
    return { ...base, kind: "persona", text: row.text, actions: withActionIds(meta.actions), source: meta.source ?? "agent" };
  }
  if (meta.card) return { ...base, kind: "card", card: meta.card };
  return { ...base, kind: "system", text: row.text, call: meta.call };
}

/** Converts a thread message into the row we persist. */
function toStored(message: ThreadMessage): NewStoredMessage {
  const base = { id: message.id, channel: message.channel };
  switch (message.kind) {
    case "user":
      return { ...base, role: "user", text: message.text };
    case "persona": {
      const meta: StoredMessageMeta = { source: message.source };
      if (message.actions?.length) meta.actions = message.actions.map(({ label, intent }) => ({ label, intent }));
      return { ...base, role: "persona", text: message.text, meta };
    }
    case "system":
      return { ...base, role: "system", text: message.text, meta: message.call ? { call: message.call } : undefined };
    case "card":
      return {
        ...base,
        role: "system",
        text: message.card === "gmail-connect" ? "Connect Gmail" : "Onboarding complete",
        meta: { card: message.card },
      };
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Persona's shared thread + onboarding state, backed by Rork Cloud.
 * Owns the message list, the saved session, persistence (ordered, retried once),
 * the typing indicator, tool-call logs and the input focus handle.
 */
export const [ThreadProvider, useThread] = createContextHook(() => {
  const deviceId = useMemo<string>(() => getDeviceId(), []);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [isPersonaTyping, setIsPersonaTyping] = useState<boolean>(true);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [toolCalls, setToolCalls] = useState<ToolCallLog[]>([]);
  const [storeErrors, setStoreErrors] = useState<StoreError[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  /** Messages whose quick-reply buttons were used; their buttons stay hidden, even after a refresh. */
  const [spentActionIds, setSpentActionIds] = useState<string[]>(() => loadSpentActions(deviceId));

  const markActionsSpent = useCallback(
    (messageId: string) => {
      setSpentActionIds((prev) => {
        if (prev.includes(messageId)) return prev;
        const next = [...prev, messageId];
        saveSpentActions(deviceId, next);
        return next;
      });
    },
    [deviceId],
  );

  // Latest values for async callers (client tools, session builders) without stale closures.
  const messagesRef = useRef<ThreadMessage[]>([]);
  const sessionRef = useRef<OnboardingSession | null>(null);
  messagesRef.current = messages;
  sessionRef.current = session;

  /** Bumped on reset so scheduled posts from the previous run are dropped. */
  const epochRef = useRef<number>(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const timersRef = useRef<Set<number>>(new Set());

  const recordStoreError = useCallback((message: string) => {
    log.error(`store: ${message}`);
    setStoreErrors((prev) => [{ id: nextId("e"), at: Date.now(), message }, ...prev].slice(0, MAX_STORE_ERRORS));
  }, []);

  /** Serializes writes so messages land in the DB in the order they appear. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const persistMessage = useCallback(
    (message: ThreadMessage) => {
      const row = toStored(message);
      void enqueue(() => withRetry(() => onboardingApi.addMessage(deviceId, row))).catch((err: unknown) => {
        recordStoreError(`add-message failed: ${errorText(err)}`);
      });
    },
    [deviceId, enqueue, recordStoreError],
  );

  const appendMessage = useCallback(
    (message: ThreadMessage, persist: boolean) => {
      messagesRef.current = [...messagesRef.current, message];
      setMessages(messagesRef.current);
      if (persist) persistMessage(message);
    },
    [persistMessage],
  );

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const epoch = epochRef.current;
    const t = window.setTimeout(() => {
      timersRef.current.delete(t);
      if (epoch !== epochRef.current) return;
      fn();
    }, delayMs);
    timersRef.current.add(t);
  }, []);

  const postUser = useCallback(
    (text: string, options?: PostOptions): ThreadMessage | null => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const message: ThreadMessage = {
        id: nextId("u"),
        kind: "user",
        createdAt: Date.now(),
        channel: options?.channel ?? "text",
        text: trimmed,
      };
      appendMessage(message, options?.persist ?? true);
      return message;
    },
    [appendMessage],
  );

  const postPersona = useCallback(
    (text: string, actions?: ActionInput[], options?: PostOptions & { source?: "agent" | "app" }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      appendMessage(
        {
          id: nextId("p"),
          kind: "persona",
          createdAt: Date.now(),
          channel: options?.channel ?? "text",
          text: trimmed,
          actions: withActionIds(actions),
          source: options?.source ?? "app",
        },
        options?.persist ?? true,
      );
    },
    [appendMessage],
  );

  const postSystem = useCallback(
    (text: string, options?: PostOptions & { call?: CallMarker }) => {
      appendMessage(
        { id: nextId("s"), kind: "system", createdAt: Date.now(), channel: options?.channel ?? "text", text, call: options?.call },
        options?.persist ?? true,
      );
    },
    [appendMessage],
  );

  const postCard = useCallback(
    (card: ThreadCard) => {
      appendMessage({ id: nextId("c"), kind: "card", createdAt: Date.now(), channel: "text", card }, true);
    },
    [appendMessage],
  );

  /** Shows the typing dots for `delayMs`, then posts a scripted Persona text. */
  const postPersonaAfterTyping = useCallback(
    (text: string, actions?: ActionInput[], delayMs = 1100) => {
      setIsPersonaTyping(true);
      schedule(() => {
        setIsPersonaTyping(false);
        postPersona(text, actions);
      }, delayMs);
    },
    [postPersona, schedule],
  );

  /**
   * Applies a patch to the on-screen session instantly, then saves it (retried once).
   * Resolves true when saved; never rejects.
   */
  const updateSession = useCallback(
    async (patch: SessionPatch): Promise<boolean> => {
      setSession((prev) => {
        const next = prev ? { ...prev, ...patch } : prev;
        sessionRef.current = next;
        return next;
      });
      try {
        const res = await enqueue(() => withRetry(() => onboardingApi.updateSession(deviceId, patch)));
        setSession((prev) => {
          if (!prev) return res.session;
          const saved: Partial<OnboardingSession> = { updated_at: res.session.updated_at };
          for (const key of Object.keys(patch) as (keyof SessionPatch)[]) {
            (saved as Record<string, unknown>)[key] = res.session[key];
          }
          const next = { ...prev, ...saved };
          sessionRef.current = next;
          return next;
        });
        return true;
      } catch (err) {
        recordStoreError(`update-session failed (${Object.keys(patch).join(", ")}): ${errorText(err)}`);
        return false;
      }
    },
    [deviceId, enqueue, recordStoreError],
  );

  /** Applies a patch to the on-screen session only (for changes the server already saved). */
  const mergeSessionLocal = useCallback((patch: Partial<OnboardingSession>) => {
    setSession((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      sessionRef.current = next;
      return next;
    });
  }, []);

  /** Pulls the latest saved session (used before every text session starts). */
  const refreshSession = useCallback(async (): Promise<OnboardingSession | null> => {
    try {
      const bundle = await onboardingApi.getOrCreateSession(deviceId);
      setSession(bundle.session);
      sessionRef.current = bundle.session;
      return bundle.session;
    } catch (err) {
      recordStoreError(`refresh failed: ${errorText(err)}`);
      return sessionRef.current;
    }
  }, [deviceId, recordStoreError]);

  const logToolCall = useCallback((name: string, params: unknown, result: string) => {
    let encoded: string;
    try {
      encoded = JSON.stringify(params ?? {});
    } catch {
      encoded = String(params);
    }
    log.info(`tool ${name}`, { params, result });
    setToolCalls((prev) =>
      [{ id: nextId("t"), at: Date.now(), name, params: encoded.slice(0, 240), result }, ...prev].slice(0, MAX_TOOL_LOGS),
    );
  }, []);

  const startGreeting = useCallback(() => {
    setIsPersonaTyping(true);
    schedule(() => {
      setIsPersonaTyping(false);
      postPersona(GREETING_TEXT, [{ label: "Start call", intent: "start-call" }]);
    }, GREETING_DELAY_MS);
  }, [postPersona, schedule]);

  // ── Initial load from Rork Cloud ─────────────────────────────────────────
  const initialQuery = useQuery({
    queryKey: ["onboarding-session", deviceId],
    queryFn: () => onboardingApi.getOrCreateSession(deviceId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const hydratedRef = useRef<boolean>(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (initialQuery.isPending) return;
    hydratedRef.current = true;

    const wasMidCall = consumeCallLiveFlag();

    if (initialQuery.isError || !initialQuery.data) {
      recordStoreError(`load failed: ${errorText(initialQuery.error)}`);
      setIsHydrated(true);
      startGreeting();
      return;
    }

    const { session: loaded, messages: rows } = initialQuery.data;
    setSession(loaded);
    sessionRef.current = loaded;
    const restored = rows.map(fromStored);
    messagesRef.current = restored;
    setMessages(restored);
    setIsHydrated(true);
    log.info("session loaded", { messages: restored.length, graduated: loaded.graduated });

    if (restored.length === 0) {
      startGreeting();
      return;
    }
    setIsPersonaTyping(false);
    if (wasMidCall) {
      postSystem("Call ended · we got cut off", { call: "cutoff" });
      postPersona(CUT_OFF_TEXT, [
        { label: "Call back", intent: "start-call" },
        { label: "Text instead", intent: "text-instead" },
      ]);
    }
  }, [initialQuery.isPending, initialQuery.isError, initialQuery.data, initialQuery.error, postPersona, postSystem, recordStoreError, startGreeting]);

  /** Wipes the saved session + thread and starts over with a fresh greeting. */
  const resetOnboarding = useCallback(async (): Promise<boolean> => {
    epochRef.current += 1;
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current.clear();
    messagesRef.current = [];
    setMessages([]);
    setToolCalls([]);
    setIsPersonaTyping(false);
    setSpentActionIds([]);
    saveSpentActions(deviceId, []);
    try {
      const bundle = await enqueue(() => withRetry(() => onboardingApi.resetSession(deviceId)));
      setSession(bundle.session);
      sessionRef.current = bundle.session;
      startGreeting();
      return true;
    } catch (err) {
      recordStoreError(`reset failed: ${errorText(err)}`);
      startGreeting();
      return false;
    }
  }, [deviceId, enqueue, recordStoreError, startGreeting]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const focusInput = useCallback(() => {
    // Defer so it runs after any screen transition / button blur.
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const getSnapshot = useCallback(
    () => ({ session: sessionRef.current, messages: messagesRef.current }),
    [],
  );

  return useMemo(
    () => ({
      deviceId,
      messages,
      session,
      isHydrated,
      isPersonaTyping,
      toolCalls,
      storeErrors,
      spentActionIds,
      markActionsSpent,
      inputRef,
      setIsPersonaTyping,
      postUser,
      postPersona,
      postPersonaAfterTyping,
      postSystem,
      postCard,
      updateSession,
      mergeSessionLocal,
      refreshSession,
      resetOnboarding,
      logToolCall,
      recordStoreError,
      getSnapshot,
      focusInput,
    }),
    [
      deviceId,
      messages,
      session,
      isHydrated,
      isPersonaTyping,
      toolCalls,
      storeErrors,
      spentActionIds,
      markActionsSpent,
      postUser,
      postPersona,
      postPersonaAfterTyping,
      postSystem,
      postCard,
      updateSession,
      mergeSessionLocal,
      refreshSession,
      resetOnboarding,
      logToolCall,
      recordStoreError,
      getSnapshot,
      focusInput,
    ],
  );
});
