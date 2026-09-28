import { ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { memo, useCallback, useRef } from "react";

import { PersonaAvatar } from "@/components/persona/PersonaAvatar";
import { cn } from "@/lib/utils";

interface ThreadHeaderProps {
  name: string;
  canCall: boolean;
  onCall: () => void;
  onTripleTap: () => void;
}

const TRIPLE_TAP_WINDOW_MS = 650;

/** iOS 17-style Messages header: centered avatar + name, green call button. */
export const ThreadHeader = memo(function ThreadHeader({ name, canCall, onCall, onTripleTap }: ThreadHeaderProps) {
  const tapsRef = useRef<number[]>([]);

  const handleNameTap = useCallback(() => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < TRIPLE_TAP_WINDOW_MS), now];
    if (tapsRef.current.length >= 3) {
      tapsRef.current = [];
      onTripleTap();
    }
  }, [onTripleTap]);

  return (
    <header
      className="im-chrome-blur absolute inset-x-0 top-0 z-30 border-b border-[hsl(var(--im-separator)/0.7)]"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="relative flex h-[84px] items-start justify-between px-2 pt-1">
        <button
          type="button"
          aria-label="Back"
          className="press flex h-11 items-center pr-2 text-[hsl(var(--im-blue))]"
          tabIndex={-1}
        >
          <ChevronLeft className="h-[30px] w-[30px]" strokeWidth={2.4} />
        </button>

        <button
          type="button"
          onClick={handleNameTap}
          className="absolute left-1/2 top-1 flex -translate-x-1/2 flex-col items-center gap-[5px]"
          aria-label={`${name} contact`}
        >
          <PersonaAvatar size={52} name={name} />
          <span className="flex max-w-[180px] items-center gap-[1px] text-[12px] font-medium leading-none text-[hsl(var(--im-label))]">
            <span className="truncate">{name}</span>
            <ChevronRight className="h-[11px] w-[11px] text-[hsl(var(--im-secondary))]" strokeWidth={3} />
          </span>
        </button>

        <button
          type="button"
          onClick={onCall}
          disabled={!canCall}
          aria-label="Start voice call"
          className={cn(
            "press mr-1 mt-[6px] flex h-9 w-9 items-center justify-center rounded-full",
            canCall
              ? "bg-[hsl(var(--im-green))] text-white shadow-[0_2px_8px_hsl(var(--im-green)/0.35)]"
              : "bg-[hsl(var(--im-green)/0.35)] text-white/80",
          )}
        >
          <Phone className="h-[17px] w-[17px]" fill="currentColor" strokeWidth={0} />
        </button>
      </div>
    </header>
  );
});
