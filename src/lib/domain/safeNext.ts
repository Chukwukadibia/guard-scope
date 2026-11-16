/**
 * Returns a safe in-app path for post-sign-in redirects (AC-3: no open redirect).
 * Only same-origin, absolute-path values are accepted; everything else falls back to "/".
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  // Reject control characters and backslashes (browsers normalise them into other origins).
  for (const ch of next) if (ch.charCodeAt(0) < 0x20 || ch === '\\') return '/';
  try {
    const u = new URL(next, 'https://guardscope.invalid');
    if (u.origin !== 'https://guardscope.invalid') return '/';
    return u.pathname + u.search + u.hash;
  } catch {
    return '/';
  }
}
