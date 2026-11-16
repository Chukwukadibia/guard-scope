import type { Page, Route } from '@playwright/test';
import { test, expect, USER_A, isMobile, screenshot } from './helpers';

/**
 * Tester-authored, retest 2 (D-5 / ISS-007, AC-11 / BR-5).
 * The register and forgot-password UI outcome must not depend on whether the email is registered,
 * including when the server answers 429 over_email_send_rate_limit or 5xx (sent only for addresses
 * that would receive an email). Mocked tests replace the real GoTrue answer at the network layer, so
 * the real supabase-js parsing (handleError -> AuthApiError / AuthRetryableFetchError) runs.
 * Live tests (R2_LIVE=1, desktop only) hit the dev project once per address and record the real
 * HTTP status next to the UI outcome.
 */

const UNREGISTERED = 't-r2-new@guardscope.test';
const NEUTRAL_REGISTER = 'Check your email';
const NEUTRAL_RESET = 'If an account exists for that email';

type Mock = { name: string; status: number; body: string; contentType?: string };
const json = (o: object) => JSON.stringify(o);

// Server answers whose occurrence can depend on registration state.
const SERVER_ANSWERS: Mock[] = [
  {
    name: '429 over_email_send_rate_limit',
    status: 429,
    body: json({
      code: 429,
      error_code: 'over_email_send_rate_limit',
      msg: 'email rate limit exceeded',
    }),
  },
  {
    name: '500 SMTP failure',
    status: 500,
    body: json({
      code: 500,
      error_code: 'unexpected_failure',
      msg: 'Error sending confirmation email',
    }),
  },
  { name: '502 non-JSON', status: 502, body: '<html>Bad gateway</html>', contentType: 'text/html' },
  {
    name: '422 user_already_exists',
    status: 422,
    body: json({ code: 422, error_code: 'user_already_exists', msg: 'User already registered' }),
  },
  {
    name: '400 email_address_not_authorized',
    status: 400,
    body: json({ code: 400, error_code: 'email_address_not_authorized', msg: 'not authorized' }),
  },
];

// The obfuscated 200 body GoTrue returns for signup with confirmation on.
const SIGNUP_OK = json({
  id: '00000000-0000-0000-0000-000000000000',
  aud: 'authenticated',
  role: '',
  email: UNREGISTERED,
  identities: [],
  user_metadata: {},
  app_metadata: {},
  created_at: '2026-11-16T00:00:00Z',
  updated_at: '2026-11-16T00:00:00Z',
});

function fulfil(m: Mock) {
  return (route: Route) =>
    route.fulfill({
      status: m.status,
      contentType: m.contentType ?? 'application/json',
      headers: { 'x-supabase-api-version': '2024-01-01' },
      body: m.body,
    });
}

async function registerOutcome(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Long-enough-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1)
    .not.toHaveText('Create your account', { timeout: 15_000 })
    .catch(() => {});
  return `${await h1.innerText()} | ${(await page.locator('main').innerText()).trim()}`;
}

async function registerError(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Long-enough-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  const alert = page.getByRole('alert').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  // Still on the form: the neutral "Check your email" outcome must not appear.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your account');
  return (await alert.innerText()).trim();
}

async function resetOutcome(page: Page, email: string) {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const result = page.getByRole('status').or(page.getByRole('alert')).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  return `${(await result.innerText()).trim()} | ${(await page.locator('main').innerText()).trim()}`;
}

