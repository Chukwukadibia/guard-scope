import { describe, expect, test } from 'vitest';
import { errorMessages, toApiError } from '../../src/lib/api/errors';

describe('error mapping', () => {
  test.each([
    [{ code: 'invalid_credentials' }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed' }, 'email_not_confirmed'],
    [{ code: 'over_email_send_rate_limit' }, 'rate_limited'],
    [{ status: 429 }, 'rate_limited'],
    // 42501 (RLS / permission denied) reads as "not found": no existence leak (§6).
    [{ code: '42501', message: 'permission denied for table profiles' }, 'not_found'],
    [new TypeError('Failed to fetch'), 'network'],
    // D-1 / ISS-009: database function/trigger errors carry a stable code in `message`.
    [{ code: 'P0001', message: 'not_found' }, 'not_found'],
    [{ code: 'P0001', message: 'already_confirmed' }, 'already_confirmed'],
    [{ code: 'P0001', message: 'empty_scope' }, 'empty_scope'],
    [{ code: 'P0001', message: 'project_archived' }, 'project_archived'],
    [{ code: 'P0001', message: 'scope_version_immutable' }, 'scope_locked'],
    [{ code: 'P0001', message: 'not_authenticated' }, 'not_authenticated'],
    [{ code: 'P0001', message: ' empty_scope\n' }, 'empty_scope'],
    [{ code: 'P0001', message: 'some other raise' }, 'unknown'],
    [{ code: 'P0001', message: 'constructor' }, 'unknown'],
    [{ code: 'P0001', message: '__proto__' }, 'unknown'],
    [{ code: 'P0001' }, 'unknown'],
    [{ message: 'empty_scope' }, 'unknown'], // the code is only trusted under P0001
    [
      { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      'not_found',
    ],
    [{ code: '23514' }, 'validation'],
    [{ code: '22001' }, 'validation'],
    [{ code: '23502', message: 'null value in column "title"' }, 'validation'],
    [{ code: 'session_not_found' }, 'not_authenticated'],
    [{ code: 'PGRST301' }, 'not_authenticated'],
    [{ status: 401 }, 'not_authenticated'],
    [{ code: 'weak_password' }, 'weak_password'],
    [{ code: '22P02' }, 'unknown'],
  ])('%o -> %s', (input, code) => {
    expect(toApiError(input).code).toBe(code);
  });

  test('call sites that synthesise errors map to the intended codes', () => {
    // projects.ts (getProject/updateProject with no row), scope.ts and ProjectFormPage.tsx
    expect(toApiError({ code: 'PGRST116' }).code).toBe('not_found');
    expect(toApiError({ code: 'P0001', message: 'scope_version_immutable' }).code).toBe(
      'scope_locked',
    );
    expect(toApiError({ code: 'P0001', message: 'project_archived' }).code).toBe(
      'project_archived',
    );
  });

  test('every mapped code has a specific, non-generic message', () => {
    for (const c of [
      'not_found',
      'already_confirmed',
      'empty_scope',
      'project_archived',
      'scope_locked',
    ] as const)
      expect(errorMessages[c]).not.toBe(errorMessages.unknown);
  });

  test('messages never echo backend text and do not reveal account existence', () => {
    expect(errorMessages.invalid_credentials).toBe('Email or password is incorrect.');
    for (const m of Object.values(errorMessages))
      expect(m).not.toMatch(/already registered|not found|exists/i);
  });
});
