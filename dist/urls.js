"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PULSE_ACCOUNT_PATH = void 0;
exports.pulseWebUrl = pulseWebUrl;
exports.studioWebUrl = studioWebUrl;
exports.adminWebUrl = adminWebUrl;
exports.paymentsWebUrl = paymentsWebUrl;
exports.appBaseUrl = appBaseUrl;
exports.siblingApp = siblingApp;
exports.otherApps = otherApps;
exports.pulseHubLoginUrl = pulseHubLoginUrl;
exports.pulseAccountUrl = pulseAccountUrl;
exports.buildLogoutCascadeUrl = buildLogoutCascadeUrl;
exports.allAppOrigins = allAppOrigins;
exports.isAllowedAppOrigin = isAllowedAppOrigin;
exports.ssoConsumeUrl = ssoConsumeUrl;
exports.ssoBridgeUrl = ssoBridgeUrl;
exports.handoffUrlWithCode = handoffUrlWithCode;
exports.logoutCascadeUrl = logoutCascadeUrl;
exports.isAllowedSsoReturnUrl = isAllowedSsoReturnUrl;
exports.isAllowedLogoutNext = isAllowedLogoutNext;
const shared_1 = require("@everybenefits/shared");
const paths_1 = require("./paths");
function pulseWebUrl() {
    return (process.env.NEXT_PUBLIC_PULSE_WEB_URL?.replace(/\/$/, "") ||
        "http://localhost:3000");
}
function studioWebUrl() {
    return (process.env.NEXT_PUBLIC_STUDIO_URL?.replace(/\/$/, "") ||
        "http://localhost:3001");
}
function adminWebUrl() {
    return (process.env.NEXT_PUBLIC_ADMIN_URL?.replace(/\/$/, "") ||
        "http://localhost:3002");
}
function paymentsWebUrl() {
    return (process.env.NEXT_PUBLIC_PAYMENTS_URL?.replace(/\/$/, "") ||
        "http://localhost:3004");
}
function appBaseUrl(app) {
    if (app === "studio")
        return studioWebUrl();
    if (app === "admin")
        return adminWebUrl();
    if (app === "payments")
        return paymentsWebUrl();
    return pulseWebUrl();
}
/** Prefer Pulse as the SSO hub for silent bridges. */
function siblingApp(app) {
    if (app !== "pulse")
        return "pulse";
    return "studio";
}
function otherApps(current) {
    return ["pulse", "studio", "admin", "payments"].filter((app) => app !== current);
}
/** Canonical account settings path on the Pulse auth hub. */
exports.PULSE_ACCOUNT_PATH = "/account";
/**
 * Absolute Pulse login URL that resumes an SSO bridge after credentials.
 * `returnConsumeUrl` must be an allowed sibling `/auth/sso` URL.
 */
function pulseHubLoginUrl(locale, returnConsumeUrl) {
    const bridgeNext = `/auth/bridge?return=${encodeURIComponent(returnConsumeUrl)}`;
    return `${pulseWebUrl()}/${locale}/login?next=${encodeURIComponent(bridgeNext)}`;
}
/** Absolute Pulse account URL (optionally with query, e.g. `?section=security`). */
function pulseAccountUrl(locale, accountPath = exports.PULSE_ACCOUNT_PATH) {
    const path = (0, paths_1.safeInternalPath)(accountPath, exports.PULSE_ACCOUNT_PATH);
    return `${pulseWebUrl()}/${locale}${path}`;
}
/**
 * Build a multi-hop logout URL that clears every sibling origin, then lands
 * on `finalUrl` (Firebase Auth sessions are per-origin).
 */
function buildLogoutCascadeUrl(current, locale, finalUrl) {
    const chain = otherApps(current);
    let next = finalUrl;
    for (let i = chain.length - 1; i >= 0; i--) {
        next = logoutCascadeUrl(chain[i], locale, next);
    }
    return next;
}
function allAppOrigins() {
    return new Set([
        new URL(pulseWebUrl()).origin,
        new URL(studioWebUrl()).origin,
        new URL(adminWebUrl()).origin,
        new URL(paymentsWebUrl()).origin,
        ...shared_1.PRODUCTION_APP_ORIGINS,
    ]);
}
/** Canonical Pulse-family origin check, including App Hosting previews. */
function isAllowedAppOrigin(origin) {
    try {
        const normalized = new URL(origin).origin;
        return (allAppOrigins().has(normalized) ||
            (0, shared_1.isAppHostingPreviewOrigin)(normalized));
    }
    catch {
        return false;
    }
}
/** Absolute SSO consume URL on `app`, with optional post-login path. */
function ssoConsumeUrl(app, locale, nextPath = "/") {
    const next = encodeURIComponent((0, paths_1.safeInternalPath)(nextPath));
    return `${appBaseUrl(app)}/${locale}/auth/sso?next=${next}`;
}
/** Absolute bridge URL: if this app has a session, hand off to `returnUrl`. */
function ssoBridgeUrl(app, locale, returnUrl) {
    return `${appBaseUrl(app)}/${locale}/auth/bridge?return=${encodeURIComponent(returnUrl)}`;
}
function handoffUrlWithCode(consumeUrl, code) {
    const url = new URL(consumeUrl.split("#")[0]);
    // Keep the one-time bearer out of the HTTP request line / server logs.
    // The fragment is available to client JS but is never sent to the server.
    url.searchParams.delete("hc");
    const fragment = new URLSearchParams();
    fragment.set("hc", code);
    url.hash = fragment.toString();
    return url.toString();
}
/** Absolute logout URL on `app`; after signing out, redirects to `nextUrl`. */
function logoutCascadeUrl(app, locale, nextUrl) {
    return `${appBaseUrl(app)}/${locale}/auth/logout?next=${encodeURIComponent(nextUrl)}`;
}
function isSsoConsumePath(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    return parts.length === 3 && parts[1] === "auth" && parts[2] === "sso";
}
/**
 * Bridge `return` URLs must target a known Pulse-family origin and exactly
 * the localized `/{locale}/auth/sso` consume route.
 */
function isAllowedSsoReturnUrl(url) {
    try {
        const parsed = new URL(url);
        return (isAllowedAppOrigin(parsed.origin) && isSsoConsumePath(parsed.pathname));
    }
    catch {
        return false;
    }
}
/** Logout `next` may be a safe relative path or any Pulse-family origin. */
function isAllowedLogoutNext(url) {
    try {
        if ((0, paths_1.isSafeInternalPath)(url))
            return true;
        const parsed = new URL(url);
        return isAllowedAppOrigin(parsed.origin);
    }
    catch {
        return false;
    }
}
