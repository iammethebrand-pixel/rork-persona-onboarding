import { memo, useEffect, useRef } from "react";

interface WaveformProps {
  /** True while Persona is speaking; bars animate. False → flat line. */
  active: boolean;
  /** Live output frequency data (0-255). May return empty/zeros. */
  getFrequencyData: () => Uint8Array;
}

const BAR_COUNT = 31;
const MIN_H = 4;
const MAX_H = 64;

/** Symmetric bar waveform driven by the agent's audio output. */
export const Waveform = memo(function Waveform({ active, getFrequencyData }: WaveformProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const levelsRef = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => 0));
  const activeRef = useRef<boolean>(active);
  activeRef.current = active;
  const getDataRef = useRef(getFrequencyData);
  getDataRef.current = getFrequencyData;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const half = Math.floor(BAR_COUNT / 2);

    const tick = (now: number): void => {
      const t = (now - start) / 1000;
      let data: Uint8Array | null = null;
      if (activeRef.current) {
        try {
          data = getDataRef.current();
        } catch {
          data = null;
        }
      }
      const hasData = !!data && data.length > 0 && data.some((v) => v > 8);

      for (let i = 0; i < BAR_COUNT; i++) {
        const dist = Math.abs(i - half) / half; // 0 center → 1 edge
        const envelope = Math.pow(1 - dist, 1.4) * 0.85 + 0.15;
        let target = 0;
        if (activeRef.current) {
          if (hasData && data) {
            const idx = Math.min(data.length - 1, Math.floor(dist * data.length * 0.6));
            target = (data[idx] / 255) * envelope * 1.25;
          } else {
            // Synthetic voice-like motion when analyser data is unavailable.
            const n =
              Math.sin(t * 7.3 + i * 0.55) * 0.35 + Math.sin(t * 11.1 - i * 0.9) * 0.25 + Math.sin(t * 3.7 + i) * 0.4;
            target = (0.45 + n * 0.5) * envelope;
          }
        }
        const prev = levelsRef.current[i];
        const next = prev + (Math.min(1, Math.max(0, target)) - prev) * (target > prev ? 0.45 : 0.18);
        levelsRef.current[i] = next;
        const el = barsRef.current[i];
        if (el) {
          el.style.height = `${MIN_H + next * (MAX_H - MIN_H)}px`;
          el.style.opacity = `${0.35 + next * 0.65}`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex h-[72px] items-center justify-center gap-[4px]" aria-hidden>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-[4px] rounded-full bg-white"
          style={{ height: MIN_H, opacity: 0.35 }}
        />
      ))}
    </div>
  );
});
