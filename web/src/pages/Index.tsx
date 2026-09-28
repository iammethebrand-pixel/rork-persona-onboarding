import { useCallback, useEffect, useRef, useState } from "react";

import { CallScreen } from "@/components/call/CallScreen";
import { DebugPanel } from "@/components/debug/DebugPanel";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { ThreadScreen } from "@/components/thread/ThreadScreen";
import { useOnboardingTools } from "@/hooks/useOnboardingTools";
import { useTextChat } from "@/hooks/useTextChat";
import { type CallOutcome, useVoiceCall } from "@/hooks/useVoiceCall";
import { setCallLiveFlag } from "@/lib/device";
import { formatDuration } from "@/lib/format";
import { log } from "@/lib/logger";
import { buildDynamicVariables, textInsteadLine } from "@/lib/sessionVariables";
import { useGoogleSignIn } from "@/state/GoogleSignInProvider";
import { CUT_OFF_TEXT, useThread } from "@/state/ThreadProvider";

const CALL_EXIT_MS = 260;
const NAME_PROMPT_TEXT =
  "One last thing! I go by Persona, but you can name me whatever you want. What should I be called?";
/** A typed message echoed back as a voice transcript within this window is not shown twice. */
const TYPED_ECHO_WINDOW_MS = 10_000;

