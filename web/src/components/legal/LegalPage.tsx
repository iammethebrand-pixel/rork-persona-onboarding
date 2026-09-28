import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";

interface LegalPageProps {
  title: string;
  updated: string;
  children: ReactNode;
}

/** Shared dark layout for the Privacy and Terms pages. */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Persona`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#07080b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-280px] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(10,132,255,0.18),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
      </div>

      <main
        className="relative mx-auto w-full max-w-[640px] px-6 pb-16"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)" }}
      >
        <Link
          to="/"
          className="press -ml-2 inline-flex items-center gap-[2px] rounded-full px-2 py-1 text-[15px] font-medium text-[#0A84FF]"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.6} />
          Persona
        </Link>

        <h1 className="mt-6 text-[34px] font-bold leading-[40px] tracking-[-0.8px]">{title}</h1>
        <p className="mt-2 text-[13px] text-white/40">Last updated {updated}</p>

        <div className="mt-8 space-y-7 text-[16px] leading-[25px] text-white/75 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:tracking-[-0.2px] [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
          {children}
        </div>

        <div className="mt-14 flex items-center gap-4 border-t border-white/10 pt-6 text-[13px] text-white/40">
          <Link to="/privacy" className="hover:text-white/70">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-white/70">
            Terms
          </Link>
          <span className="ml-auto">Persona · onboarding demo</span>
        </div>
      </main>
    </div>
  );
}
