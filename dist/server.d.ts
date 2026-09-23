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
    /** Cloud Functions use their own App Check enforcement. */
    skipAppCheck?: boolean;
};
export declare function contextFromRequest(request: Request): SsoRequestContext;
/** Same-origin fetch always sends Origin; missing Origin is allowed (non-browser). */
export declare function assertAllowedSsoOrigin(origin: string | null | undefined): void;
/** App Check for SSO is opt-in only (`PULSE_SSO_REQUIRE_APP_CHECK=true`). */
export declare function requireAppCheckEnabled(usingEmulators: boolean): boolean;
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