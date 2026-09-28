import { RotateCcw, X } from "lucide-react";
import { memo, useState } from "react";

import type { TextChatDebug } from "@/hooks/useTextChat";
import type { VoiceCallDebug } from "@/hooks/useVoiceCall";
import { cn } from "@/lib/utils";
import type { GoogleSignInStatus } from "@/state/GoogleSignInProvider";
import type { OnboardingSession, StoreError, ToolCallLog } from "@/types/onboarding";

interface DebugPanelProps {
  debug: VoiceCallDebug;
  textChat: TextChatDebug;
  session: OnboardingSession | null;
  deviceId: string;
  toolCalls: ToolCallLog[];
  storeErrors: StoreError[];
  googleStatus: GoogleSignInStatus;
  googleError: string | null;
  onReset: () => Promise<void>;
  onClose: () => void;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[5px]">
      <span className="shrink-0 text-white/45">{label}</span>
      <span
        className={cn(
          "min-w-0 break-all text-right",
          tone === "ok" && "text-[#30D158]",
          tone === "warn" && "text-[#FFD60A]",
          tone === "bad" && "text-[#FF453A]",
          !tone && "text-white/90",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <div className="mb-1 mt-4 text-[12px] font-semibold tracking-wide text-[#64B5FF]">{children}</div>;
}

const show = (value: string | null | undefined): string => (value && value.length > 0 ? value : "—");

/** Hidden developer panel (triple-tap the contact name): connection, session, tool calls and reset. */
export const DebugPanel = memo(function DebugPanel({
  debug,
  textChat,
  session,
  deviceId,
  toolCalls,
  storeErrors,
  googleStatus,
  googleError,
  onReset,
  onClose,
}: DebugPanelProps) {
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const statusTone =
    debug.sdkStatus === "connected" ? "ok" : debug.sdkStatus === "error" ? "bad" : debug.sdkStatus === "connecting" ? "warn" : undefined;

  const handleReset = async (): Promise<void> => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await onReset();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="animate-panel-in absolute inset-x-3 z-[80] max-h-[70%] overflow-y-auto rounded-2xl border border-white/10 bg-[#111318]/95 p-4 font-mono text-[11px] leading-[15px] text-white shadow-2xl backdrop-blur-xl"
      style={{ top: "calc(var(--safe-top) + 8px)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold tracking-wide text-[#64B5FF]">DEBUG · VOICE</span>
        <button type="button" onClick={onClose} aria-label="Close debug panel" className="press rounded-full bg-white/10 p-1">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="divide-y divide-white/5">
        <Row label="connection" value={debug.sdkStatus} tone={statusTone} />
        <Row label="call phase" value={debug.phase} />
        <Row label="mode" value={debug.mode} />
        <Row label="mic" value={debug.isMuted ? "muted" : "live"} />
        <Row label="conversation id" value={debug.conversationId ?? "—"} />
        <Row label="last disconnect" value={debug.lastDisconnectReason ?? "—"} />
        {debug.sdkMessage && <Row label="sdk message" value={debug.sdkMessage} tone="bad" />}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-white/45">errors ({debug.errors.length})</div>
        {debug.errors.length === 0 ? (
          <div className="text-white/30">none</div>
        ) : (
          <ul className="space-y-1">
            {debug.errors.map((e) => (
              <li key={e.id} className="rounded-md bg-[#FF453A]/10 px-2 py-1 text-[#FF8A80]">
                <span className="text-white/35">{new Date(e.at).toLocaleTimeString()} </span>
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <SectionTitle>TEXT CHAT</SectionTitle>
      <div className="divide-y divide-white/5">
        <Row label="status" value={textChat.status} tone={textChat.status === "open" ? "ok" : textChat.status === "connecting" ? "warn" : undefined} />
        <Row label="conversation id" value={show(textChat.conversationId)} />
        <Row label="sessions started" value={String(textChat.sessionsStarted)} />
        <Row label="last disconnect" value={show(textChat.lastDisconnect)} />
        {textChat.lastError && <Row label="last error" value={textChat.lastError} tone="bad" />}
      </div>

      <SectionTitle>GOOGLE SIGN-IN</SectionTitle>
      <div className="divide-y divide-white/5">
        <Row
          label="status"
          value={googleStatus}
          tone={
            googleStatus === "connected" || googleStatus === "ready"
              ? "ok"
              : googleStatus === "failed" || googleStatus === "load-failed"
                ? "bad"
                : googleStatus === "unavailable-host"
                  ? undefined
                  : "warn"
          }
        />
        <Row label="host" value={window.location.hostname} />
        <Row
          label="connected email"
          value={session?.gmail_status === "connected" ? show(session.gmail_email) : "—"}
          tone={session?.gmail_status === "connected" ? "ok" : undefined}
        />
        {googleError && <Row label="last error" value={googleError} tone="bad" />}
      </div>

      <SectionTitle>SAVED SESSION</SectionTitle>
      {session ? (
        <div className="divide-y divide-white/5">
          <Row label="device_id" value={deviceId} />
          <Row label="user_name" value={show(session.user_name)} />
          <Row label="help_need" value={show(session.help_need)} />
          <Row label="gmail_status" value={session.gmail_status} />
          <Row label="gmail_email" value={show(session.gmail_email)} />
          <Row label="gmail_note" value={show(session.gmail_note)} />
          <Row label="agent_name" value={show(session.agent_name)} />
          <Row label="graduated" value={session.graduated ? "true" : "false"} tone={session.graduated ? "ok" : undefined} />
          <Row label="updated_at" value={new Date(session.updated_at).toLocaleTimeString()} />
        </div>
      ) : (
        <div className="text-white/30">not loaded</div>
      )}

      {storeErrors.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-white/45">save errors ({storeErrors.length})</div>
          <ul className="space-y-1">
            {storeErrors.map((e) => (
              <li key={e.id} className="rounded-md bg-[#FF453A]/10 px-2 py-1 text-[#FF8A80]">
                <span className="text-white/35">{new Date(e.at).toLocaleTimeString()} </span>
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SectionTitle>{`TOOL CALLS (${toolCalls.length}/10)`}</SectionTitle>
      {toolCalls.length === 0 ? (
        <div className="text-white/30">none yet</div>
      ) : (
        <ul className="space-y-1">
          {toolCalls.map((t) => (
            <li key={t.id} className="rounded-md bg-white/[0.04] px-2 py-1">
              <div className="flex justify-between gap-2">
                <span className="text-[#64B5FF]">{t.name}</span>
                <span className="text-white/35">{new Date(t.at).toLocaleTimeString()}</span>
              </div>
              <div className="break-all text-white/50">{t.params}</div>
              <div className={cn("break-all", t.result.startsWith("saved") || t.result.startsWith("shown") ? "text-[#30D158]" : "text-[#FFD60A]")}>
                → {t.result}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void handleReset()}
        disabled={isResetting}
        className="press mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF453A]/15 py-[9px] text-[12px] font-semibold text-[#FF6961] disabled:opacity-50"
      >
        <RotateCcw className={cn("h-3.5 w-3.5", isResetting && "animate-spin")} />
        {isResetting ? "Resetting…" : "Reset onboarding"}
      </button>

      <div className="mt-3 text-white/30">All events are also logged to the console with [Persona].</div>
    </div>
  );
});
