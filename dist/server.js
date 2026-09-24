"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsoHttpError = void 0;
exports.contextFromRequest = contextFromRequest;
exports.assertAllowedSsoOrigin = assertAllowedSsoOrigin;
exports.requireAppCheckEnabled = requireAppCheckEnabled;
exports.shouldCheckIdTokenRevoked = shouldCheckIdTokenRevoked;
exports.rateLimitDocId = rateLimitDocId;
exports.createSsoServer = createSsoServer;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const constants_1 = require("./constants");
const urls_1 = require("./urls");
class SsoHttpError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "SsoHttpError";
    }
    toResponse() {
        return Response.json({ error: this.message, code: this.code }, { status: this.status });
    }
}
exports.SsoHttpError = SsoHttpError;
function clientIpFromRequest(request) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first)
            return first;
    }
    return request.headers.get("x-real-ip")?.trim() || "unknown";
}
function originFromReferer(referer) {
    if (!referer?.trim())
        return null;
    try {
        return new URL(referer).origin;
    }
    catch {
        return null;
    }
}
function contextFromRequest(request) {
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
function assertAllowedSsoOrigin(origin, opts) {
    const usingEmulators = opts?.usingEmulators ?? false;
    const candidate = origin?.trim() || originFromReferer(opts?.referer) || null;
    if (!candidate) {
        if (usingEmulators)
            return;
        throw new SsoHttpError(403, "origin-not-allowed", "Origin required.");
    }
    if (!(0, urls_1.isAllowedAppOrigin)(candidate)) {
        throw new SsoHttpError(403, "origin-not-allowed", "Origin not allowed.");
    }
}
/**
 * App Check for SSO is opt-in (`PULSE_SSO_REQUIRE_APP_CHECK=true`).
 * Only the Auth emulator disables it — Firestore-only emulator must not.
 */
function requireAppCheckEnabled(_usingEmulators) {
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim())
        return false;
    return process.env.PULSE_SSO_REQUIRE_APP_CHECK === "true";
}
/** Revocation checks stay on in production even if Firestore emulator env leaks. */
function shouldCheckIdTokenRevoked(_usingEmulators) {
    if (process.env.NODE_ENV === "production")
        return true;
    return !process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
}
function rateLimitDocId(bucket, identity) {
    const hash = (0, node_crypto_1.createHash)("sha256").update(identity).digest("hex").slice(0, 32);
    const minute = Math.floor(Date.now() / 60_000);
    return `${bucket}_${hash}_${minute}`;
}
function createSsoServer(deps) {
    async function verifyAppCheck(ctx) {
        if (ctx.skipAppCheck)
            return;
        if (!requireAppCheckEnabled(deps.usingEmulators()))
            return;
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
        }
        catch {
            throw new SsoHttpError(401, "appcheck-invalid", "App Check token rejected.");
        }
    }
    async function consumeRateLimit(bucket, identity) {
        const minute = Math.floor(Date.now() / 60_000);
        const id = rateLimitDocId(bucket, identity);
        const ref = deps.db().doc(`ssoRateLimit/${id}`);
        await deps.db().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const count = Number(snap.data()?.count ?? 0);
            if (count >= constants_1.MAX_SSO_PER_MINUTE) {
                throw new SsoHttpError(429, "rate-limited", "Too many SSO requests.");
            }
            tx.set(ref, {
                bucket,
                minute,
                count: count + 1,
                expiresAt: firestore_1.Timestamp.fromMillis((minute + 2) * 60_000),
            }, { merge: true });
        });
    }
    async function assertActiveAccount(uid) {
        const snap = await deps.db().doc(`users/${uid}`).get();
        const status = String(snap.data()?.accountStatus ?? "active");
        if (status === "deactivated" || status === "pendingDeletion") {
            throw new SsoHttpError(403, "account-disabled", "Account is deactivated or pending deletion.");
        }
    }
    /** Mint a short-lived opaque handoff code for cross-origin SSO. */
    async function createSsoHandoffCode(ctx, idToken) {
        await verifyAppCheck(ctx);
        assertAllowedSsoOrigin(ctx.origin, {
            usingEmulators: deps.usingEmulators(),
            referer: ctx.referer,
        });
        await consumeRateLimit("create_ip", ctx.clientIp || "unknown");
        if (idToken.length < constants_1.ID_TOKEN_MIN_LEN) {
            throw new SsoHttpError(400, "idToken-required", "idToken required");
        }
        let uid;
        try {
            const decoded = await deps.auth().verifyIdToken(idToken, shouldCheckIdTokenRevoked(deps.usingEmulators()));
            uid = decoded.uid;
        }
        catch {
            throw new SsoHttpError(401, "invalid-token", "Invalid or expired ID token");
        }
        await consumeRateLimit("create_uid", uid);
        await assertActiveAccount(uid);
        const code = (0, node_crypto_1.randomBytes)(32).toString("base64url");
        const now = Date.now();
        await deps
            .db()
            .collection("ssoHandoffs")
            .doc(code)
            .set({
            uid,
            used: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            expiresAt: firestore_1.Timestamp.fromMillis(now + constants_1.HANDOFF_TTL_MS),
        });
        return { code, uid };
    }
    /**
     * Create handoff for an already-authenticated uid (Cloud Functions path).
     * Rate-limits before write.
     */
    async function createSsoHandoffForUid(uid, clientIp = "functions") {
        await consumeRateLimit("create_uid", uid);
        await consumeRateLimit("create_ip", clientIp);
        await assertActiveAccount(uid);
        const code = (0, node_crypto_1.randomBytes)(32).toString("base64url");
        const now = Date.now();
        await deps
            .db()
            .collection("ssoHandoffs")
            .doc(code)
            .set({
            uid,
            used: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            expiresAt: firestore_1.Timestamp.fromMillis(now + constants_1.HANDOFF_TTL_MS),
        });
        return { code, uid };
    }
    /** Consume a one-time handoff code and mint a custom token. */
    async function exchangeSsoHandoffCode(ctx, code) {
        await verifyAppCheck(ctx);
        assertAllowedSsoOrigin(ctx.origin, {
            usingEmulators: deps.usingEmulators(),
            referer: ctx.referer,
        });
        await consumeRateLimit("exchange_ip", ctx.clientIp || "unknown");
        const trimmed = code.trim();
        if (trimmed.length < constants_1.CODE_MIN_LEN ||
            trimmed.length > constants_1.CODE_MAX_LEN) {
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
        const preflightExpiresAt = preflightData.expiresAt;
        const preflightUid = String(preflightData.uid ?? "");
        if (preflightData.used === true ||
            !preflightExpiresAt ||
            preflightExpiresAt.toMillis() < Date.now() ||
            !preflightUid) {
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
            const expiresAt = data.expiresAt;
            const handoffUid = String(data.uid ?? "");
            if (!expiresAt ||
                expiresAt.toMillis() < Date.now() ||
                !handoffUid ||
                handoffUid !== preflightUid) {
                throw new SsoHttpError(401, "invalid-code", "Invalid or expired handoff");
            }
            tx.update(ref, {
                used: true,
                usedAt: firestore_1.FieldValue.serverTimestamp(),
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
