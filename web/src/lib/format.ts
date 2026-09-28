/** Formats milliseconds as an iOS call timer: 0:07, 1:23, 1:02:09. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Formats a timestamp like iMessage's section header time: "9:41 AM". */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Status-bar style clock without AM/PM: "9:41". */
export function formatStatusClock(date: Date): string {
  const h = date.getHours() % 12 || 12;
  return `${h}:${date.getMinutes().toString().padStart(2, "0")}`;
}
