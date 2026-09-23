import type { SsoErrorCode, SsoMessageKey } from "./types";
export declare class SsoClientError extends Error {
    readonly code: SsoErrorCode;
    readonly status?: number | undefined;
    constructor(code: SsoErrorCode, message: string, status?: number | undefined);
}
export declare function isSsoErrorCode(value: unknown): value is SsoErrorCode;
export declare function parseSsoErrorCode(value: unknown): SsoErrorCode;
/** Map structured codes to next-intl keys. */
export declare function ssoMessageKeyForCode(code: SsoErrorCode): SsoMessageKey;
//# sourceMappingURL=errors.d.ts.map