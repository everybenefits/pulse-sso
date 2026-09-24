import { describe, expect, it } from "vitest";
import { isSafeInternalPath, safeInternalPath } from "./paths";
import {
  buildLogoutCascadeUrl,
  handoffUrlWithCode,
  isAllowedAppOrigin,
  isAllowedLogoutNext,
  isAllowedSsoReturnUrl,
  PULSE_ACCOUNT_PATH,
  pulseAccountUrl,
  pulseHubLoginUrl,
} from "./urls";
import { parseSsoErrorCode, ssoMessageKeyForCode } from "./errors";
import { assertAllowedSsoOrigin, rateLimitDocId, SsoHttpError } from "./server";

describe("isSafeInternalPath", () => {
  it("accepts normal relative paths", () => {
    expect(isSafeInternalPath("/home")).toBe(true);
    expect(isSafeInternalPath("/auth/sso")).toBe(true);
    expect(isSafeInternalPath("/a/b?x=1")).toBe(true);
    expect(
      isSafeInternalPath(
        "/auth/bridge?return=http://localhost:3001/en/auth/sso?next=%2F",
      ),
    ).toBe(true);
  });

  it("rejects open-redirect patterns", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("/\\evil")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("/foo://bar")).toBe(false);
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
  });

  it("safeInternalPath falls back", () => {
    expect(safeInternalPath("//evil", "/home")).toBe("/home");
    expect(safeInternalPath("/ok", "/home")).toBe("/ok");
  });
});

describe("isAllowedSsoReturnUrl", () => {
  it("allows pulse/studio/admin consume URLs", () => {
    expect(
      isAllowedSsoReturnUrl("http://localhost:3000/en/auth/sso?next=%2Fhome"),
    ).toBe(true);
    expect(
      isAllowedSsoReturnUrl("http://localhost:3001/es/auth/sso?next=%2F"),
    ).toBe(true);
    expect(
      isAllowedSsoReturnUrl("http://localhost:3002/en/auth/sso?next=%2F"),
    ).toBe(true);
  });

  it("rejects foreign origins and non-exact sso paths", () => {
    expect(isAllowedSsoReturnUrl("https://evil.com/en/auth/sso")).toBe(false);
    expect(isAllowedSsoReturnUrl("http://localhost:3000/en/home")).toBe(false);
    expect(
      isAllowedSsoReturnUrl("http://localhost:3000/en/auth/sso/extra"),
    ).toBe(false);
    expect(
      isAllowedSsoReturnUrl("http://localhost:3000/en/foo/auth/sso"),
    ).toBe(false);
  });
});

describe("handoff URL confidentiality", () => {
  it("puts the opaque handoff in the URL fragment, not the query", () => {
    const code = "x".repeat(43);
    const result = new URL(
      handoffUrlWithCode(
        "http://localhost:3002/en/auth/sso?next=%2Foverview",
        code,
      ),
    );
    expect(result.searchParams.has("hc")).toBe(false);
    expect(new URLSearchParams(result.hash.slice(1)).get("hc")).toBe(code);
    expect(result.searchParams.get("next")).toBe("/overview");
  });
});

describe("Pulse-family origins", () => {
  it("allows App Hosting preview origins consistently with Functions CORS", () => {
    expect(
      isAllowedAppOrigin(
        "https://pulse-preview-123-every-benefits-us.us-central1.hosted.app",
      ),
    ).toBe(true);
  });
});

describe("isAllowedLogoutNext", () => {
  it("allows safe relative and family origins", () => {
    expect(isAllowedLogoutNext("/login")).toBe(true);
    expect(isAllowedLogoutNext("http://localhost:3002/en/login")).toBe(true);
    expect(isAllowedLogoutNext("//evil.com")).toBe(false);
  });
});

describe("auth hub helpers", () => {
  it("builds Pulse hub login that resumes bridge", () => {
    const consume = "http://localhost:3001/en/auth/sso?next=%2F";
    const url = pulseHubLoginUrl("en", consume);
    expect(url.startsWith("http://localhost:3000/en/login?next=")).toBe(true);
    const next = decodeURIComponent(new URL(url).searchParams.get("next")!);
    expect(next.startsWith("/auth/bridge?return=")).toBe(true);
    const resumed = new URLSearchParams(next.slice(next.indexOf("?") + 1)).get(
      "return",
    );
    expect(resumed).toContain("localhost:3001");
    expect(resumed).toContain("/auth/sso");
  });

  it("builds account URL on Pulse", () => {
    expect(pulseAccountUrl("es")).toBe(`http://localhost:3000/es${PULSE_ACCOUNT_PATH}`);
    expect(pulseAccountUrl("en", "/account?section=security")).toContain(
      "section=security",
    );
  });

  it("cascades logout through every sibling", () => {
    const finalUrl = "http://localhost:3001/en/login";
    const url = buildLogoutCascadeUrl("studio", "en", finalUrl);
    expect(url).toContain("/auth/logout?next=");
    // otherApps(studio)=[pulse,admin,payments]; reverse-wrap → outermost is pulse.
    expect(url.startsWith("http://localhost:3000/en/auth/logout?next=")).toBe(
      true,
    );
    let decoded = url;
    for (let i = 0; i < 8; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    expect(decoded).toContain("localhost:3002/en/auth/logout");
    expect(decoded).toContain("localhost:3004/en/auth/logout");
    expect(decoded).toContain(finalUrl);
  });
});

describe("error mapping", () => {
  it("parses known codes", () => {
    expect(parseSsoErrorCode("rate-limited")).toBe("rate-limited");
    expect(parseSsoErrorCode("nope")).toBe("unknown");
  });

  it("maps to message keys", () => {
    expect(ssoMessageKeyForCode("missing-token")).toBe("ssoMissingToken");
    expect(ssoMessageKeyForCode("rate-limited")).toBe("ssoRateLimited");
    expect(ssoMessageKeyForCode("appcheck-invalid")).toBe("ssoAppCheckFailed");
    expect(ssoMessageKeyForCode("account-disabled")).toBe("ssoAccountDisabled");
    expect(ssoMessageKeyForCode("invalid-code")).toBe("ssoFailed");
  });
});

describe("assertAllowedSsoOrigin", () => {
  it("allows missing origin only when using emulators", () => {
    expect(() =>
      assertAllowedSsoOrigin(null, { usingEmulators: true }),
    ).not.toThrow();
    expect(() =>
      assertAllowedSsoOrigin(undefined, { usingEmulators: true }),
    ).not.toThrow();
  });

  it("rejects missing origin outside emulators", () => {
    try {
      assertAllowedSsoOrigin(null);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SsoHttpError);
      expect((error as SsoHttpError).code).toBe("origin-not-allowed");
      expect((error as SsoHttpError).status).toBe(403);
    }
  });

  it("allows Pulse-family origins", () => {
    expect(() => assertAllowedSsoOrigin("http://localhost:3000")).not.toThrow();
    expect(() => assertAllowedSsoOrigin("http://localhost:3002")).not.toThrow();
  });

  it("rejects foreign origins", () => {
    try {
      assertAllowedSsoOrigin("https://evil.example");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SsoHttpError);
      expect((error as SsoHttpError).code).toBe("origin-not-allowed");
      expect((error as SsoHttpError).status).toBe(403);
    }
  });
});
