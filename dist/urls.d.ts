import type { PulseAppId } from "@everybenefits/shared";
export declare function pulseWebUrl(): string;
export declare function studioWebUrl(): string;
export declare function adminWebUrl(): string;
export declare function paymentsWebUrl(): string;
export declare function appBaseUrl(app: PulseAppId): string;
/** Prefer Pulse as the SSO hub for silent bridges. */
export declare function siblingApp(app: PulseAppId): PulseAppId;
export declare function otherApps(current: PulseAppId): PulseAppId[];
/** Canonical account settings path on the Pulse auth hub. */
export declare const PULSE_ACCOUNT_PATH = "/account";
/**
 * Absolute Pulse login URL that resumes an SSO bridge after credentials.
 * `returnConsumeUrl` must be an allowed sibling `/auth/sso` URL.
 */
export declare function pulseHubLoginUrl(locale: string, returnConsumeUrl: string): string;
/** Absolute Pulse account URL (optionally with query, e.g. `?section=security`). */
export declare function pulseAccountUrl(locale: string, accountPath?: string): string;
/**
 * Build a multi-hop logout URL that clears every sibling origin, then lands
 * on `finalUrl` (Firebase Auth sessions are per-origin).
 */
export declare function buildLogoutCascadeUrl(current: PulseAppId, locale: string, finalUrl: string): string;
export declare function allAppOrigins(): Set<string>;
/** Canonical Pulse-family origin check, including App Hosting previews when allowed. */
export declare function isAllowedAppOrigin(origin: string): boolean;
/** Absolute SSO consume URL on `app`, with optional post-login path. */
export declare function ssoConsumeUrl(app: PulseAppId, locale: string, nextPath?: string): string;
/** Absolute bridge URL: if this app has a session, hand off to `returnUrl`. */
export declare function ssoBridgeUrl(app: PulseAppId, locale: string, returnUrl: string): string;
export declare function handoffUrlWithCode(consumeUrl: string, code: string): string;
/** Absolute logout URL on `app`; after signing out, redirects to `nextUrl`. */
export declare function logoutCascadeUrl(app: PulseAppId, locale: string, nextUrl: string): string;
/**
 * Bridge `return` URLs must target a known Pulse-family origin and exactly
 * the localized `/{locale}/auth/sso` consume route.
 */
export declare function isAllowedSsoReturnUrl(url: string): boolean;
/** Logout `next` may be a safe relative path or any Pulse-family origin. */
export declare function isAllowedLogoutNext(url: string): boolean;
//# sourceMappingURL=urls.d.ts.map