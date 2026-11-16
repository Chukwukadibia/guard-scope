import { test, expect, SESSION_ENDED } from './helpers';

/** Debug Specialist regression checks for D-1 (§6 error summary) and D-2 (AC-4 marker). */

const summary = (page: import('@playwright/test').Page) =>
  page
    .getByRole('alert')
    .filter({ has: page.getByRole('heading', { name: 'There is a problem' }) });

test.describe('D-1 §6 error summary on failed submit', () => {
  for (const [path, button, fieldId] of [
    ['/sign-in', 'Sign in', 'sign-in-email'],
    ['/register', 'Create account', 'register-email'],
    ['/forgot-password', 'Send reset link', 'forgot-password-email'],
  ] as const) {
    test(`${path}: summary lists linked errors, takes focus, link focuses the field`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.getByRole('button', { name: button }).click();
      const box = summary(page);
      await expect(box).toBeVisible();
      await expect(box).toBeFocused();
      const link = box.locator(`a[href="#${fieldId}"]`);
      await expect(link).toHaveCount(1);
      // Inline field error is still there and still describes the field.
      const field = page.locator(`#${fieldId}`);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator(`#${fieldId}-err`)).toBeVisible();
      await link.click();
      await expect(field).toBeFocused();
    });
  }

  test.describe('settings', () => {
    test.use({ signedInAs: 'A' });
    test('121-char name: summary links to the name field; nothing is sent', async ({ page }) => {
      let patched = false;
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && r.url().includes('/rest/v1/profiles')) patched = true;
      });
      await page.goto('/settings');
      await page.locator('#settings-display-name').fill('x'.repeat(121));
      await page.getByRole('button', { name: 'Save settings' }).click();
      const box = summary(page);
      await expect(box).toBeFocused();
      await expect(box.getByRole('link', { name: 'Use 120 characters or fewer.' })).toHaveAttribute(
        'href',
        '#settings-display-name',
      );
      await expect(page.getByLabel(/Display or business name/)).toHaveAttribute(
        'id',
        'settings-display-name',
      );
      expect(patched).toBe(false);
    });
  });
});

test.describe('D-2 session-ended marker', () => {
  test('first-time visitor sees no "session has ended" message', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL('/sign-in?next=%2Fsettings');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText(SESSION_ENDED)).toHaveCount(0);
  });

  test.describe('signed in', () => {
    test.use({ signedInAs: 'A' });
    test('marker is the constant "1" (no token/PII); message is not repeated on a later fresh visit', async ({
      page,
    }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('guardscope.hadSession'))).toBe('1');
      await page.evaluate(() => {
        for (const k of Object.keys(localStorage))
          if (k.endsWith('-auth-token')) localStorage.removeItem(k);
      });
      await page.reload();
      await expect(page.getByText(SESSION_ENDED)).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('guardscope.hadSession'))).toBeNull();
      // Fresh navigation (not a reload, which keeps router history state from the redirect).
      await page.goto('/settings');
      await expect(page).toHaveURL('/sign-in?next=%2Fsettings');
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      await expect(page.getByText(SESSION_ENDED)).toHaveCount(0);
    });
  });
});
