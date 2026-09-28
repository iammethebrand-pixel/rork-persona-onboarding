const PREFIX = "%c[Persona]";
const STYLE = "color:#0A84FF;font-weight:600";

/** Namespaced console logger for call lifecycle + debug events. Never pass secrets. */
export const log = {
  info(event: string, data?: unknown): void {
    if (data === undefined) console.info(PREFIX, STYLE, event);
    else console.info(PREFIX, STYLE, event, data);
  },
  warn(event: string, data?: unknown): void {
    if (data === undefined) console.warn(PREFIX, STYLE, event);
    else console.warn(PREFIX, STYLE, event, data);
  },
  error(event: string, data?: unknown): void {
    if (data === undefined) console.error(PREFIX, STYLE, event);
    else console.error(PREFIX, STYLE, event, data);
  },
};
