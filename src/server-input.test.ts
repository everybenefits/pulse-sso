import { describe, expect, it, vi } from "vitest";
import { createSsoServer } from "./server";

describe("handoff input validation", () => {
  it("rejects a code containing a slash before constructing a handoff path", async () => {
    const collection = vi.fn(() => { throw new Error("Unsafe handoff path"); });
    const db = {
      doc: vi.fn(() => ({})),
      collection,
      runTransaction: async (fn: (tx: unknown) => Promise<void>) => fn({
        get: async () => ({ data: () => ({ count: 0 }) }),
        set: vi.fn(),
      }),
    };
    const server = createSsoServer({ auth: () => ({}) as never, db: () => db as never, usingEmulators: () => true });
    await expect(server.exchangeSsoHandoffCode({ origin: "http://localhost:3000", clientIp: "127.0.0.1" }, `${"a".repeat(24)}/b`)).rejects.toMatchObject({ status: 400, code: "code-required" });
    expect(collection).not.toHaveBeenCalled();
  });
});
