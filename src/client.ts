import type { PulseAppId } from "@everybenefits/shared";
import {
  CODE_MAX_LEN,
  CODE_MIN_LEN,
  SSO_ATTEMPT_KEY,
  SSO_CODE_STASH_KEY,
  SSO_CUSTOM_TOKEN_KEY,
  SSO_LEGACY_HT_KEY,
} from "./constants";
import { SsoClientError, parseSsoErrorCode } from "./errors";
import type { SsoApiErrorBody, SsoErrorCode } from "./types";
import {
  appBaseUrl,
  handoffUrlWithCode,
  ssoConsumeUrl,
} from "./urls";

export type GetAppCheckToken = () => Promise<string | null | undefined>;

async function appCheckHeaders(
  getAppCheckToken?: GetAppCheckToken,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!getAppCheckToken) return headers;
  try {
    const token = await getAppCheckToken();
    if (token) headers["x-firebase-appcheck"] = token;
  } catch {
    // Optional when App Check is not enforced locally.
  }
  return headers;
}

async function readErrorBody(res: Response): Promise<SsoApiErrorBody | null> {
  return (await res.json().catch(() => null)) as SsoApiErrorBody | null;
}

function throwFromResponse(
  res: Response,
  payload: SsoApiErrorBody | null,
  fallback: string,
): never {
  const code = parseSsoErrorCode(payload?.code);
  throw new SsoClientError(
    code === "unknown" && res.status === 429 ? "rate-limited" : code,
    payload?.error ?? fallback,
    res.status,
  );
}

/**
 * Mint an opaque handoff code on this origin, then build the sibling consume URL.
 * Never puts the Firebase ID token in the query string.
 */
export async function buildSsoHandoffUrl(
  consumeUrl: string,
  idToken: string,
  getAppCheckToken?: GetAppCheckToken,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/auth/create-sso-handoff", {
      method: "POST",
      headers: await appCheckHeaders(getAppCheckToken),
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw new SsoClientError("network", "Network error creating SSO handoff");
  }
  if (!res.ok) {
    throwFromResponse(
      res,
      await readErrorBody(res),
      `handoff failed (${res.status})`,
    );
  }
  const data = (await res.json()) as { code?: string };
  if (
    !data.code ||
    data.code.length < CODE_MIN_LEN ||
    data.code.length > CODE_MAX_LEN
  ) {
    throw new SsoClientError("unknown", "handoff code missing");
  }
  return handoffUrlWithCode(consumeUrl, data.code);
}

export async function exchangeHandoffCode(
  code: string,
  getAppCheckToken?: GetAppCheckToken,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/auth/exchange-sso", {
      method: "POST",
      headers: await appCheckHeaders(getAppCheckToken),
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new SsoClientError("network", "Network error exchanging SSO handoff");
  }
  if (!res.ok) {
    throwFromResponse(
      res,
      await readErrorBody(res),
      `exchange failed (${res.status})`,
    );
  }
  const data = (await res.json()) as { customToken?: string };
  if (!data.customToken) {
    throw new SsoClientError("unknown", "customToken missing");
  }
  return data.customToken;
}

/**
 * Resolve navigation URL when switching apps.
 * Signed-in users always use SSO handoff (throws on failure — no silent fallback).
 * Signed-out users get a plain destination URL.
 */
export async function resolveSwitchUrl(opts: {
  target: PulseAppId;
  homePath: string;
  locale: string;
  getIdToken: () => Promise<string | null>;
  getAppCheckToken?: GetAppCheckToken;
}): Promise<string> {
  const idToken = await opts.getIdToken();
  if (!idToken) {
    return `${appBaseUrl(opts.target)}/${opts.locale}${opts.homePath}`;
  }
  const consume = ssoConsumeUrl(opts.target, opts.locale, opts.homePath);
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
export function takeHandoffCode(): string | null {
  if (typeof window === "undefined") return null;

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
  const valid = (value: string | null) =>
    value && value.length >= CODE_MIN_LEN && value.length <= CODE_MAX_LEN
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
  } else if (hashParams.has("hc")) {
    hashParams.delete("hc");
    url.hash = hashParams.toString();
    dirty = true;
  }

  if (fromUrl) {
    try {
      sessionStorage.setItem(SSO_CODE_STASH_KEY, fromUrl);
    } catch {
      // ignore
    }
    if (dirty) {
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    return fromUrl;
  }

  if (dirty) {
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  try {
    const stashed = sessionStorage.getItem(SSO_CODE_STASH_KEY);
    if (
      stashed &&
      stashed.length >= CODE_MIN_LEN &&
      stashed.length <= CODE_MAX_LEN
    ) {
      return stashed;
    }
  } catch {
    // ignore
  }

  return null;
}

export function clearHandoffCodeStash() {
  try {
    sessionStorage.removeItem(SSO_CODE_STASH_KEY);
  } catch {
    // ignore
  }
}

export function readStashedCustomToken(): string | null {
  try {
    const token = sessionStorage.getItem(SSO_CUSTOM_TOKEN_KEY);
    return token && token.length > 20 ? token : null;
  } catch {
    return null;
  }
}

export function stashCustomToken(token: string) {
  try {
    sessionStorage.setItem(SSO_CUSTOM_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearStashedCustomToken() {
  try {
    sessionStorage.removeItem(SSO_CUSTOM_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function markSsoAttempted() {
  try {
    sessionStorage.setItem(SSO_ATTEMPT_KEY, "1");
  } catch {
    // ignore
  }
}

export function hasSsoAttempted() {
  try {
    return sessionStorage.getItem(SSO_ATTEMPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSsoAttempt() {
  try {
    sessionStorage.removeItem(SSO_ATTEMPT_KEY);
    sessionStorage.removeItem(SSO_CODE_STASH_KEY);
    sessionStorage.removeItem(SSO_LEGACY_HT_KEY);
  } catch {
    // ignore
  }
}

export function asSsoClientError(error: unknown): SsoClientError {
  if (error instanceof SsoClientError) return error;
  if (error instanceof Error && error.message === "missing-token") {
    return new SsoClientError("missing-token", error.message);
  }
  const code = (error as { ssoCode?: SsoErrorCode })?.ssoCode;
  if (code) {
    return new SsoClientError(
      parseSsoErrorCode(code),
      error instanceof Error ? error.message : "SSO failed",
      (error as { status?: number }).status,
    );
  }
  return new SsoClientError(
    "unknown",
    error instanceof Error ? error.message : "SSO failed",
  );
}