test.describe('D-5 mocked server answers: register', () => {
  test('every server answer gives the same UI as a 200, for registered and unregistered emails', async ({
    page,
  }) => {
    await page.route('**/auth/v1/signup*', fulfil({ name: '200', status: 200, body: SIGNUP_OK }));
    const baseline = await registerOutcome(page, UNREGISTERED);
    expect(baseline).toContain(NEUTRAL_REGISTER);
    await page.unrouteAll();
    for (const m of SERVER_ANSWERS) {
      await page.route('**/auth/v1/signup*', fulfil(m));
      for (const email of [UNREGISTERED, USER_A.email]) {
        const outcome = await registerOutcome(page, email);
        expect(outcome, `${m.name} / ${email}`).toBe(baseline.replace(UNREGISTERED, email));
      }
      await page.unrouteAll();
    }
  });

  test('weak_password and transport failure are surfaced (independent of the address)', async ({
    page,
  }) => {
    await page.route(
      '**/auth/v1/signup*',
      fulfil({
        name: '422 weak_password',
        status: 422,
        body: json({
          code: 422,
          error_code: 'weak_password',
          msg: 'Password should be at least 8 characters.',
          weak_password: { reasons: ['length'] },
        }),
      }),
    );
    const weak: string[] = [];
    for (const email of [UNREGISTERED, USER_A.email]) {
      weak.push(await registerError(page, email));
    }
    expect(weak[0]).toContain('Choose a stronger password');
    expect(weak[1]).toBe(weak[0]);
    await page.unrouteAll();

    await page.route('**/auth/v1/signup*', (r) => r.abort('failed'));
    const net: string[] = [];
    for (const email of [UNREGISTERED, USER_A.email]) {
      net.push(await registerError(page, email));
    }
    expect(net[0]).toContain("Can't reach GuardScope");
    expect(net[1]).toBe(net[0]);
  });
});

test.describe('D-5 mocked server answers: forgot password', () => {
  test('every server answer gives the same neutral message as a 200, for both emails', async ({
    page,
  }, testInfo) => {
    await page.route('**/auth/v1/recover*', fulfil({ name: '200', status: 200, body: '{}' }));
    const baseline = await resetOutcome(page, UNREGISTERED);
    expect(baseline).toContain(NEUTRAL_RESET);
    await page.unrouteAll();
    for (const m of SERVER_ANSWERS) {
      await page.route('**/auth/v1/recover*', fulfil(m));
      for (const email of [UNREGISTERED, USER_A.email]) {
        expect(await resetOutcome(page, email), `${m.name} / ${email}`).toBe(baseline);
      }
      if (m.status === 429) await screenshot(page, testInfo, 'R2-forgot-mock-429');
      await page.unrouteAll();
    }
  });

  test('transport failure shows the connection error for both emails', async ({ page }) => {
    await page.route('**/auth/v1/recover*', (r) => r.abort('failed'));
    const out: string[] = [];
    for (const email of [UNREGISTERED, USER_A.email]) {
      await resetOutcome(page, email);
      out.push((await page.getByRole('alert').first().innerText()).trim());
    }
    expect(out[0]).toContain("Can't reach GuardScope");
    expect(out[1]).toBe(out[0]);
  });
});

test.describe('D-5 live (dev project)', () => {
  test.skip(!process.env.R2_LIVE, 'live auth calls run once, explicitly (R2_LIVE=1)');

  test('register and forgot-password: real server status vs UI outcome', async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'rate-limited auth endpoint; run once');
    test.setTimeout(300_000);
    const seen: string[] = [];
    page.on('response', async (r) => {
      const u = r.url();
      if (u.includes('/auth/v1/signup') || u.includes('/auth/v1/recover')) {
        let code = '';
        try {
          const b = (await r.json()) as { error_code?: string; code?: string | number };
          code = String(b.error_code ?? (typeof b.code === 'string' ? b.code : ''));
        } catch {
          /* non-JSON */
        }
        seen.push(`${new URL(u).pathname} ${r.status()} ${code}`.trim());
      }
    });
    const reg: string[] = [];
    for (const email of [UNREGISTERED, USER_A.email]) {
      reg.push((await registerOutcome(page, email)).replace(email, '<email>'));
      await screenshot(
        page,
        testInfo,
        `R2-live-register-${email === UNREGISTERED ? 'new' : 'existing'}`,
      );
    }
    await page.waitForTimeout(61_000);
    const rst: string[] = [];
    for (const email of [UNREGISTERED, USER_A.email]) {
      rst.push(await resetOutcome(page, email));
      await screenshot(
        page,
        testInfo,
        `R2-live-forgot-${email === UNREGISTERED ? 'unknown' : 'existing'}`,
      );
    }
    console.log('R2 live server responses:', JSON.stringify(seen));
    console.log('R2 live register outcomes:', JSON.stringify(reg));
    console.log('R2 live forgot outcomes:', JSON.stringify(rst));
    expect(reg[0]).toContain(NEUTRAL_REGISTER);
    expect(reg[1]).toBe(reg[0]);
    expect(rst[0]).toContain(NEUTRAL_RESET);
    expect(rst[1]).toBe(rst[0]);
  });
});
