import { memo } from "react";

import { cn } from "@/lib/utils";

interface PersonaAvatarProps {
  size: number;
  className?: string;
  /** Display name; the avatar shows its first letter (defaults to "P"). */
  name?: string;
}

/** Round monogram in Persona's brand gradient. */
export const PersonaAvatar = memo(function PersonaAvatar({ size, className, name }: PersonaAvatarProps) {
  const letter = (name?.trim().charAt(0) || "P").toUpperCase();
  return (
    <div
      aria-hidden
      className={cn("relative shrink-0 select-none overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(160deg, #7CC4FF 0%, #2F8CFF 45%, #0A5BFF 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 16px rgba(0,30,120,0.25)",
      }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold text-white"
        style={{ fontSize: size * 0.46, letterSpacing: -0.5, textShadow: "0 1px 2px rgba(0,40,140,0.35)" }}
      >
        {letter}
      </span>
    </div>
  );
});
