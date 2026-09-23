export const HANDOFF_TTL_MS = 60_000;
export const MAX_SSO_PER_MINUTE = 15;
export const CODE_MIN_LEN = 32;
export const CODE_MAX_LEN = 128;
export const ID_TOKEN_MIN_LEN = 100;

export const SSO_ATTEMPT_KEY = "pulse_sso_attempt";
export const SSO_CODE_STASH_KEY = "pulse_sso_hc";
export const SSO_CUSTOM_TOKEN_KEY = "pulse_sso_ct";
/** Legacy key cleared on attempt reset. */
export const SSO_LEGACY_HT_KEY = "pulse_sso_ht";
