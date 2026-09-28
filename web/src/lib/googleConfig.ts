/** Public Google OAuth Web Client ID (not a secret). Override with VITE_GOOGLE_CLIENT_ID if needed. */
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
  "345280845969-cibe7ofokq0nkohc2prhisirefhvd6gt.apps.googleusercontent.com";

/** The published link, where Google sign-in is allowed. */
export const LIVE_APP_URL = "https://l7x78jcck9n7cckicem8x-web.rork.live";

export const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";

/**
 * Hosts registered as Authorized JavaScript origins on the Google client.
 * Extra hosts can be added with VITE_GOOGLE_ALLOWED_HOSTS (comma separated).
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>([new URL(LIVE_APP_URL).hostname, "localhost", "127.0.0.1"]);
  const extra = (import.meta.env.VITE_GOOGLE_ALLOWED_HOSTS as string | undefined) ?? "";
  extra
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .forEach((h) => hosts.add(h));
  return hosts;
}

/** True when Google will accept sign-in from this page's origin (false in the editor preview). */
export function isGoogleSignInAllowedHost(hostname: string = window.location.hostname): boolean {
  return allowedHosts().has(hostname.toLowerCase());
}
