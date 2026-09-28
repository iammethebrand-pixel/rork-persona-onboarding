import { memo, useEffect, useState } from "react";

import { formatStatusClock } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  tone: "auto" | "light";
}

/** Faux iOS status bar shown only inside the desktop phone frame. */
export const StatusBar = memo(function StatusBar({ tone }: StatusBarProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-[60] flex h-[54px] items-center justify-between px-[34px] pt-[6px] transition-colors duration-300",
        tone === "light" ? "text-white" : "text-[hsl(var(--im-label))]",
      )}
    >
      <span className="w-[54px] text-center text-[17px] font-semibold tracking-[-0.4px]">{formatStatusClock(now)}</span>
      <div className="flex items-center gap-[6px]">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
          <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .6C5.2.6 2.7 1.7.8 3.5L2 4.8a8.5 8.5 0 0 1 6-2.4Z" />
          <path d="M8 6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4.2c-1.8 0-3.4.7-4.6 1.8l1.2 1.3C5.5 6.5 6.7 6 8 6Z" />
          <path d="M8 9.4 10.1 8A3 3 0 0 0 8 7.8 3 3 0 0 0 5.9 8L8 11.4 10.1 8" />
        </svg>
        <div className="relative flex items-center">
          <div className="h-[13px] w-[25px] rounded-[4px] border border-current/40 p-[1.5px] opacity-100" style={{ borderColor: "currentColor", opacity: 0.95 }}>
            <div className="h-full w-[78%] rounded-[2px] bg-current" />
          </div>
          <div className="ml-[1px] h-[4px] w-[1.5px] rounded-r bg-current opacity-50" />
        </div>
      </div>
    </div>
  );
});
