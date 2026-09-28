import { Check } from "lucide-react";
import { memo } from "react";

/** Connected state: green check, "Gmail connected" and the address. */
export const GmailConnectedBadge = memo(function GmailConnectedBadge({ email }: { email: string | null }) {
  return (
    <div className="animate-bubble-in flex items-center gap-[10px] rounded-[14px] bg-[hsl(var(--im-green)/0.12)] px-[10px] py-[9px]">
      <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[hsl(var(--im-green))] shadow-[0_3px_10px_-2px_hsl(var(--im-green)/0.6)]">
        <Check className="h-[16px] w-[16px] text-white" strokeWidth={3.2} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold leading-[18px] tracking-[-0.2px] text-[hsl(var(--im-green))]">Gmail connected</div>
        {email && <div className="truncate text-[13px] leading-[17px] text-[hsl(var(--im-label))]">{email}</div>}
      </div>
    </div>
  );
});
