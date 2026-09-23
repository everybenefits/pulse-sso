"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSsoHandoffUrl = buildSsoHandoffUrl;
exports.exchangeHandoffCode = exchangeHandoffCode;
exports.resolveSwitchUrl = resolveSwitchUrl;
exports.takeHandoffCode = takeHandoffCode;
exports.clearHandoffCodeStash = clearHandoffCodeStash;
exports.readStashedCustomToken = readStashedCustomToken;
exports.stashCustomToken = stashCustomToken;
exports.clearStashedCustomToken = clearStashedCustomToken;
exports.markSsoAttempted = markSsoAttempted;
exports.hasSsoAttempted = hasSsoAttempted;
exports.clearSsoAttempt = clearSsoAttempt;
exports.asSsoClientError = asSsoClientError;
const constants_1 = require("./constants");
const errors_1 = require("./errors");
const urls_1 = require("./urls");
async function appCheckHeaders(getAppCheckToken) {
    const headers = {
        "Content-Type": "application/json",
    };
    if (!getAppCheckToken)
        return headers;
    try {
        const token = await getAppCheckToken();
        if (token)
            headers["x-firebase-appcheck"] = token;
    }
    catch {
        // Optional when App Check is not enforced locally.
    }
    return headers;
}
async function readErrorBody(res) {
    return (await res.json().catch(() => null));
}
function throwFromResponse(res, payload, fallback) {
    const code = (0, errors_1.parseSsoErrorCode)(payload?.code);
    throw new errors_1.SsoClientError(code === "unknown" && res.status === 429 ? "rate-limited" : code, payload?.error ?? fallback, res.status);
}
/**
 * Mint an opaque handoff code on this origin, then build the sibling consume URL.
 * Never puts the Firebase ID token in the query string.
 */
async function buildSsoHandoffUrl(consumeUrl, idToken, getAppCheckToken) {
    let res;
    try {
        res = await fetch("/api/auth/create-sso-handoff", {
            method: "POST",
            headers: await appCheckHeaders(getAppCheckToken),
            body: JSON.stringify({ idToken }),
        });
    }
    catch {
        throw new errors_1.SsoClientError("network", "Network error creating SSO handoff");
    }
    if (!res.ok) {
        throwFromResponse(res, await readErrorBody(res), `handoff failed (${res.status})`);
    }
    const data = (await res.json());
    if (!data.code ||
        data.code.length < constants_1.CODE_MIN_LEN ||
        data.code.length > constants_1.CODE_MAX_LEN) {
        throw new errors_1.SsoClientError("unknown", "handoff code missing");
    }
    return (0, urls_1.handoffUrlWithCode)(consumeUrl, data.code);
}
async function exchangeHandoffCode(code, getAppCheckToken) {
    let res;
    try {
        res = await fetch("/api/auth/exchange-sso", {
            method: "POST",
            headers: await appCheckHeaders(getAppCheckToken),
            body: JSON.stringify({ code }),
        });
    }
    catch {
        throw new errors_1.SsoClientError("network", "Network error exchanging SSO handoff");
    }
    if (!res.ok) {
        throwFromResponse(res, await readErrorBody(res), `exchange failed (${res.status})`);
    }
    const data = (await res.json());
    if (!data.customToken) {
        throw new errors_1.SsoClientError("unknown", "customToken missing");
    }
    return data.customToken;
}
/**
 * Resolve navigation URL when switching apps.
 * Signed-in users always use SSO handoff (throws on failure — no silent fallback).
 * Signed-out users get a plain destination URL.
 */
async function resolveSwitchUrl(opts) {
    const idToken = await opts.getIdToken();
    if (!idToken) {
        return `${(0, urls_1.appBaseUrl)(opts.target)}/${opts.locale}${opts.homePath}`;
    }
    const consume = (0, urls_1.ssoConsumeUrl)(opts.target, opts.locale, opts.homePath);
    return buildSsoHandoffUrl(consume, idToken, opts.getAppCheckToken);
}
/**
 * Read the opaque handoff code from the URL fragment. Legacy `?hc=` links are
 * still accepted during rolling deploys. Stashes in sessionStorage for Strict Mode
 * and strips all bearer/legacy token material from the visible URL immediately.
 *
 * Prefer a fresh URL handoff over any stashed leftover — a failed exchange must
 * not block the next handoff URL.
 */
