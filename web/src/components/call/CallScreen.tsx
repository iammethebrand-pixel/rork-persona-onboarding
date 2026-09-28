import { Mic, MicOff, Phone } from "lucide-react";
import { memo } from "react";

import { PersonaAvatar } from "@/components/persona/PersonaAvatar";
import type { Caption, CallPhase } from "@/hooks/useVoiceCall";
import { cn } from "@/lib/utils";

import { CallTimer } from "./CallTimer";
import { Waveform } from "./Waveform";

interface CallScreenProps {
  name: string;
  phase: CallPhase;
  isLeaving: boolean;
  connectedAt: number | null;
  captions: Caption[];
  isMuted: boolean;
  isSpeaking: boolean;
  getFrequencyData: () => Uint8Array;
  onToggleMute: () => void;
  onHangUp: () => void;
}

function StatusLine({ phase, connectedAt }: { phase: CallPhase; connectedAt: number | null }) {
  if (phase === "reconnecting") return <span className="text-[#FFD60A]">Reconnecting…</span>;
  if (phase === "connected" && connectedAt) return <CallTimer since={connectedAt} />;
  return <span>Connecting…</span>;
}

/** Screen 2 — full-screen iOS voice call with Persona. */
export const CallScreen = memo(function CallScreen({
  name,
  phase,
  isLeaving,
  connectedAt,
  captions,
  isMuted,
  isSpeaking,
  getFrequencyData,
  onToggleMute,
  onHangUp,
}: CallScreenProps) {
  const isLive = phase === "connected" || phase === "reconnecting";
  const isConnecting = !isLive;
  const speaking = isLive && isSpeaking;

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex flex-col overflow-hidden text-white",
        isLeaving ? "animate-call-out pointer-events-none" : "animate-call-in",
      )}
      role="dialog"
      aria-label={`Voice call with ${name}`}
    >
      {/* Blurred atmospheric background */}
      <div className="absolute inset-0 bg-[#0b0f1a]" />
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute left-[-20%] top-[-10%] h-[70%] w-[90%] rounded-full bg-[#0A84FF] opacity-60 blur-[90px]"
          style={{ animation: "drift-a 14s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[-10%] right-[-25%] h-[60%] w-[90%] rounded-full bg-[#1BC6B4] opacity-35 blur-[100px]"
          style={{ animation: "drift-b 18s ease-in-out infinite" }}
        />
        <div
          className="absolute left-[20%] top-[40%] h-[40%] w-[60%] rounded-full bg-[#3F2BFF] opacity-30 blur-[110px]"
          style={{ animation: "drift-a 22s ease-in-out infinite reverse" }}
        />
      </div>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-2xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" />

      <div
        className="relative flex flex-1 flex-col items-center px-6"
        style={{ paddingTop: "calc(var(--safe-top) + 44px)", paddingBottom: "calc(var(--safe-bottom) + 28px)" }}
      >
        {/* Identity */}
        <div className="relative flex items-center justify-center">
          {isConnecting && (
            <>
              <span className="absolute h-[104px] w-[104px] rounded-full border border-white/40" style={{ animation: "ring-pulse 1.8s ease-out infinite" }} />
              <span className="absolute h-[104px] w-[104px] rounded-full border border-white/30" style={{ animation: "ring-pulse 1.8s 0.6s ease-out infinite" }} />
            </>
          )}
          <div
            className={cn(
              "rounded-full transition-all duration-500",
              speaking ? "scale-[1.04] shadow-[0_0_0_6px_rgba(255,255,255,0.12),0_0_60px_rgba(10,132,255,0.7)]" : "shadow-[0_10px_40px_rgba(0,0,0,0.35)]",
            )}
          >
            <PersonaAvatar size={104} name={name} />
          </div>
        </div>

        <h1 className="mt-5 text-[34px] font-normal leading-[40px] tracking-[0.2px]">{name}</h1>
        <p className="mt-1 text-[17px] text-white/65" aria-live="polite">
          <StatusLine phase={phase} connectedAt={connectedAt} />
        </p>

        {/* Waveform */}
        <div className="mt-10 flex w-full flex-col items-center">
          <Waveform active={speaking} getFrequencyData={getFrequencyData} />
          <span className="mt-3 h-4 text-[12px] font-medium uppercase tracking-[1.4px] text-white/45">
            {isLive ? (speaking ? `${name} is speaking` : isMuted ? "You're muted" : "Listening") : ""}
          </span>
        </div>

        {/* Live captions */}
        <div className="mt-6 flex w-full flex-1 flex-col justify-end gap-2 overflow-hidden" aria-live="polite">
          {captions.map((c, i) => {
            const age = captions.length - 1 - i;
            return (
              <div
                key={c.id}
                className="animate-caption-in transition-opacity duration-500"
                style={{ opacity: age === 0 ? 1 : age === 1 ? 0.6 : 0.32 }}
              >
                <span
                  className={cn(
                    "mr-2 text-[11px] font-semibold uppercase tracking-[1px]",
                    c.role === "agent" ? "text-[#64B5FF]" : "text-white/55",
                  )}
                >
                  {c.role === "agent" ? name : "You"}
                </span>
                <span className="text-[16px] leading-[22px] text-white/95">{c.text}</span>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mt-8 flex w-full items-start justify-center gap-[72px]">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              disabled={!isLive}
              aria-pressed={isMuted}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              className={cn(
                "press flex h-[76px] w-[76px] items-center justify-center rounded-full backdrop-blur-xl disabled:opacity-40",
                isMuted ? "bg-white text-black" : "bg-white/[0.18] text-white",
              )}
            >
              {isMuted ? <MicOff className="h-[30px] w-[30px]" strokeWidth={2.2} /> : <Mic className="h-[30px] w-[30px]" strokeWidth={2.2} />}
            </button>
            <span className="text-[13px] font-medium text-white/85">mute</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onHangUp}
              aria-label="Hang up"
              className="press flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-[0_8px_30px_-6px_rgba(255,59,48,0.7)] active:bg-[#d93228]"
            >
              <Phone className="h-[32px] w-[32px] rotate-[135deg]" fill="currentColor" strokeWidth={0} />
            </button>
            <span className="text-[13px] font-medium text-white/85">end</span>
          </div>
        </div>
      </div>
    </div>
  );
});
