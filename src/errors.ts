import type { SsoErrorCode, SsoMessageKey } from "./types";

export class SsoClientError extends Error {
  constructor(
    readonly code: SsoErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SsoClientError";
  }
}

const KNOWN_CODES = new Set<SsoErrorCode>([
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

export function isSsoErrorCode(value: unknown): value is SsoErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value as SsoErrorCode);
}

export function parseSsoErrorCode(value: unknown): SsoErrorCode {
  return isSsoErrorCode(value) ? value : "unknown";
}

/** Map structured codes to next-intl keys. */
export function ssoMessageKeyForCode(code: SsoErrorCode): SsoMessageKey {
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
