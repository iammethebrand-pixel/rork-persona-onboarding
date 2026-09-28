import { ExternalLink, Loader2 } from "lucide-react";
import { memo, useEffect, useRef } from "react";

import { LIVE_APP_URL } from "@/lib/googleConfig";
import { useGoogleSignIn } from "@/state/GoogleSignInProvider";

interface GoogleConnectButtonProps {
  /** The thread message id of the card hosting this button. */
  cardId: string;
  /** Pixel width of Google's rendered button (200–400). */
  width: number;
}

/**
 * Google's own rendered "Continue with Google" button (a real tap target, so iPhone Safari
 * never blocks the popup). Falls back to a live-link hint where Google won't allow sign-in.
 */
export const GoogleConnectButton = memo(function GoogleConnectButton({ cardId, width }: GoogleConnectButtonProps) {
  const { isAllowedHost, isButtonReady, status, activeCardId, notice, renderButton } = useGoogleSignIn();
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !isButtonReady) return;
    renderButton(el, cardId, width);
  }, [cardId, isButtonReady, renderButton, width]);

  if (!isAllowedHost) {
    return (
      <a
        href={LIVE_APP_URL}
        target="_blank"
        rel="noreferrer"
        className="press flex h-[40px] w-full items-center justify-center gap-[6px] rounded-full border border-[hsl(var(--im-separator))] bg-[hsl(var(--im-bg))] px-3 text-[13px] font-semibold tracking-[-0.1px] text-[hsl(var(--im-secondary))]"
      >
        Gmail connect works on the live link
        <ExternalLink className="h-[13px] w-[13px]" strokeWidth={2.4} />
      </a>
    );
  }

  const isThisCard = activeCardId === cardId;
  const isVerifying = status === "verifying" && isThisCard;
  const cardNotice = notice?.cardId === cardId ? notice : null;

  return (
    <div className="w-full">
      <div className="relative flex h-[40px] w-full items-center justify-center">
        {!isButtonReady && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-full bg-[#131314] text-[13px] font-medium text-white/60">
            {status === "load-failed" ? (
              "Google sign-in couldn't load. Refresh to try again."
            ) : (
              <>
                <Loader2 className="h-[14px] w-[14px] animate-spin" />
                Loading Google…
              </>
            )}
          </div>
        )}
        <div
          ref={hostRef}
          className="flex h-[40px] w-full items-center justify-center overflow-hidden rounded-full [color-scheme:normal]"
          style={{ visibility: isButtonReady && !isVerifying ? "visible" : "hidden" }}
        />
        {isVerifying && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-full bg-[#131314] text-[14px] font-medium text-white">
            <Loader2 className="h-[15px] w-[15px] animate-spin" />
            Connecting…
          </div>
        )}
      </div>
      {cardNotice && (
        <div className="animate-caption-in mt-[7px] text-center text-[12px] leading-[16px] text-[hsl(var(--im-secondary))]">
          {cardNotice.text}
          {cardNotice.detail && <div className="mt-[2px] text-[11px] opacity-80">{cardNotice.detail}</div>}
        </div>
      )}
    </div>
  );
});
