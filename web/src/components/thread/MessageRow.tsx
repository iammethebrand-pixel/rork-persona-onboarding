import { Phone, MessageSquare } from "lucide-react";
import { memo } from "react";

import { cn } from "@/lib/utils";
import type { PersonaMessage, SystemMessage, ThreadAction, UserMessage } from "@/types/thread";

interface MessageRowProps {
  message: UserMessage | PersonaMessage | SystemMessage;
  /** Last bubble in a consecutive run from the same sender — gets the tail. */
  isGroupEnd: boolean;
  /** Tighter spacing when the previous row came from the same sender. */
  isGroupContinuation: boolean;
  showDelivered: boolean;
  actionsDisabled: boolean;
  /** Buttons already used (hidden so they can't be tapped twice). */
  actionsSpent: boolean;
  onAction: (action: ThreadAction, messageId: string) => void;
}

/** A single thread row: user bubble, Persona bubble (+ quick replies) or system line. */
export const MessageRow = memo(function MessageRow({
  message,
  isGroupEnd,
  isGroupContinuation,
  showDelivered,
  actionsDisabled,
  actionsSpent,
  onAction,
}: MessageRowProps) {
  if (message.kind === "system") {
    return (
      <div className="animate-bubble-in flex justify-center px-6 py-3">
        <span className="text-center text-[12px] font-medium leading-[16px] text-[hsl(var(--im-secondary))]">
          {message.text}
        </span>
      </div>
    );
  }

  const isUser = message.kind === "user";
  const actions = message.kind === "persona" && !actionsSpent ? message.actions : undefined;

  return (
    <div className={cn("px-4", isGroupContinuation ? "pt-[2px]" : "pt-2")}>
      <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "im-bubble",
            isUser ? "im-bubble-user animate-bubble-in-right" : "im-bubble-persona animate-bubble-in",
            isGroupEnd && "im-tail",
          )}
        >
          {message.text}
        </div>
      </div>

      {actions && actions.length > 0 && (
        <div className="animate-bubble-in mt-2 flex flex-wrap gap-2 pl-1" style={{ animationDelay: "120ms" }}>
          {actions.map((action, idx) => {
            const isPrimary = idx === 0 && action.intent === "start-call";
            const Icon = action.intent === "start-call" ? Phone : MessageSquare;
            const disabled = action.intent === "start-call" && actionsDisabled;
            return (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                onClick={() => onAction(action, message.id)}
                className={cn(
                  "press flex h-[34px] items-center gap-[6px] rounded-full px-[14px] text-[15px] font-semibold tracking-[-0.2px]",
                  isPrimary
                    ? "bg-[hsl(var(--im-blue))] text-white shadow-[0_4px_14px_-4px_hsl(var(--im-blue)/0.6)]"
                    : "border border-[hsl(var(--im-separator))] bg-[hsl(var(--im-bg))] text-[hsl(var(--im-blue))]",
                  disabled && "cursor-not-allowed opacity-40 shadow-none",
                )}
              >
                <Icon
                  className="h-[14px] w-[14px]"
                  fill={action.intent === "start-call" ? "currentColor" : "none"}
                  strokeWidth={action.intent === "start-call" ? 0 : 2.4}
                />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {showDelivered && (
        <div className="mt-[3px] pr-1 text-right text-[11px] font-medium text-[hsl(var(--im-secondary))]">Delivered</div>
      )}
    </div>
  );
});
