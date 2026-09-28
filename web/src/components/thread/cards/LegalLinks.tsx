import { memo } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/** Tiny "Privacy · Terms" links for the Google consent area and under the phone frame. */
export const LegalLinks = memo(function LegalLinks({ className, prefix }: { className?: string; prefix?: string }) {
  return (
    <div className={cn("text-center text-[11px] leading-[15px]", className)}>
      {prefix && <span>{prefix} </span>}
      <Link to="/privacy" className="underline-offset-2 hover:underline">
        Privacy
      </Link>
      <span className="mx-[5px] opacity-60">·</span>
      <Link to="/terms" className="underline-offset-2 hover:underline">
        Terms
      </Link>
    </div>
  );
});