/** Persona simulator: iMessage thread + voice call overlay inside a phone frame. */
const Index = () => {
  const {
    deviceId,
    session,
    toolCalls,
    storeErrors,
    postUser,
    postPersona,
    postPersonaAfterTyping,
    postSystem,
    setIsPersonaTyping,
    updateSession,
    refreshSession,
    resetOnboarding,
    getSnapshot,
    markActionsSpent,
  } = useThread();
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const clientTools = useOnboardingTools();

  const displayName = session?.agent_name?.trim() || "Persona";

  const recentTypedRef = useRef<{ text: string; at: number }[]>([]);
  const pendingCallTextsRef = useRef<string[]>([]);

  const maybeAskForAgentName = useCallback(() => {
    const { session: current, messages } = getSnapshot();
    if (current?.agent_name?.trim() || current?.graduated) return;
    const lastPersona = [...messages].reverse().find((m) => m.kind === "persona");
    if (lastPersona?.kind === "persona" && lastPersona.text === NAME_PROMPT_TEXT) return;
    postPersonaAfterTyping(NAME_PROMPT_TEXT, undefined, 1400);
  }, [getSnapshot, postPersonaAfterTyping]);

  const handleOutcome = useCallback(
    (outcome: CallOutcome) => {
      setCallLiveFlag(false);
      pendingCallTextsRef.current = [];
      switch (outcome.type) {
        case "ended":
          postSystem(`Call ended · ${formatDuration(outcome.durationMs)}`, { call: "ended" });
          maybeAskForAgentName();
          break;
        case "canceled":
          postSystem("Call canceled", { call: "canceled" });
          break;
        case "mic-denied":
          postPersona("I couldn't get your mic. Want to try again, or just text me?", [
            { label: "Try again", intent: "start-call" },
            { label: "Text instead", intent: "text-instead" },
          ]);
          break;
        case "dropped":
          postSystem(`Call ended · ${formatDuration(outcome.durationMs)}`, { call: "dropped" });
          postPersona(CUT_OFF_TEXT, [
            { label: "Call back", intent: "start-call" },
            { label: "Text instead", intent: "text-instead" },
          ]);
          break;
        case "failed":
          postPersona("Hmm, I couldn't connect the call. Want me to try again, or just text me?", [
            { label: "Call back", intent: "start-call" },
            { label: "Text instead", intent: "text-instead" },
          ]);
          break;
      }
    },
    [maybeAskForAgentName, postPersona, postSystem],
  );

  const handleTranscript = useCallback(
    (role: "user" | "agent", text: string) => {
      if (role === "agent") {
        postPersona(text, undefined, { channel: "voice", source: "agent" });
        return;
      }
      const now = Date.now();
      recentTypedRef.current = recentTypedRef.current.filter((t) => now - t.at < TYPED_ECHO_WINDOW_MS);
      const echoIndex = recentTypedRef.current.findIndex((t) => t.text === text);
      if (echoIndex >= 0) {
        recentTypedRef.current.splice(echoIndex, 1);
        return;
      }
      postUser(text, { channel: "voice" });
    },
    [postPersona, postUser],
  );

  const call = useVoiceCall({ onOutcome: handleOutcome, onTranscript: handleTranscript });

  const buildTextVariables = useCallback(async () => {
    const fresh = await refreshSession();
    return buildDynamicVariables("text", fresh, getSnapshot().messages);
  }, [getSnapshot, refreshSession]);

  const handleAgentText = useCallback(
    (text: string) => postPersona(text, undefined, { channel: "text", source: "agent" }),
    [postPersona],
  );

  const handleDeliveryFailed = useCallback(
    (reason: string) => {
      log.warn("text delivery failed", reason);
      postSystem(`Not delivered · couldn't reach ${displayName}. Try again in a moment.`, { persist: false });
    },
    [displayName, postSystem],
  );

  const textChat = useTextChat({
    clientTools,
    buildDynamicVariables: buildTextVariables,
    onAgentMessage: handleAgentText,
    onTypingChange: setIsPersonaTyping,
    onDeliveryFailed: handleDeliveryFailed,
  });

  // Mark the call live (for refresh detection) and deliver anything typed while connecting.
  const { phase, sendText } = call;
  useEffect(() => {
    if (phase !== "connected") return;
    setCallLiveFlag(true);
    const pending = pendingCallTextsRef.current;
    pendingCallTextsRef.current = [];
    pending.forEach((text) => {
      recentTypedRef.current.push({ text, at: Date.now() });
      sendText(text);
    });
  }, [phase, sendText]);

  // Keep the call screen mounted briefly after hang-up for the exit animation.
  const [showCall, setShowCall] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);
  useEffect(() => {
    if (call.isOnCallScreen) {
      setShowCall(true);
      setIsLeaving(false);
      return;
    }
    if (!showCall) return;
    setIsLeaving(true);
    const t = window.setTimeout(() => {
      setShowCall(false);
      setIsLeaving(false);
    }, CALL_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [call.isOnCallScreen, showCall]);

  const startCall = useCallback(() => {
    // Only one conversation at a time: close the text chat before dialing.
    textChat.close();
    const snapshot = getSnapshot();
    const dynamicVariables = buildDynamicVariables("voice", snapshot.session, snapshot.messages);
    log.info("starting call", { resumed: dynamicVariables.resumed });
    void call.start({ clientTools, dynamicVariables });
  }, [call, clientTools, getSnapshot, textChat]);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      postUser(trimmed, { channel: "text" });
      if (call.isLive) {
        recentTypedRef.current.push({ text: trimmed, at: Date.now() });
        if (call.sendText(trimmed)) return;
      } else if (call.isActive) {
        pendingCallTextsRef.current.push(trimmed);
        return;
      }
      textChat.send(trimmed);
    },
    [call, postUser, textChat],
  );

  /**
   * "Text instead": hide that message's buttons, then Persona texts first through the
   * text-mode agent, asking for the next missing step. Never starts a call or asks for the mic.
   * Buttons on an older message (Persona has texted since) only focus the input.
   */
  const handleTextInstead = useCallback(
    (messageId: string) => {
      markActionsSpent(messageId);
      const { messages } = getSnapshot();
      const lastPersona = [...messages].reverse().find((m) => m.kind === "persona");
      if (lastPersona?.id !== messageId || call.isActive) return;
      log.info("text instead: persona texts first");
      void textChat.startProactive(textInsteadLine).then((result) => {
        if (result?.via === "fallback") {
          postPersona(result.line, undefined, { channel: "text", source: "app" });
          textChat.sendContext(`The user chose to text instead of calling. You just texted them: "${result.line}"`);
        }
      });
    },
    [call.isActive, getSnapshot, markActionsSpent, postPersona, textChat],
  );

  const tellAgent = useCallback(
    (text: string) => {
      call.sendContext(text);
      textChat.sendContext(text);
    },
    [call, textChat],
  );

  const google = useGoogleSignIn();
  const { onConnected, reset: resetGoogle } = google;
  const tellAgentRef = useRef(tellAgent);
  tellAgentRef.current = tellAgent;
  useEffect(
    () =>
      onConnected(({ email }) => {
        tellAgentRef.current(`The user just connected Gmail as ${email}.`);
      }),
    [onConnected],
  );

  const handleGmailDecline = useCallback(() => {
    void updateSession({ gmail_status: "declined" });
    tellAgent("The user tapped Not now on the Gmail card. gmail_status is now declined.");
  }, [tellAgent, updateSession]);

  const handleReset = useCallback(async () => {
    textChat.close();
    if (call.isActive) call.hangUp();
    setCallLiveFlag(false);
    pendingCallTextsRef.current = [];
    recentTypedRef.current = [];
    resetGoogle();
    await resetOnboarding();
  }, [call, resetGoogle, resetOnboarding, textChat]);

  return (
    <PhoneFrame statusBarTone={showCall && !isLeaving ? "light" : "auto"}>
      <ThreadScreen
        name={displayName}
        canStartCall={!call.isActive}
        isRequestingMic={call.phase === "requesting-mic"}
        onStartCall={startCall}
        onSend={handleSend}
        onTextInstead={handleTextInstead}
        onGmailDecline={handleGmailDecline}
        onOpenDebug={() => setIsDebugOpen((v) => !v)}
      />

      {showCall && (
        <CallScreen
          name={displayName}
          phase={call.phase}
          isLeaving={isLeaving}
          connectedAt={call.connectedAt}
          captions={call.captions}
          isMuted={call.isMuted}
          isSpeaking={call.isSpeaking}
          getFrequencyData={call.getOutputByteFrequencyData}
          onToggleMute={call.toggleMute}
          onHangUp={call.hangUp}
        />
      )}

      {isDebugOpen && (
        <DebugPanel
          debug={call.debug}
          textChat={textChat.debug}
          session={session}
          deviceId={deviceId}
          toolCalls={toolCalls}
          storeErrors={storeErrors}
          googleStatus={google.status}
          googleError={google.lastError}
          onReset={handleReset}
          onClose={() => setIsDebugOpen(false)}
        />
      )}
    </PhoneFrame>
  );
};

export default Index;
