import { memo } from "react";

/** Three bouncing dots in a gray bubble — Persona is typing. */
export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="animate-bubble-in flex px-4 pt-1">
      <div className="im-bubble im-bubble-persona im-tail flex h-[38px] items-center gap-[5px] px-[14px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[8px] w-[8px] rounded-full bg-[hsl(var(--im-secondary))]"
            style={{ animation: `typing-dot 1.2s ${i * 0.16}s infinite ease-in-out` }}
          />
        ))}
      </div>
    </div>
  );
});
