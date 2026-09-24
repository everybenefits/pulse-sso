import { type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import type { AppCheck } from "firebase-admin/app-check";
import type { SsoErrorCode } from "./types";
export declare class SsoHttpError extends Error {
    readonly status: number;
    readonly code: SsoErrorCode;
    constructor(status: number, code: SsoErrorCode, message: string);
    toResponse(): Response;
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
export declare function contextFromRequest(request: Request): SsoRequestContext;
/**
 * Browser fetch usually sends Origin; Referer is accepted as a fallback.
 * Outside emulators, missing both is rejected (blocks non-browser callers
 * from skipping the allowlist).
 */
export declare function assertAllowedSsoOrigin(origin: string | null | undefined, opts?: {
    usingEmulators?: boolean;
    referer?: string | null;
}): void;
/**
 * App Check for SSO is opt-in (`PULSE_SSO_REQUIRE_APP_CHECK=true`).
 * Only the Auth emulator disables it — Firestore-only emulator must not.
 */
export declare function requireAppCheckEnabled(_usingEmulators: boolean): boolean;
/** Revocation checks stay on in production even if Firestore emulator env leaks. */
export declare function shouldCheckIdTokenRevoked(_usingEmulators: boolean): boolean;
export declare function rateLimitDocId(bucket: string, identity: string): string;
export declare function createSsoServer(deps: SsoServerDeps): {
    createSsoHandoffCode: (ctx: SsoRequestContext, idToken: string) => Promise<{
        code: string;
        uid: string;
    }>;
    createSsoHandoffForUid: (uid: string, clientIp?: string) => Promise<{
        code: string;
        uid: string;
    }>;
    exchangeSsoHandoffCode: (ctx: SsoRequestContext, code: string) => Promise<{
        customToken: string;
        uid: string;
    }>;
    verifyAppCheck: (ctx: SsoRequestContext) => Promise<void>;
    consumeRateLimit: (bucket: string, identity: string) => Promise<void>;
    SsoHttpError: typeof SsoHttpError;
};
export type SsoServer = ReturnType<typeof createSsoServer>;
//# sourceMappingURL=server.d.ts.map