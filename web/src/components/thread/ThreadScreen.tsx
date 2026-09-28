import { Mic } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { formatClock } from "@/lib/format";
import { useThread } from "@/state/ThreadProvider";
import type { ThreadAction } from "@/types/thread";

import { FinishCard } from "./cards/FinishCard";
import { GmailConnectCard } from "./cards/GmailConnectCard";
import { InputBar } from "./InputBar";
import { MessageRow } from "./MessageRow";
import { ThreadHeader } from "./ThreadHeader";
import { TypingIndicator } from "./TypingIndicator";

interface ThreadScreenProps {
  name: string;
  canStartCall: boolean;
  isRequestingMic: boolean;
  onStartCall: () => void;
  onSend: (text: string) => void;
  /** "Text instead" tapped on the given Persona message. */
  onTextInstead: (messageId: string) => void;
  onGmailDecline: () => void;
  onOpenDebug: () => void;
}

/** Screen 1 — the iMessage conversation with Persona. */
export function ThreadScreen({
  name,
  canStartCall,
  isRequestingMic,
  onStartCall,
  onSend,
  onTextInstead,
  onGmailDecline,
  onOpenDebug,
}: ThreadScreenProps) {
  const { messages, session, isPersonaTyping, inputRef, spentActionIds } = useThread();
  const spentSet = useMemo<Set<string>>(() => new Set(spentActionIds), [spentActionIds]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [openedAt] = useMemo(() => [new Date()], []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, isPersonaTyping, isRequestingMic]);

  const lastUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].kind === "user") return i;
    return -1;
  }, [messages]);

  const threadStartedAt = useMemo<Date>(
    () => (messages.length > 0 ? new Date(messages[0].createdAt) : openedAt),
    [messages, openedAt],
  );

  const handleAction = (action: ThreadAction, messageId: string): void => {
    if (action.intent === "start-call") {
      onStartCall();
      return;
    }
    // Focus synchronously inside the tap so mobile Safari opens the keyboard.
    inputRef.current?.focus();
    onTextInstead(messageId);
  };

  const gmailStatus = session?.gmail_status ?? "unknown";

  return (
    <div className="absolute inset-0 bg-[hsl(var(--im-bg))]">
      <ThreadHeader name={name} canCall={canStartCall} onCall={onStartCall} onTripleTap={onOpenDebug} />

      <div
        ref={scrollRef}
        className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain"
        style={{
          paddingTop: "calc(var(--safe-top) + 96px)",
          paddingBottom: "calc(max(var(--safe-bottom), 8px) + 64px)",
        }}
      >
        <div className="flex flex-col items-center pb-2 pt-3 text-[11px] leading-[14px] text-[hsl(var(--im-secondary))]">
          <span className="font-medium">iMessage</span>
          <span>
            <span className="font-semibold">
              {threadStartedAt.toDateString() === new Date().toDateString()
                ? "Today"
                : threadStartedAt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            </span>{" "}
            {formatClock(threadStartedAt)}
          </span>
        </div>

        {messages.map((m, i) => {
          if (m.kind === "card") {
            return m.card === "gmail-connect" ? (
              <GmailConnectCard
                key={m.id}
                cardId={m.id}
                status={gmailStatus}
                email={session?.gmail_email ?? null}
                onDecline={onGmailDecline}
              />
            ) : (
              <FinishCard key={m.id} cardId={m.id} agentName={name} session={session} />
            );
          }
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const isGroupEnd = !next || next.kind !== m.kind || (m.kind === "persona" && !!m.actions?.length);
          const isGroupContinuation = !!prev && prev.kind === m.kind && !(prev.kind === "persona" && prev.actions?.length);
          return (
            <MessageRow
              key={m.id}
              message={m}
              isGroupEnd={isGroupEnd}
              isGroupContinuation={isGroupContinuation}
              showDelivered={i === lastUserIndex && i === messages.length - 1 && !isPersonaTyping}
              actionsDisabled={!canStartCall}
              actionsSpent={spentSet.has(m.id)}
              onAction={handleAction}
            />
          );
        })}

        {isPersonaTyping && <TypingIndicator />}

        {isRequestingMic && (
          <div className="animate-bubble-in flex justify-center px-6 py-3">
            <span className="flex items-center gap-[6px] rounded-full bg-[hsl(var(--im-bubble))] px-3 py-[6px] text-[12px] font-medium text-[hsl(var(--im-secondary))]">
              <Mic className="h-[12px] w-[12px] animate-pulse" strokeWidth={2.6} />
              Allow microphone access to start the call
            </span>
          </div>
        )}
      </div>

      <InputBar inputRef={inputRef} onSend={onSend} />
    </div>
  );
}
