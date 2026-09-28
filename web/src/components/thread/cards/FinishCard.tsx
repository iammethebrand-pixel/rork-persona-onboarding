import { Sparkles } from "lucide-react";
import { memo } from "react";

import { PersonaAvatar } from "@/components/persona/PersonaAvatar";
import type { GmailStatus, OnboardingSession } from "@/types/onboarding";

import { GmailConnectedBadge } from "./GmailConnectedBadge";
import { GoogleConnectButton } from "./GoogleConnectButton";

interface FinishCardProps {
  cardId: string;
  agentName: string;
  session: OnboardingSession | null;
}

const GMAIL_LABELS: Record<GmailStatus, string> = {
  unknown: "Not set up",
  pending: "Connect requested",
  connected: "Connected",
  declined: "Skipped for now",
  other_provider: "Other provider",
  later: "Later",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <span className="shrink-0 text-[13px] text-[hsl(var(--im-secondary))]">{label}</span>
      <span className="min-w-0 text-right text-[14px] font-medium leading-[18px] text-[hsl(var(--im-label))]">{value}</span>
    </div>
  );
}

/** Summary card shown when onboarding graduates. */
export const FinishCard = memo(function FinishCard({ cardId, agentName, session }: FinishCardProps) {
  const status = session?.gmail_status ?? "unknown";
  const firstName = session?.user_name?.trim();

  return (
    <div className="animate-bubble-in px-4 pt-2">
      <div className="w-[276px] overflow-hidden rounded-[20px] border border-[hsl(var(--im-separator)/0.8)] bg-[hsl(var(--im-bubble))]">
        <div className="relative overflow-hidden px-[14px] pb-[14px] pt-[14px] text-white">
          <div className="absolute inset-0 bg-[linear-gradient(150deg,#0A84FF_0%,#1BC6B4_100%)]" />
          <div className="absolute -right-6 -top-10 h-[120px] w-[120px] rounded-full bg-white/20 blur-2xl" />
          <div className="relative flex items-center gap-[10px]">
            <PersonaAvatar size={40} name={agentName} className="ring-2 ring-white/60" />
            <div className="min-w-0">
              <div className="flex items-center gap-[5px] text-[11px] font-semibold uppercase tracking-[1.2px] text-white/80">
                <Sparkles className="h-[11px] w-[11px]" strokeWidth={2.6} />
                All set
              </div>
              <div className="truncate text-[17px] font-semibold leading-[22px] tracking-[-0.3px]">
                {firstName ? `You're ready, ${firstName}` : "You're ready"}
              </div>
            </div>
          </div>
        </div>

        <div className="divide-y divide-[hsl(var(--im-separator)/0.7)] px-[14px] pt-[2px]">
          <Row label="Name" value={firstName || "—"} />
          <Row label="Help with" value={session?.help_need?.trim() || "—"} />
          <Row label="Gmail" value={status === "connected" && session?.gmail_email ? session.gmail_email : GMAIL_LABELS[status]} />
          <Row label="Assistant" value={agentName} />
        </div>

        <div className="px-[14px] pb-[12px] pt-[6px]">
          {status === "connected" ? (
            <GmailConnectedBadge email={session?.gmail_email ?? null} />
          ) : (
            <GoogleConnectButton cardId={cardId} width={248} />
          )}
        </div>
      </div>
    </div>
  );
});
