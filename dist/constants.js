"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSO_LEGACY_HT_KEY = exports.SSO_CUSTOM_TOKEN_KEY = exports.SSO_CODE_STASH_KEY = exports.SSO_ATTEMPT_KEY = exports.ID_TOKEN_MIN_LEN = exports.CODE_MAX_LEN = exports.CODE_MIN_LEN = exports.MAX_SSO_PER_MINUTE = exports.HANDOFF_TTL_MS = void 0;
exports.HANDOFF_TTL_MS = 60_000;
exports.MAX_SSO_PER_MINUTE = 15;
exports.CODE_MIN_LEN = 32;
exports.CODE_MAX_LEN = 128;
exports.ID_TOKEN_MIN_LEN = 100;
exports.SSO_ATTEMPT_KEY = "pulse_sso_attempt";
exports.SSO_CODE_STASH_KEY = "pulse_sso_hc";
exports.SSO_CUSTOM_TOKEN_KEY = "pulse_sso_ct";
/** Legacy key cleared on attempt reset. */
exports.SSO_LEGACY_HT_KEY = "pulse_sso_ht";