function takeHandoffCode() {
    if (typeof window === "undefined")
        return null;
    const url = new URL(window.location.href);
    let dirty = false;
    if (url.searchParams.has("ht")) {
        url.searchParams.delete("ht");
        dirty = true;
    }
    const rawHash = url.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(rawHash);
    const fromHash = hashParams.get("hc");
    const fromQuery = url.searchParams.get("hc");
    const valid = (value) => value && value.length >= constants_1.CODE_MIN_LEN && value.length <= constants_1.CODE_MAX_LEN
        ? value
        : null;
    // New protocol uses #hc. Keep ?hc during rolling deploys / old links.
    const fromUrl = valid(fromHash) ?? valid(fromQuery);
    if (url.searchParams.has("hc")) {
        url.searchParams.delete("hc");
        dirty = true;
    }
    if (rawHash.includes("idToken=")) {
        // Never retain the legacy ID-token fragment.
        url.hash = "";
        dirty = true;
    }
    else if (hashParams.has("hc")) {
        hashParams.delete("hc");
        url.hash = hashParams.toString();
        dirty = true;
    }
    if (fromUrl) {
        try {
            sessionStorage.setItem(constants_1.SSO_CODE_STASH_KEY, fromUrl);
        }
        catch {
            // ignore
        }
        if (dirty) {
            window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
        return fromUrl;
    }
    if (dirty) {
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    try {
        const stashed = sessionStorage.getItem(constants_1.SSO_CODE_STASH_KEY);
        if (stashed &&
            stashed.length >= constants_1.CODE_MIN_LEN &&
            stashed.length <= constants_1.CODE_MAX_LEN) {
            return stashed;
        }
    }
    catch {
        // ignore
    }
    return null;
}
function clearHandoffCodeStash() {
    try {
        sessionStorage.removeItem(constants_1.SSO_CODE_STASH_KEY);
    }
    catch {
        // ignore
    }
}
function readStashedCustomToken() {
    try {
        const token = sessionStorage.getItem(constants_1.SSO_CUSTOM_TOKEN_KEY);
        return token && token.length > 20 ? token : null;
    }
    catch {
        return null;
    }
}
function stashCustomToken(token) {
    try {
        sessionStorage.setItem(constants_1.SSO_CUSTOM_TOKEN_KEY, token);
    }
    catch {
        // ignore
    }
}
function clearStashedCustomToken() {
    try {
        sessionStorage.removeItem(constants_1.SSO_CUSTOM_TOKEN_KEY);
    }
    catch {
        // ignore
    }
}
function markSsoAttempted() {
    try {
        sessionStorage.setItem(constants_1.SSO_ATTEMPT_KEY, "1");
    }
    catch {
        // ignore
    }
}
function hasSsoAttempted() {
    try {
        return sessionStorage.getItem(constants_1.SSO_ATTEMPT_KEY) === "1";
    }
    catch {
        return false;
    }
}
function clearSsoAttempt() {
    try {
        sessionStorage.removeItem(constants_1.SSO_ATTEMPT_KEY);
        sessionStorage.removeItem(constants_1.SSO_CODE_STASH_KEY);
        sessionStorage.removeItem(constants_1.SSO_LEGACY_HT_KEY);
    }
    catch {
        // ignore
    }
}
function asSsoClientError(error) {
    if (error instanceof errors_1.SsoClientError)
        return error;
    if (error instanceof Error && error.message === "missing-token") {
        return new errors_1.SsoClientError("missing-token", error.message);
    }
    const code = error?.ssoCode;
    if (code) {
        return new errors_1.SsoClientError((0, errors_1.parseSsoErrorCode)(code), error instanceof Error ? error.message : "SSO failed", error.status);
    }
    return new errors_1.SsoClientError("unknown", error instanceof Error ? error.message : "SSO failed");
}
