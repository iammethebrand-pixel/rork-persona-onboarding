import { Mail } from "lucide-react";
import { memo } from "react";

import type { GmailStatus } from "@/types/onboarding";

import { GmailConnectedBadge } from "./GmailConnectedBadge";
import { GoogleConnectButton } from "./GoogleConnectButton";
import { LegalLinks } from "./LegalLinks";

interface GmailConnectCardProps {
  cardId: string;
  status: GmailStatus;
  email: string | null;
  onDecline: () => void;
}

function statusCaption(status: GmailStatus): string | null {
  switch (status) {
    case "declined":
      return "Skipped for now";
    case "other_provider":
      return "Using another email provider";
    case "later":
      return "Maybe later";
    default:
      return null;
  }
}

/** Rich iMessage-style card Persona drops in when it wants the user's Gmail. */
export const GmailConnectCard = memo(function GmailConnectCard({ cardId, status, email, onDecline }: GmailConnectCardProps) {
  const isConnected = status === "connected";
  const caption = statusCaption(status);

  return (
    <div className="animate-bubble-in px-4 pt-2">
      <div className="w-[268px] overflow-hidden rounded-[20px] border border-[hsl(var(--im-separator)/0.8)] bg-[hsl(var(--im-bubble))]">
        <div className="relative flex h-[92px] items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#EA4335_0%,#FBBC04_38%,#34A853_68%,#4285F4_100%)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_60%)]" />
          <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.18)]">
            <Mail className="h-[28px] w-[28px] text-[#EA4335]" strokeWidth={2.2} />
          </div>
        </div>

        <div className="px-[14px] pb-[12px] pt-[10px]">
          <div className="text-[16px] font-semibold leading-[21px] tracking-[-0.3px] text-[hsl(var(--im-label))]">Connect Gmail</div>
          <div className="mt-[2px] text-[13px] leading-[17px] text-[hsl(var(--im-secondary))]">
            Sign in with Google so Persona knows your email. Only your name and email are shared.
          </div>

          {isConnected ? (
            <div className="mt-[10px]">
              <GmailConnectedBadge email={email} />
            </div>
          ) : (
            <>
              {caption && <div className="mt-[8px] text-[12px] font-semibold text-[hsl(var(--im-secondary))]">{caption}</div>}
              <div className="mt-[10px] flex flex-col gap-2">
                <GoogleConnectButton cardId={cardId} width={240} />
                {status !== "declined" && (
                  <button
                    type="button"
                    onClick={onDecline}
                    className="press flex h-[34px] w-full items-center justify-center rounded-full border border-[hsl(var(--im-separator))] bg-[hsl(var(--im-bg))] text-[15px] font-semibold tracking-[-0.2px] text-[hsl(var(--im-blue))]"
                  >
                    Not now
                  </button>
                )}
              </div>
              <LegalLinks className="mt-[8px] text-[hsl(var(--im-secondary))]" />
            </>
          )}
        </div>
      </div>
    </div>
  );
});
