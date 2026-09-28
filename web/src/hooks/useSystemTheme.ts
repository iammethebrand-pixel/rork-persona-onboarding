import { useEffect } from "react";

/** Mirrors the OS light/dark preference onto <html class="dark">. */
export function useSystemTheme(): void {
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (): void => {
      document.documentElement.classList.toggle("dark", mql.matches);
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
}
