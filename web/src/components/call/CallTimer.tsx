import { memo, useEffect, useState } from "react";

import { formatDuration } from "@/lib/format";

interface CallTimerProps {
  since: number;
}

/** Live-updating m:ss timer. Isolated so ticks don't re-render the call screen. */
export const CallTimer = memo(function CallTimer({ since }: CallTimerProps) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatDuration(now - since)}</span>;
});
