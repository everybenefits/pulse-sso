/**
 * Same-origin relative path only. Rejects protocol-relative (`//evil`),
 * backslashes, and schemes in the **pathname** — blocks open redirects via
 * `?next=`. Absolute URLs may appear in the query (e.g. SSO bridge `return=`)
 * and are validated by the destination page.
 */
export function isSafeInternalPath(
  path: string | null | undefined,
): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  const pathname = path.split(/[?#]/, 2)[0] ?? "";
  if (pathname.includes("://")) return false;
  // e.g. `/javascript:…` style path segments
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathname)) return false;
  return true;
}

/** Returns a safe internal path or `fallback` (default `/`). */
export function safeInternalPath(
  path: string | null | undefined,
  fallback = "/",
): string {
  return isSafeInternalPath(path) ? path : fallback;
}
