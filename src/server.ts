import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import type { AppCheck } from "firebase-admin/app-check";
import {
  CODE_MAX_LEN,
  CODE_MIN_LEN,
  HANDOFF_TTL_MS,
  ID_TOKEN_MIN_LEN,
  MAX_SSO_PER_MINUTE,
} from "./constants";
import { isAllowedAppOrigin } from "./urls";
import type { SsoErrorCode } from "./types";

export class SsoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: SsoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SsoHttpError";
  }

  toResponse(): Response {
    return Response.json(
      { error: this.message, code: this.code },
      { status: this.status },
    );
  }
}

export type SsoServerDeps = {
  auth: () => Auth;
  db: () => Firestore;
  appCheck?: () => AppCheck;
  usingEmulators: () => boolean;
};

export type SsoRequestContext = {
  appCheckToken?: string | null;
  clientIp?: string;
  origin?: string | null;
  referer?: string | null;
  /** Cloud Functions use their own App Check enforcement. */
  skipAppCheck?: boolean;
};

function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function originFromReferer(referer: string | null | undefined): string | null {
  if (!referer?.trim()) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function contextFromRequest(request: Request): SsoRequestContext {
  return {
    appCheckToken: request.headers.get("x-firebase-appcheck"),
    clientIp: clientIpFromRequest(request),
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
  };
}

/**
 * Browser fetch usually sends Origin; Referer is accepted as a fallback.
 * Outside emulators, missing both is rejected (blocks non-browser callers
 * from skipping the allowlist).
 */
export function assertAllowedSsoOrigin(
  origin: string | null | undefined,
  opts?: { usingEmulators?: boolean; referer?: string | null },
): void {
  const usingEmulators = opts?.usingEmulators ?? false;
  const candidate =
    origin?.trim() || originFromReferer(opts?.referer) || null;
  if (!candidate) {
    if (usingEmulators) return;
    throw new SsoHttpError(403, "origin-not-allowed", "Origin required.");
  }
  if (!isAllowedAppOrigin(candidate)) {
    throw new SsoHttpError(403, "origin-not-allowed", "Origin not allowed.");
  }
}

/**
 * App Check for SSO is opt-in (`PULSE_SSO_REQUIRE_APP_CHECK=true`).
 * Only the Auth emulator disables it — Firestore-only emulator must not.
 */
export function requireAppCheckEnabled(_usingEmulators: boolean): boolean {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) return false;
  return process.env.PULSE_SSO_REQUIRE_APP_CHECK === "true";
}

/** Revocation checks stay on in production even if Firestore emulator env leaks. */
export function shouldCheckIdTokenRevoked(_usingEmulators: boolean): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return !process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
}

export function rateLimitDocId(bucket: string, identity: string): string {
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 32);
  const minute = Math.floor(Date.now() / 60_000);
  return `${bucket}_${hash}_${minute}`;
}

