/** Structured SSO error codes returned by APIs and surfaced in UI. */
export type SsoErrorCode = "appcheck-missing" | "appcheck-invalid" | "rate-limited" | "idToken-required" | "invalid-token" | "code-required" | "invalid-code" | "account-disabled" | "origin-not-allowed" | "network" | "missing-token" | "unknown";
/** next-intl message keys for SSO (hosts must provide these). */
export type SsoMessageKey = "ssoSigningIn" | "ssoBridging" | "ssoChecking" | "ssoMissingToken" | "ssoInvalidReturn" | "ssoFailed" | "ssoStepExchange" | "ssoStepSignIn" | "ssoStepOpen" | "ssoRateLimited" | "ssoAppCheckFailed" | "ssoAccountDisabled" | "appSwitchHandoffFailed" | "logoutEverywhere" | "loading";
export type SsoApiErrorBody = {
    error?: string;
    code?: string;
};
//# sourceMappingURL=types.d.ts.map