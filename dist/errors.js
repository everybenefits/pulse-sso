"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsoClientError = void 0;
exports.isSsoErrorCode = isSsoErrorCode;
exports.parseSsoErrorCode = parseSsoErrorCode;
exports.ssoMessageKeyForCode = ssoMessageKeyForCode;
class SsoClientError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = "SsoClientError";
    }
}
exports.SsoClientError = SsoClientError;
const KNOWN_CODES = new Set([
    "appcheck-missing",
    "appcheck-invalid",
    "rate-limited",
    "idToken-required",
    "invalid-token",
    "code-required",
    "invalid-code",
    "account-disabled",
    "origin-not-allowed",
    "network",
    "missing-token",
    "unknown",
]);
function isSsoErrorCode(value) {
    return typeof value === "string" && KNOWN_CODES.has(value);
}
function parseSsoErrorCode(value) {
    return isSsoErrorCode(value) ? value : "unknown";
}
/** Map structured codes to next-intl keys. */
function ssoMessageKeyForCode(code) {
    switch (code) {
        case "missing-token":
            return "ssoMissingToken";
        case "rate-limited":
            return "ssoRateLimited";
        case "appcheck-missing":
        case "appcheck-invalid":
            return "ssoAppCheckFailed";
        case "account-disabled":
            return "ssoAccountDisabled";
        default:
            return "ssoFailed";
    }
}
