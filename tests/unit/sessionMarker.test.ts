import { describe, expect, test } from 'vitest';
import {
  SESSION_MARKER_KEY,
  clearSessionMarker,
  hasSessionMarker,
  sessionEndedOnStartup,
  setSessionMarker,
} from '../../src/lib/domain/sessionMarker';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('session marker storage', () => {
  test('set / has / clear round trip; value is a constant with no token or PII', () => {
    const s = memoryStorage();
    expect(hasSessionMarker(s)).toBe(false);
    setSessionMarker(s);
    expect(hasSessionMarker(s)).toBe(true);
    expect([...s.m.entries()]).toEqual([[SESSION_MARKER_KEY, '1']]);
    clearSessionMarker(s);
    expect(hasSessionMarker(s)).toBe(false);
  });

  test('storage that throws or is missing never breaks the app', () => {
    expect(() => setSessionMarker(throwing)).not.toThrow();
    expect(() => clearSessionMarker(throwing)).not.toThrow();
    expect(hasSessionMarker(throwing)).toBe(false);
    expect(hasSessionMarker(null)).toBe(false);
  });

  test('defaults to window.localStorage', () => {
    window.localStorage.removeItem(SESSION_MARKER_KEY);
    setSessionMarker();
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBe('1');
    clearSessionMarker();
    expect(window.localStorage.getItem(SESSION_MARKER_KEY)).toBeNull();
  });
});

describe('sessionEndedOnStartup (AC-4)', () => {
  test('token removed: marker present, no token, no session -> session ended (D-2)', () => {
    expect(
      sessionEndedOnStartup({ hasValidSession: false, hadMarker: true, hadStoredToken: false }),
    ).toBe(true);
  });
  test('tampered / expired token rejected -> session ended', () => {
    expect(
      sessionEndedOnStartup({ hasValidSession: false, hadMarker: true, hadStoredToken: true }),
    ).toBe(true);
    expect(
      sessionEndedOnStartup({ hasValidSession: false, hadMarker: false, hadStoredToken: true }),
    ).toBe(true);
  });
  test('first-time visitor, or after a deliberate sign-out (marker cleared) -> no message', () => {
    expect(
      sessionEndedOnStartup({ hasValidSession: false, hadMarker: false, hadStoredToken: false }),
    ).toBe(false);
  });
  test('valid session -> no message', () => {
    expect(
      sessionEndedOnStartup({ hasValidSession: true, hadMarker: true, hadStoredToken: true }),
    ).toBe(false);
  });
});
