import { afterEach, describe, expect, it, vi } from "vitest";
import { SSO_CODE_STASH_KEY } from "./constants";
import { takeHandoffCode } from "./client";

type FakeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function installBrowser(href: string, stashedCode?: string) {
  const store = new Map<string, string>();
  if (stashedCode) store.set(SSO_CODE_STASH_KEY, stashedCode);

  const storage: FakeStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  const replaceState = vi.fn();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href },
      history: { replaceState },
    },
  });
  return { store, replaceState };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("takeHandoffCode", () => {
  it("prefers a fresh fragment handoff over a stale stashed code", () => {
    const fresh = "f".repeat(43);
    const stale = "s".repeat(43);
    const { store, replaceState } = installBrowser(
      `http://localhost:3002/en/auth/sso?next=%2F#hc=${fresh}`,
      stale,
    );

    expect(takeHandoffCode()).toBe(fresh);
    expect(store.get(SSO_CODE_STASH_KEY)).toBe(fresh);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(String(replaceState.mock.calls[0]?.[2] ?? "")).not.toContain("hc=");
  });

  it("keeps accepting legacy query handoffs during rollout", () => {
    const code = "q".repeat(43);
    const { replaceState } = installBrowser(
      `http://localhost:3001/en/auth/sso?hc=${code}&next=%2F`,
    );

    expect(takeHandoffCode()).toBe(code);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(String(replaceState.mock.calls[0]?.[2] ?? "")).not.toContain("hc=");
  });

  it("rejects oversized handoff values", () => {
    const code = "x".repeat(256);
    installBrowser(`http://localhost:3001/en/auth/sso#hc=${code}`);
    expect(takeHandoffCode()).toBeNull();
  });
});
