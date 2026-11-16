import {
  test,
  expect,
  USER_A,
  GENERIC_CREDENTIALS,
  STORAGE_KEY,
  signInViaUi,
  mainNav,
  isMobile,
  screenshot,
} from './helpers';

/**
 * Tester-authored (resumed run). Covers T-17, T-18, T-19 and the UI parts of T-01, T-02, T-15, T-20.
 * Calls that hit rate-limited auth endpoints (signup, recover, password grant) run on desktop only.
 */

const desktopOnly = (
  testInfo: import('@playwright/test').TestInfo,
  why = 'rate-limited auth endpoint; run once',
) => test.skip(isMobile(testInfo), why);

test.describe('T-17 / §6 offline', () => {
  test('sign-in page offline: banner shown, submit disabled; back online re-enables', async ({
    page,
    context,
  }, testInfo) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/You're offline/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await screenshot(page, testInfo, 'T17-offline-sign-in');
    await context.setOffline(false);
    await expect(page.getByText(/You're offline/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('register and forgot-password offline: auth actions disabled', async ({ page, context }) => {
    for (const [path, button] of [
      ['/register', 'Create account'],
      ['/forgot-password', 'Send reset link'],
    ] as const) {
      await page.goto(path);
      await context.setOffline(true);
      await expect(page.getByText(/You're offline/)).toBeVisible();
      await expect(page.getByRole('button', { name: button })).toBeDisabled();
      await context.setOffline(false);
    }
  });

  test.describe('signed in', () => {
    test.use({ signedInAs: 'A' });
    test('app shell offline: banner shown, Save settings disabled', async ({ page, context }) => {
      await page.goto('/settings');
      await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
      await context.setOffline(true);
      await expect(page.getByText(/You're offline/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled();
      await context.setOffline(false);
    });
  });
});

test.describe('T-18 / §6 double submit', () => {
  test('double-clicking Sign in sends exactly one password-grant request', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    const grants: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/token') && r.url().includes('grant_type=password'))
        grants.push(r.method());
    });
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(USER_A.email);
    await page.getByLabel('Password', { exact: true }).fill(USER_A.password);
    await page.getByRole('button', { name: 'Sign in' }).dblclick();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(grants.filter((m) => m === 'POST')).toHaveLength(1);
    // Sign out (local scope) so this session is not left open.
    await (await mainNav(page, false)).getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe('T-19 / §6 multiple tabs', () => {
  test('signing out in one tab sends the other tab to sign-in', async ({ context }, testInfo) => {
    desktopOnly(testInfo);
    const tab1 = await context.newPage();
    await tab1.goto('/sign-in');
    await signInViaUi(tab1, USER_A);
    await expect(tab1.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    const tab2 = await context.newPage();
    await tab2.goto('/settings');
    await expect(tab2.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    await (await mainNav(tab1, false)).getByRole('button', { name: 'Sign out' }).click();
    await expect(tab1).toHaveURL(/\/sign-in$/);

    // Tab 2 must leave protected content without any user action.
    await expect(tab2).toHaveURL(/\/sign-in\?next=%2Fsettings$/, { timeout: 10_000 });
    await expect(tab2.getByRole('heading', { level: 1, name: 'Settings' })).toHaveCount(0);
    expect(await tab2.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    await screenshot(tab2, testInfo, 'T19-other-tab-signed-out');
  });
});

test.describe('T-15 / AC-11 / BR-5 no enumeration in the UI', () => {
  test('wrong password for existing vs non-existing email shows the identical generic message', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    const messages: string[] = [];
    for (const email of [USER_A.email, 'nobody-t15@guardscope.test']) {
      await page.goto('/sign-in');
      await signInViaUi(page, { email, password: 'Wrong-password-123' });
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      messages.push((await alert.innerText()).trim());
    }
    expect(messages[0]).toContain(GENERIC_CREDENTIALS);
    expect(messages[1]).toBe(messages[0]);
    await screenshot(page, testInfo, 'T15-generic-error');
  });

  test('registering an already-registered email shows the same outcome as a new email (T-01 UI part)', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    test.setTimeout(180_000);
    const outcomes: string[] = [];
    // New address first (T-01 UI part), then an existing one (T-15). One signup call each.
    for (const email of ['t-e2e-new@guardscope.test', USER_A.email]) {
      await page.goto('/register');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill('Long-enough-pass-1');
      await page.getByRole('button', { name: 'Create account' }).click();
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1)
        .not.toHaveText('Create your account', { timeout: 15_000 })
        .catch(() => {});
      outcomes.push(`${await h1.innerText()} | ${(await page.locator('main').innerText()).trim()}`);
      await screenshot(
        page,
        testInfo,
        `T15-register-${email.startsWith('t-e2e') ? 'new' : 'existing'}`,
      );
      if (email.startsWith('t-e2e')) await page.waitForTimeout(61_000); // signup rate limit spacing
    }
    console.log('register outcomes:', JSON.stringify(outcomes));
    expect(outcomes[0]).toContain('Check your email');
    expect(outcomes[1]).toBe(outcomes[0]);
  });
});

test.describe('BR-1 client-side password rule', () => {
  test('register with a 7-character password shows a field error and sends nothing', async ({
    page,
  }) => {
    let signups = 0;
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/signup')) signups++;
    });
    await page.goto('/register');
    await page.getByLabel('Email').fill('t-never-sent@guardscope.test');
    const pw = page.getByLabel('Password', { exact: true });
    await pw.fill('Abc1234');
    await page.getByRole('button', { name: 'Create account' }).click();
    // Scoped to the inline error: the §6 error summary repeats the message as a link.
    await expect(pw).toHaveAttribute('aria-invalid', 'true');
    const err = page.locator('[id$="-err"]').filter({ hasText: 'Use at least 8 characters.' });
    await expect(err).toHaveCount(1);
    await expect(err).toBeVisible();
    expect((await pw.getAttribute('aria-describedby'))?.split(' ')).toContain(
      await err.getAttribute('id'),
    );
    expect(signups).toBe(0);
  });
});

test.describe('T-02 / BR-2 unconfirmed user (UI)', () => {
  test('unconfirmed user with the correct password is blocked with the confirm-email message', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    const pw = process.env.TESTER_PW;
    test.skip(!pw, 'unconfirmed fixture password not provided');
    await page.goto('/sign-in');
    await signInViaUi(page, { email: 't-unconfirmed@guardscope.test', password: pw! });
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    const text = (await alert.innerText()).trim();
    console.log('T-02 message:', text);
    expect(text).toMatch(/confirm/i);
    expect(text).toMatch(/email|inbox/i);
    // BR-2 wording (D-4 retest).
    expect(text).toContain('Check your email to confirm your account');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toHaveCount(0);
    await screenshot(page, testInfo, 'T02-unconfirmed');
  });
});

test.describe('T-20 / AC-13 password reset request (UI part)', () => {
  test('forgot-password shows the same neutral confirmation for registered and unknown emails', async ({
    page,
  }, testInfo) => {
    desktopOnly(testInfo);
    test.setTimeout(180_000);
    const outcomes: string[] = [];
    for (const email of ['nobody-t20@guardscope.test', USER_A.email]) {
      await page.goto('/forgot-password');
      await page.getByLabel('Email').fill(email);
      await page.getByRole('button', { name: 'Send reset link' }).click();
      const result = page.getByRole('status').or(page.getByRole('alert')).first();
      await expect(result).toBeVisible({ timeout: 15_000 });
      outcomes.push((await result.innerText()).trim());
      await screenshot(
        page,
        testInfo,
        `T20-forgot-${email.startsWith('nobody') ? 'unknown' : 'existing'}`,
      );
      if (email.startsWith('nobody')) await page.waitForTimeout(61_000);
    }
    console.log('forgot-password outcomes:', JSON.stringify(outcomes));
    expect(outcomes[0]).toContain('If an account exists for that email');
    expect(outcomes[1]).toBe(outcomes[0]);
  });

  test('/reset-password without a recovery session shows "Reset link not valid"', async ({
    page,
  }) => {
    await page.goto('/reset-password');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Reset link not valid' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
