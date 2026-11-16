/**
 * Non-secret "this browser had a session" marker (AC-4, D-2).
 *
 * supabase-js removes its stored token when a session is lost, so the token alone cannot tell
 * "session ended" apart from "never signed in". The marker holds only the constant '1': no token,
 * no user id, no email. Every storage access is guarded because storage can be blocked or throw.
 */
export const SESSION_MARKER_KEY = 'guardscope.hadSession';

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): MarkerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function hasSessionMarker(storage: MarkerStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(SESSION_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSessionMarker(storage: MarkerStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(SESSION_MARKER_KEY, '1');
  } catch {
    /* storage unavailable: the "session ended" notice is best-effort */
  }
}

export function clearSessionMarker(storage: MarkerStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(SESSION_MARKER_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Startup decision: show "Your session has ended" only when this browser previously had a session
 * (marker, or a token still stored) and there is no valid session now. A first-time visitor has
 * neither, and a deliberate sign-out clears the marker, so neither sees the message.
 */
export function sessionEndedOnStartup(input: {
  hasValidSession: boolean;
  hadMarker: boolean;
  hadStoredToken: boolean;
}): boolean {
  if (input.hasValidSession) return false;
  return input.hadMarker || input.hadStoredToken;
}
