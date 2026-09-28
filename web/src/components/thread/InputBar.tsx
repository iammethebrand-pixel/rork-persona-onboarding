import { ArrowUp, Plus } from "lucide-react";
import { type KeyboardEvent, type RefObject, memo, useCallback, useLayoutEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface InputBarProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSend: (text: string) => void;
}

const MAX_HEIGHT = 120;

/** iMessage compose bar: plus button, growing pill field, blue send arrow. */
export const InputBar = memo(function InputBar({ inputRef, onSend }: InputBarProps) {
  const [text, setText] = useState<string>("");
  const canSend = text.trim().length > 0;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`;
  }, [text, inputRef]);

  const send = useCallback(() => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
    inputRef.current?.focus();
  }, [text, onSend, inputRef]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  return (
    <div
      className="im-chrome-blur absolute inset-x-0 bottom-0 z-30"
      style={{ paddingBottom: "max(var(--safe-bottom), 8px)" }}
    >
      <div className="flex items-end gap-2 px-3 pb-[6px] pt-[7px]">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Apps"
          className="press mb-[1px] flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[hsl(var(--im-bubble))] text-[hsl(var(--im-secondary))]"
        >
          <Plus className="h-[20px] w-[20px]" strokeWidth={2.4} />
        </button>

        <div className="flex min-h-[36px] flex-1 items-end rounded-[18px] border border-[hsl(var(--im-field-border))] bg-[hsl(var(--im-field))] py-[3px] pl-[12px] pr-[3px] transition-colors focus-within:border-[hsl(var(--im-secondary)/0.6)]">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="iMessage"
            aria-label="Message Persona"
            className="no-scrollbar max-h-[120px] flex-1 resize-none bg-transparent py-[4px] text-[17px] leading-[22px] tracking-[-0.41px] text-[hsl(var(--im-label))] outline-none placeholder:text-[hsl(var(--im-secondary))]"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              "press ml-1 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full transition-all duration-200",
              canSend
                ? "scale-100 bg-[hsl(var(--im-blue))] text-white"
                : "scale-90 bg-[hsl(var(--im-secondary)/0.35)] text-white/90",
            )}
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
});
