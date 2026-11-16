import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// D-5 / ISS-007 regression: signUp and requestPasswordReset must not reveal whether an email is
// registered (AC-11 / BR-5), including through the email-send rate limit.
const auth = vi.hoisted(() => ({ signUp: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth } }));

import { requestPasswordReset, signUp } from '../../src/lib/api/auth';

type Result = { error: unknown };
const ok: Result = { error: null };
const apiErr = (status: number, code: string): Result => ({
  error: new AuthApiError('server message', status, code),
});

// Every server answer that may differ by account existence.
const serverAnswers: [string, Result][] = [
  ['success', ok],
  ['user_already_exists', apiErr(422, 'user_already_exists')],
  ['email_address_not_authorized', apiErr(400, 'email_address_not_authorized')],
  ['over_email_send_rate_limit (429)', apiErr(429, 'over_email_send_rate_limit')],
  ['generic 429', apiErr(429, '')],
  ['over_request_rate_limit (429)', apiErr(429, 'over_request_rate_limit')],
  [
    'SMTP failure (500 -> AuthRetryableFetchError)',
    { error: new AuthRetryableFetchError('Error sending confirmation email', 500) },
  ],
];

const networkFailure: Result = {
  error: new AuthRetryableFetchError('Failed to fetch', 0),
};

beforeEach(() => {
  auth.signUp.mockReset();
  auth.resetPasswordForEmail.mockReset();
});

describe('signUp: uniform outcome (AC-11)', () => {
  test.each(serverAnswers)('%s -> needsConfirmation', async (_name, result) => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, ...result });
    await expect(signUp('x@example.test', 'long-enough-pw')).resolves.toEqual({
      needsConfirmation: true,
    });
  });

  test('network failure (no server response) rejects with network', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, ...networkFailure });
    await expect(signUp('x@example.test', 'long-enough-pw')).rejects.toMatchObject({
      code: 'network',
    });
  });

  test('weak_password rejects with weak_password', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      ...apiErr(422, 'weak_password'),
    });
    await expect(signUp('x@example.test', 'short')).rejects.toMatchObject({
      code: 'weak_password',
    });
  });
});

describe('requestPasswordReset: uniform outcome (AC-11)', () => {
  test.each(serverAnswers)('%s -> resolves', async (_name, result) => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, ...result });
    await expect(requestPasswordReset('x@example.test')).resolves.toBeUndefined();
  });

  test('network failure (no server response) rejects with network', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, ...networkFailure });
    await expect(requestPasswordReset('x@example.test')).rejects.toMatchObject({
      code: 'network',
    });
  });
});
