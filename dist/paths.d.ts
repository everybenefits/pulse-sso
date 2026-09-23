/**
 * Same-origin relative path only. Rejects protocol-relative (`//evil`),
 * backslashes, and schemes in the **pathname** — blocks open redirects via
 * `?next=`. Absolute URLs may appear in the query (e.g. SSO bridge `return=`)
 * and are validated by the destination page.
 */
export declare function isSafeInternalPath(path: string | null | undefined): path is string;
/** Returns a safe internal path or `fallback` (default `/`). */
export declare function safeInternalPath(path: string | null | undefined, fallback?: string): string;
//# sourceMappingURL=paths.d.ts.map