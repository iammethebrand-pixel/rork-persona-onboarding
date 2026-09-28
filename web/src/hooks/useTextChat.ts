import { TextConversation } from "@elevenlabs/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { log } from "@/lib/logger";
import { onboardingApi } from "@/lib/onboardingApi";
import type { DynamicVariables } from "@/lib/sessionVariables";

import type { OnboardingClientTools } from "./useOnboardingTools";

export type TextChatStatus = "idle" | "connecting" | "open";

export interface TextChatDebug {
  status: TextChatStatus;
  conversationId: string | null;
  sessionsStarted: number;
  lastDisconnect: string | null;
  lastError: string | null;
}

interface UseTextChatOptions {
  clientTools: OnboardingClientTools;
  /** Builds fresh dynamic variables (reads the latest saved session) right before connecting. */
  buildDynamicVariables: () => Promise<DynamicVariables>;
  onAgentMessage: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  /** Called when a message couldn't be delivered even after a quiet reconnect. */
  onDeliveryFailed: (reason: string) => void;
}

/** Wait after connecting so any automatic first message arrives (and is hidden) before the user's text goes out. */
const FIRST_MESSAGE_GRACE_MS = 350;
const TYPING_TIMEOUT_MS = 30_000;
/** How long a proactive session waits for the agent to say its opening line before the app posts it instead. */
const PROACTIVE_WAIT_MS = 4000;

/** How a proactive opening line reached the thread. `null` means the session was closed or reset meanwhile. */
export type ProactiveResult = { line: string; via: "agent" | "fallback" } | null;

interface ProactiveState {
  expected: string;
  resolve: (saidByAgent: boolean) => void;
}

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Text-only chat with the same Persona agent over a signed WebSocket.
 * Opens lazily on the user's first message, hides any automatic greeting that
 * arrives before that message is sent, and reconnects quietly after a drop.
 */
