import type { PulseAppId } from "@everybenefits/shared";
import {
  isAppHostingPreviewOrigin,
  PRODUCTION_APP_ORIGINS,
} from "@everybenefits/shared";
import { isSafeInternalPath, safeInternalPath } from "./paths";

export function pulseWebUrl() {
  return (
    process.env.NEXT_PUBLIC_PULSE_WEB_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function studioWebUrl() {
  return (
    process.env.NEXT_PUBLIC_STUDIO_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

export function adminWebUrl() {
  return (
    process.env.NEXT_PUBLIC_ADMIN_URL?.replace(/\/$/, "") ||
    "http://localhost:3002"
  );
}

export function paymentsWebUrl() {
  return (
    process.env.NEXT_PUBLIC_PAYMENTS_URL?.replace(/\/$/, "") ||
    "http://localhost:3004"
  );
}

export function appBaseUrl(app: PulseAppId) {
  if (app === "studio") return studioWebUrl();
  if (app === "admin") return adminWebUrl();
  if (app === "payments") return paymentsWebUrl();
  return pulseWebUrl();
}

/** Prefer Pulse as the SSO hub for silent bridges. */
export function siblingApp(app: PulseAppId): PulseAppId {
  if (app !== "pulse") return "pulse";
  return "studio";
}

export function otherApps(current: PulseAppId): PulseAppId[] {
  return (["pulse", "studio", "admin", "payments"] as const).filter(
    (app) => app !== current,
  );
}

/** Canonical account settings path on the Pulse auth hub. */
export const PULSE_ACCOUNT_PATH = "/account";

/**
 * Absolute Pulse login URL that resumes an SSO bridge after credentials.
 * `returnConsumeUrl` must be an allowed sibling `/auth/sso` URL.
 */
export function pulseHubLoginUrl(locale: string, returnConsumeUrl: string) {
  const bridgeNext = `/auth/bridge?return=${encodeURIComponent(returnConsumeUrl)}`;
  return `${pulseWebUrl()}/${locale}/login?next=${encodeURIComponent(bridgeNext)}`;
}

/** Absolute Pulse account URL (optionally with query, e.g. `?section=security`). */
export function pulseAccountUrl(locale: string, accountPath = PULSE_ACCOUNT_PATH) {
  const path = safeInternalPath(accountPath, PULSE_ACCOUNT_PATH);
  return `${pulseWebUrl()}/${locale}${path}`;
}

/**
 * Build a multi-hop logout URL that clears every sibling origin, then lands
 * on `finalUrl` (Firebase Auth sessions are per-origin).
 */
export function buildLogoutCascadeUrl(
  current: PulseAppId,
  locale: string,
  finalUrl: string,
): string {
  const chain = otherApps(current);
  let next = finalUrl;
  for (let i = chain.length - 1; i >= 0; i--) {
    next = logoutCascadeUrl(chain[i]!, locale, next);
  }
  return next;
}

export function allAppOrigins(): Set<string> {
  return new Set([
    new URL(pulseWebUrl()).origin,
    new URL(studioWebUrl()).origin,
    new URL(adminWebUrl()).origin,
    new URL(paymentsWebUrl()).origin,
    ...PRODUCTION_APP_ORIGINS,
  ]);
}

/** Canonical Pulse-family origin check, including App Hosting previews when allowed. */
export function isAllowedAppOrigin(origin: string): boolean {
  try {
    const normalized = new URL(origin).origin;
    if (allAppOrigins().has(normalized)) return true;
    if (!isAppHostingPreviewOrigin(normalized)) return false;
    // Production: previews only when explicitly opted in (SSO handoff risk).
    if (process.env.NODE_ENV === "production") {
      return process.env.PULSE_SSO_ALLOW_PREVIEWS === "true";
    }
    return true;
  } catch {
    return false;
  }
}

/** Absolute SSO consume URL on `app`, with optional post-login path. */
export function ssoConsumeUrl(
  app: PulseAppId,
  locale: string,
  nextPath = "/",
) {
  const next = encodeURIComponent(safeInternalPath(nextPath));
  return `${appBaseUrl(app)}/${locale}/auth/sso?next=${next}`;
}

/** Absolute bridge URL: if this app has a session, hand off to `returnUrl`. */
export function ssoBridgeUrl(
  app: PulseAppId,
  locale: string,
  returnUrl: string,
) {
  return `${appBaseUrl(app)}/${locale}/auth/bridge?return=${encodeURIComponent(returnUrl)}`;
}

export function handoffUrlWithCode(consumeUrl: string, code: string) {
  const url = new URL(consumeUrl.split("#")[0]!);
  // Keep the one-time bearer out of the HTTP request line / server logs.
  // The fragment is available to client JS but is never sent to the server.
  url.searchParams.delete("hc");
  const fragment = new URLSearchParams();
  fragment.set("hc", code);
  url.hash = fragment.toString();
  return url.toString();
}

/** Absolute logout URL on `app`; after signing out, redirects to `nextUrl`. */
export function logoutCascadeUrl(
  app: PulseAppId,
  locale: string,
  nextUrl: string,
) {
  return `${appBaseUrl(app)}/${locale}/auth/logout?next=${encodeURIComponent(nextUrl)}`;
}

function isSsoConsumePath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length === 3 && parts[1] === "auth" && parts[2] === "sso";
}

/**
 * Bridge `return` URLs must target a known Pulse-family origin and exactly
 * the localized `/{locale}/auth/sso` consume route.
 */
export function isAllowedSsoReturnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      isAllowedAppOrigin(parsed.origin) && isSsoConsumePath(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/** Logout `next` may be a safe relative path or any Pulse-family origin. */
export function isAllowedLogoutNext(url: string): boolean {
  try {
    if (isSafeInternalPath(url)) return true;
    const parsed = new URL(url);
    return isAllowedAppOrigin(parsed.origin);
  } catch {
    return false;
  }
}
