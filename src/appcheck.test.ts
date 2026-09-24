import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAppCheckEnabled, SsoHttpError } from "./server";

describe("requireAppCheckEnabled", () => {
  afterEach(() => {
    delete process.env.PULSE_SSO_REQUIRE_APP_CHECK;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  });

  it("is off when Auth emulator is set", () => {
    process.env.PULSE_SSO_REQUIRE_APP_CHECK = "true";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    expect(requireAppCheckEnabled(false)).toBe(false);
  });

  it("is off when flag unset", () => {
    delete process.env.PULSE_SSO_REQUIRE_APP_CHECK;
    expect(requireAppCheckEnabled(false)).toBe(false);
  });

  it("is on when flag true outside Auth emulator", () => {
    process.env.PULSE_SSO_REQUIRE_APP_CHECK = "true";
    expect(requireAppCheckEnabled(true)).toBe(true);
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
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
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
