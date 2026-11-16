import { describe, expect, test } from 'vitest';
import { errorMessages, toApiError } from '../../src/lib/api/errors';

describe('error mapping', () => {
  test.each([
    [{ code: 'invalid_credentials' }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed' }, 'email_not_confirmed'],
    [{ code: 'over_email_send_rate_limit' }, 'rate_limited'],
    [{ status: 429 }, 'rate_limited'],
    [{ code: '42501', message: 'permission denied for table profiles' }, 'unknown'],
    [new TypeError('Failed to fetch'), 'network'],
  ])('%o -> %s', (input, code) => {
    expect(toApiError(input).code).toBe(code);
  });

  test('messages never echo backend text and do not reveal account existence', () => {
    expect(errorMessages.invalid_credentials).toBe('Email or password is incorrect.');
    for (const m of Object.values(errorMessages))
      expect(m).not.toMatch(/already registered|not found|exists/i);
  });
});