export function createSsoServer(deps: SsoServerDeps) {
  async function verifyAppCheck(ctx: SsoRequestContext): Promise<void> {
    if (ctx.skipAppCheck) return;
    if (!requireAppCheckEnabled(deps.usingEmulators())) return;
    const token = ctx.appCheckToken;
    if (!token) {
      throw new SsoHttpError(401, "appcheck-missing", "App Check token missing.");
    }
    const appCheck = deps.appCheck;
    if (!appCheck) {
      throw new SsoHttpError(401, "appcheck-invalid", "App Check not configured.");
    }
    try {
      await appCheck().verifyToken(token);
    } catch {
      throw new SsoHttpError(401, "appcheck-invalid", "App Check token rejected.");
    }
  }

  async function consumeRateLimit(
    bucket: string,
    identity: string,
  ): Promise<void> {
    const minute = Math.floor(Date.now() / 60_000);
    const id = rateLimitDocId(bucket, identity);
    const ref = deps.db().doc(`ssoRateLimit/${id}`);
    await deps.db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = Number(snap.data()?.count ?? 0);
      if (count >= MAX_SSO_PER_MINUTE) {
        throw new SsoHttpError(429, "rate-limited", "Too many SSO requests.");
      }
      tx.set(
        ref,
        {
          bucket,
          minute,
          count: count + 1,
          expiresAt: Timestamp.fromMillis((minute + 2) * 60_000),
        },
        { merge: true },
      );
    });
  }


  async function assertActiveAccount(uid: string): Promise<void> {
    const snap = await deps.db().doc(`users/${uid}`).get();
    const status = String(snap.data()?.accountStatus ?? "active");
    if (status === "deactivated" || status === "pendingDeletion") {
      throw new SsoHttpError(
        403,
        "account-disabled",
        "Account is deactivated or pending deletion.",
      );
    }
  }

  /** Mint a short-lived opaque handoff code for cross-origin SSO. */
  async function createSsoHandoffCode(
    ctx: SsoRequestContext,
    idToken: string,
  ): Promise<{ code: string; uid: string }> {
    await verifyAppCheck(ctx);
    assertAllowedSsoOrigin(ctx.origin, {
      usingEmulators: deps.usingEmulators(),
      referer: ctx.referer,
    });
    await consumeRateLimit("create_ip", ctx.clientIp || "unknown");

    if (idToken.length < ID_TOKEN_MIN_LEN) {
      throw new SsoHttpError(400, "idToken-required", "idToken required");
    }

    let uid: string;
    try {
      const decoded = await deps.auth().verifyIdToken(
        idToken,
        shouldCheckIdTokenRevoked(deps.usingEmulators()),
      );
      uid = decoded.uid;
    } catch {
      throw new SsoHttpError(401, "invalid-token", "Invalid or expired ID token");
    }

    await consumeRateLimit("create_uid", uid);
    await assertActiveAccount(uid);

    const code = randomBytes(32).toString("base64url");
    const now = Date.now();
    await deps
      .db()
      .collection("ssoHandoffs")
      .doc(code)
      .set({
        uid,
        used: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + HANDOFF_TTL_MS),
      });

    return { code, uid };
  }

  /**
   * Create handoff for an already-authenticated uid (Cloud Functions path).
   * Rate-limits before write.
   */
  async function createSsoHandoffForUid(
    uid: string,
    clientIp = "functions",
  ): Promise<{ code: string; uid: string }> {
    await consumeRateLimit("create_uid", uid);
    await consumeRateLimit("create_ip", clientIp);
    await assertActiveAccount(uid);

    const code = randomBytes(32).toString("base64url");
    const now = Date.now();
    await deps
      .db()
      .collection("ssoHandoffs")
      .doc(code)
      .set({
        uid,
        used: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + HANDOFF_TTL_MS),
      });

    return { code, uid };
  }

  /** Consume a one-time handoff code and mint a custom token. */
  async function exchangeSsoHandoffCode(
    ctx: SsoRequestContext,
    code: string,
  ): Promise<{ customToken: string; uid: string }> {
    await verifyAppCheck(ctx);
    assertAllowedSsoOrigin(ctx.origin, {
      usingEmulators: deps.usingEmulators(),
      referer: ctx.referer,
    });
    await consumeRateLimit("exchange_ip", ctx.clientIp || "unknown");

    const trimmed = code.trim();
    if (
      trimmed.length < CODE_MIN_LEN ||
      trimmed.length > CODE_MAX_LEN
    ) {
      throw new SsoHttpError(400, "code-required", "handoff code required");
    }

    // Rate-limit by code hash before consume so failed quota never burns the code.
    await consumeRateLimit("exchange_code", trimmed);

    const ref = deps.db().collection("ssoHandoffs").doc(trimmed);

    // Preflight the user-scoped checks before atomically claiming the code.
    // Otherwise a temporary quota/account failure burns a valid one-time handoff.
    const preflightSnap = await ref.get();
    if (!preflightSnap.exists) {
      throw new SsoHttpError(401, "invalid-code", "Invalid or expired handoff");
    }
    const preflightData = preflightSnap.data() ?? {};
    const preflightExpiresAt = preflightData.expiresAt as Timestamp | undefined;
    const preflightUid = String(preflightData.uid ?? "");
    if (
      preflightData.used === true ||
      !preflightExpiresAt ||
      preflightExpiresAt.toMillis() < Date.now() ||
      !preflightUid
    ) {
      throw new SsoHttpError(401, "invalid-code", "Invalid or expired handoff");
    }

    await consumeRateLimit("exchange_uid", preflightUid);
    await assertActiveAccount(preflightUid);

    const uid = await deps.db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new SsoHttpError(401, "invalid-code", "Invalid or expired handoff");
      }
      const data = snap.data() ?? {};
      if (data.used === true) {
        throw new SsoHttpError(401, "invalid-code", "Invalid or expired handoff");
      }
      const expiresAt = data.expiresAt as Timestamp | undefined;
      const handoffUid = String(data.uid ?? "");
      if (
        !expiresAt ||
        expiresAt.toMillis() < Date.now() ||
        !handoffUid ||
        handoffUid !== preflightUid
      ) {
        throw new SsoHttpError(401, "invalid-code", "Invalid or expired handoff");
      }
      tx.update(ref, {
        used: true,
        usedAt: FieldValue.serverTimestamp(),
      });
      return handoffUid;
    });

    const customToken = await deps.auth().createCustomToken(uid, { sso: true });
    void ref.delete().catch(() => undefined);
    return { customToken, uid };
  }

  return {
    createSsoHandoffCode,
    createSsoHandoffForUid,
    exchangeSsoHandoffCode,
    verifyAppCheck,
    consumeRateLimit,
    SsoHttpError,
  };
}

export type SsoServer = ReturnType<typeof createSsoServer>;
