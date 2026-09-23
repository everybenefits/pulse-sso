import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAppCheckEnabled, SsoHttpError } from "./server";

describe("requireAppCheckEnabled", () => {
  afterEach(() => {
    delete process.env.PULSE_SSO_REQUIRE_APP_CHECK;
  });

  it("is off on emulators", () => {
    process.env.PULSE_SSO_REQUIRE_APP_CHECK = "true";
    expect(requireAppCheckEnabled(true)).toBe(false);
  });

  it("is off when flag unset", () => {
    delete process.env.PULSE_SSO_REQUIRE_APP_CHECK;
    expect(requireAppCheckEnabled(false)).toBe(false);
  });

  it("is on when flag true outside emulators", () => {
    process.env.PULSE_SSO_REQUIRE_APP_CHECK = "true";
    expect(requireAppCheckEnabled(false)).toBe(true);
  });
});

describe("SsoHttpError App Check codes", () => {
  it("serializes appcheck-missing", () => {
    const err = new SsoHttpError(401, "appcheck-missing", "App Check token missing.");
    expect(err.status).toBe(401);
    expect(err.code).toBe("appcheck-missing");
  });
});

describe("createSsoServer App Check gate", () => {
  afterEach(() => {
    delete process.env.PULSE_SSO_REQUIRE_APP_CHECK;
    vi.resetModules();
  });

  it("rejects when App Check required and token missing", async () => {
    process.env.PULSE_SSO_REQUIRE_APP_CHECK = "true";
    const { createSsoServer } = await import("./server");
    const server = createSsoServer({
      auth: () => ({}) as never,
      db: () => ({}) as never,
      usingEmulators: () => false,
    });
    await expect(
      server.createSsoHandoffCode(
        { appCheckToken: null },
        "x".repeat(120),
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "appcheck-missing",
    });
  });
});
