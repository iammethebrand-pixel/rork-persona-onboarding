import { type ReactNode, useEffect, useState } from "react";

import { LegalLinks } from "@/components/thread/cards/LegalLinks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { StatusBar } from "./StatusBar";

interface PhoneFrameProps {
  children: ReactNode;
  statusBarTone: "auto" | "light";
}

const FRAME_W = 390;
const FRAME_H = 844;
const BEZEL = 12;

/** Scales the framed phone down to fit short desktop viewports. */
function useFitScale(): number {
  const [scale, setScale] = useState<number>(1);
  useEffect(() => {
    const update = (): void => {
      const available = window.innerHeight - 120;
      setScale(Math.min(1, available / (FRAME_H + BEZEL * 2)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

/**
 * Desktop: centers an iPhone-sized device with dark bezel, Dynamic Island,
 * status bar and home indicator. Mobile: renders children full screen.
 */
export function PhoneFrame({ children, statusBarTone }: PhoneFrameProps) {
  const isMobile = useIsMobile();
  const scale = useFitScale();

  if (isMobile) {
    return <div className="relative h-[100dvh] w-full overflow-hidden bg-[hsl(var(--im-bg))]">{children}</div>;
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-[#07080b]">
      {/* Atmospheric backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(10,132,255,0.22),transparent)]" />
        <div className="absolute -left-40 bottom-[-20%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(48,209,88,0.08),transparent)]" />
        <div className="absolute -right-40 top-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(94,92,230,0.10),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <div
        style={{
          width: FRAME_W + BEZEL * 2,
          height: FRAME_H + BEZEL * 2,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          marginTop: -((FRAME_H + BEZEL * 2) * (1 - scale)) / 2,
          marginBottom: -((FRAME_H + BEZEL * 2) * (1 - scale)) / 2,
        }}
        className="relative shrink-0"
      >
        {/* Side buttons */}
        <div className="absolute -left-[3px] top-[170px] h-[32px] w-[4px] rounded-l bg-[#2a2b2f]" />
        <div className="absolute -left-[3px] top-[228px] h-[62px] w-[4px] rounded-l bg-[#2a2b2f]" />
        <div className="absolute -left-[3px] top-[302px] h-[62px] w-[4px] rounded-l bg-[#2a2b2f]" />
        <div className="absolute -right-[3px] top-[250px] h-[96px] w-[4px] rounded-r bg-[#2a2b2f]" />

        <div
          className="relative h-full w-full rounded-[62px] bg-[#111214] shadow-[0_0_0_1.5px_#3a3b40,0_40px_120px_-20px_rgba(0,0,0,0.9),0_0_80px_rgba(10,132,255,0.08)]"
          style={{ padding: BEZEL }}
        >
          <div
            className="relative h-full w-full overflow-hidden rounded-[50px] bg-[hsl(var(--im-bg))]"
            style={{ ["--safe-top" as string]: "54px", ["--safe-bottom" as string]: "30px" }}
          >
            {children}
            <StatusBar tone={statusBarTone} />
            {/* Dynamic Island */}
            <div className="pointer-events-none absolute left-1/2 top-[11px] z-[70] h-[35px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
            {/* Home indicator */}
            <div
              className={cn(
                "pointer-events-none absolute bottom-[8px] left-1/2 z-[70] h-[5px] w-[136px] -translate-x-1/2 rounded-full transition-colors duration-300",
                statusBarTone === "light" ? "bg-white/90" : "bg-[hsl(var(--im-label))]",
              )}
            />
          </div>
        </div>
      </div>

      <div className="relative mt-7 flex flex-col items-center gap-1 text-center">
        <p className="text-[13px] font-medium tracking-[-0.1px] text-white/70">Persona · onboarding simulator</p>
        <p className="text-[12px] text-white/35">Tap “Persona” three times for the debug panel</p>
        <LegalLinks className="mt-1 text-[12px] text-white/40 [&_a:hover]:text-white/70" />
      </div>
    </div>
  );
}