export function useTextChat({
  clientTools,
  buildDynamicVariables,
  onAgentMessage,
  onTypingChange,
  onDeliveryFailed,
}: UseTextChatOptions) {
  const optsRef = useRef({ clientTools, buildDynamicVariables, onAgentMessage, onTypingChange, onDeliveryFailed });
  optsRef.current = { clientTools, buildDynamicVariables, onAgentMessage, onTypingChange, onDeliveryFailed };

  const convRef = useRef<TextConversation | null>(null);
  const connectingRef = useRef<Promise<TextConversation | null> | null>(null);
  const queueRef = useRef<string[]>([]);
  /** Agent messages are shown only after the user's text has been sent in the current session. */
  const acceptAgentRef = useRef<boolean>(false);
  /** Bumped on close so late events from an old session are ignored. */
  const generationRef = useRef<number>(0);
  const typingTimerRef = useRef<number | null>(null);
  /** Set while a proactive session waits for the agent to say the chosen opening line. */
  const proactiveRef = useRef<ProactiveState | null>(null);

  const [status, setStatus] = useState<TextChatStatus>("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionsStarted, setSessionsStarted] = useState<number>(0);
  const [lastDisconnect, setLastDisconnect] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  lastErrorRef.current = lastError;

  const setTyping = useCallback((isTyping: boolean) => {
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    optsRef.current.onTypingChange(isTyping);
    if (isTyping) {
      typingTimerRef.current = window.setTimeout(() => {
        typingTimerRef.current = null;
        optsRef.current.onTypingChange(false);
      }, TYPING_TIMEOUT_MS);
    }
  }, []);

  const connect = useCallback(async (
    override?: (vars: DynamicVariables) => DynamicVariables,
  ): Promise<TextConversation | null> => {
    const generation = generationRef.current;
    setStatus("connecting");
    acceptAgentRef.current = false;

    const [signedUrl, baseVariables] = await Promise.all([
      onboardingApi.getSignedUrl(),
      optsRef.current.buildDynamicVariables(),
    ]);
    if (generation !== generationRef.current) return null;
    const dynamicVariables = override ? override(baseVariables) : baseVariables;

    log.info("text chat: starting session", { resumed: dynamicVariables.resumed });
    const conversation = await TextConversation.startSession({
      signedUrl,
      connectionType: "websocket",
      textOnly: true,
      clientTools: optsRef.current.clientTools,
      dynamicVariables,
      onConnect: ({ conversationId: id }) => {
        if (generation !== generationRef.current) return;
        setConversationId(id);
      },
      onMessage: ({ message, role }) => {
        if (generation !== generationRef.current) return;
        if (role !== "agent") return;
        const text = message.trim();
        if (!text) return;
        const proactive = proactiveRef.current;
        if (proactive?.expected && normalize(text) === normalize(proactive.expected)) {
          proactiveRef.current = null;
          setTyping(false);
          optsRef.current.onAgentMessage(text);
          proactive.resolve(true);
          return;
        }
        if (!acceptAgentRef.current) {
          log.info("text chat: hid automatic first message");
          return;
        }
        setTyping(false);
        optsRef.current.onAgentMessage(text);
      },
      onAgentTyping: () => {
        if (generation !== generationRef.current || !acceptAgentRef.current) return;
        setTyping(true);
      },
      onUnhandledClientToolCall: (call) => {
        log.warn(`text chat: unhandled client tool ${call.tool_name}`);
        setLastError(`unhandled client tool: ${call.tool_name}`);
      },
      onError: (message) => {
        if (generation !== generationRef.current) return;
        log.warn("text chat error", message);
        setLastError(message);
      },
      onDisconnect: (details) => {
        if (generation !== generationRef.current) return;
        const reason = details.reason === "error" ? `error (${details.message})` : details.reason;
        log.info("text chat: disconnected", reason);
        setLastDisconnect(reason);
        convRef.current = null;
        acceptAgentRef.current = false;
        setStatus("idle");
        setTyping(false);
      },
    });

    if (generation !== generationRef.current) {
      void conversation.endSession();
      return null;
    }
    convRef.current = conversation;
    setSessionsStarted((n) => n + 1);
    setStatus("open");

    await new Promise<void>((r) => window.setTimeout(r, FIRST_MESSAGE_GRACE_MS));
    if (generation !== generationRef.current || !conversation.isOpen()) return null;
    return conversation;
  }, [setTyping]);

  /** Sends every queued message on the given open session. */
  const flush = useCallback(
    (conversation: TextConversation): boolean => {
      while (queueRef.current.length > 0) {
        const text = queueRef.current[0];
        try {
          acceptAgentRef.current = true;
          conversation.sendUserMessage(text);
          queueRef.current.shift();
        } catch (err) {
          log.warn("text chat: send failed", errorText(err));
          return false;
        }
      }
      setTyping(true);
      return true;
    },
    [setTyping],
  );

  const ensureAndFlush = useCallback(async (): Promise<void> => {
    // Two tries: the first may hit a stale/closed session; the second is the quiet reconnect.
    for (let attempt = 0; attempt < 2; attempt++) {
      const generation = generationRef.current;
      try {
        let conversation = convRef.current?.isOpen() ? convRef.current : null;
        if (!conversation) {
          if (!connectingRef.current) {
            connectingRef.current = connect().finally(() => {
              connectingRef.current = null;
            });
          }
          conversation = await connectingRef.current;
        }
        if (generation !== generationRef.current) return;
        if (conversation && flush(conversation)) return;
        convRef.current = null;
      } catch (err) {
        if (generation !== generationRef.current) return;
        const reason = errorText(err);
        log.warn(`text chat: connect failed (attempt ${attempt + 1})`, reason);
        setLastError(reason);
        convRef.current = null;
        setStatus("idle");
      }
    }
    if (queueRef.current.length > 0) {
      queueRef.current = [];
      setTyping(false);
      optsRef.current.onDeliveryFailed(lastErrorRef.current ?? "couldn't connect");
    }
  }, [connect, flush, setTyping]);

  /** Queues a user message and delivers it, opening or reopening the session as needed. */
  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) return;
      queueRef.current.push(trimmed);
      setTyping(true);
      void ensureAndFlush();
    },
    [ensureAndFlush, setTyping],
  );

  /** Quietly tells the open text session about something that happened in the UI. */
  const sendContext = useCallback((text: string): void => {
    const conversation = convRef.current;
    if (!conversation?.isOpen()) return;
    try {
      conversation.sendContextualUpdate(text);
    } catch (err) {
      log.warn("text chat: contextual update failed", errorText(err));
    }
  }, []);

  /** Ends the text session (e.g. before a call starts, or on reset). */
  const close = useCallback((): void => {
    generationRef.current += 1;
    queueRef.current = [];
    acceptAgentRef.current = false;
    connectingRef.current = null;
    proactiveRef.current?.resolve(false);
    proactiveRef.current = null;
    const conversation = convRef.current;
    convRef.current = null;
    setStatus("idle");
    setTyping(false);
    if (conversation) {
      log.info("text chat: closing session");
      void conversation.endSession().catch(() => undefined);
    }
  }, [setTyping]);

  /**
   * Opens a fresh text session where Persona speaks first. `pickLine` receives the
   * latest saved-session variables and returns the opening line, which is passed to
   * the agent as `opening_line`. If the agent doesn't say it within a few seconds
   * (or the session can't open), resolves with `via: "fallback"` so the caller can post it.
   */
  const startProactive = useCallback(
    async (pickLine: (vars: DynamicVariables) => string): Promise<ProactiveResult> => {
      close();
      const generation = generationRef.current;
      setTyping(true);
      let line = "";
      const saidByAgent = new Promise<boolean>((resolve) => {
        proactiveRef.current = { expected: "", resolve };
      });
      const override = (vars: DynamicVariables): DynamicVariables => {
        line = pickLine(vars);
        if (proactiveRef.current) proactiveRef.current.expected = line;
        return { ...vars, opening_line: line };
      };

      try {
        const connecting = connect(override).finally(() => {
          if (connectingRef.current === connecting) connectingRef.current = null;
        });
        connectingRef.current = connecting;
        await connecting;
      } catch (err) {
        if (generation !== generationRef.current) return null;
        const reason = errorText(err);
        log.warn("text chat: proactive connect failed", reason);
        setLastError(reason);
        convRef.current = null;
        setStatus("idle");
      }
      if (generation !== generationRef.current) return null;

      const viaAgent = line
        ? await Promise.race([
            saidByAgent,
            new Promise<boolean>((r) => window.setTimeout(() => r(false), PROACTIVE_WAIT_MS)),
          ])
        : false;
      if (generation !== generationRef.current) return null;
      proactiveRef.current = null;
      if (viaAgent) return { line, via: "agent" };
      log.info("text chat: agent didn't open with the line, app posts it");
      setTyping(false);
      return { line, via: "fallback" };
    },
    [close, connect, setTyping],
  );

  useEffect(
    () => () => {
      generationRef.current += 1;
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
      void convRef.current?.endSession().catch(() => undefined);
    },
    [],
  );

  const debug = useMemo<TextChatDebug>(
    () => ({ status, conversationId, sessionsStarted, lastDisconnect, lastError }),
    [status, conversationId, sessionsStarted, lastDisconnect, lastError],
  );

  return { status, send, sendContext, close, startProactive, debug };
}

export type TextChat = ReturnType<typeof useTextChat>;
