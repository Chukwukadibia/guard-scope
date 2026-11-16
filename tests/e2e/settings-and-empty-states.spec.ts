import { test, expect, USER_A, isMobile, screenshot } from './helpers';

test.use({ signedInAs: 'A' });

async function saveSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

test.describe('T-11 / AC-8 settings persist (BR-4)', () => {
  test('currency starts "Not set"; name + EUR persist after reload; then reset', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'mutates user A profile; run once (desktop) to avoid cross-project races');
    await page.goto('/settings');
    const name = page.getByLabel(/Display or business name/);
    const currency = page.getByLabel(/Default currency/);
    await expect(page.getByText(USER_A.email)).toBeVisible(); // US-5: signed-in email shown
    // BR-4: empty by default, shows "Not set", no USD pre-fill
    await expect(currency).toHaveValue('');
    await expect(currency.locator('option:checked')).toHaveText('Not set');
    await expect(name).toHaveValue('');

    try {
      await name.fill('Tester Studio Ltd');
      await currency.selectOption('EUR');
      await saveSettings(page);
      await screenshot(page, testInfo, 'T11-settings-saved');
      await page.reload();
      await expect(name).toHaveValue('Tester Studio Ltd');
      await expect(currency).toHaveValue('EUR');
    } finally {
      // Reset user A's profile to its original empty state.
      await page.goto('/settings');
      await page.getByLabel(/Display or business name/).fill('');
      await page.getByLabel(/Default currency/).selectOption('');
      await saveSettings(page);
      await page.reload();
      await expect(page.getByLabel(/Display or business name/)).toHaveValue('');
      await expect(page.getByLabel(/Default currency/)).toHaveValue('');
    }
  });
});

test.describe('T-12 / AC-8 settings validation', () => {
  test('121-character name gives a field error linked via aria-describedby; nothing is sent', async ({ page }, testInfo) => {
    await page.goto('/settings');
    const name = page.getByLabel(/Display or business name/);
    await expect(name).toBeVisible();
    let patches = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/profiles') && r.method() === 'PATCH') patches++;
    });
    await name.fill('x'.repeat(121));
    await expect(name).toHaveValue('x'.repeat(121));
    await page.getByRole('button', { name: 'Save settings' }).click();
    const err = page.getByText('Use 120 characters or fewer.');
    await expect(err).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    const errId = await err.getAttribute('id');
    expect(errId).toBeTruthy();
    expect((await name.getAttribute('aria-describedby'))?.split(' ')).toContain(errId);
    expect(patches).toBe(0);
    await screenshot(page, testInfo, 'T12-name-too-long');
  });

  test('currency not in the list gives a field error linked via aria-describedby', async ({ page }) => {
    await page.goto('/settings');
    const currency = page.getByLabel(/Default currency/);
    await expect(currency).toBeVisible();
    // Simulate a tampered/unknown option (cannot be chosen through the normal list).
    await currency.evaluate((el) => {
      const o = document.createElement('option');
      o.value = 'ZZZ';
      o.textContent = 'ZZZ';
      el.appendChild(o);
    });
    await currency.selectOption('ZZZ');
    await page.getByRole('button', { name: 'Save settings' }).click();
    const err = page.getByText('Choose a currency from the list.');
    await expect(err).toBeVisible();
    await expect(currency).toHaveAttribute('aria-invalid', 'true');
    expect((await currency.getAttribute('aria-describedby'))?.split(' ')).toContain(await err.getAttribute('id'));
  });

  test('§6: validation errors are summarised on submit', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel(/Display or business name/).fill('x'.repeat(121));
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Use 120 characters or fewer.')).toBeVisible();
    // A submit summary is an alert/status region in addition to the inline field message.
    const summary = page.getByRole('alert').or(page.locator('[role="status"]')).filter({ hasText: /120 characters|check|error/i });
    await expect(summary).toHaveCount(1, { timeout: 2000 });
  });
});

test.describe('T-16 / AC-12 empty states, no dead actions', () => {
  for (const [path, heading, emptyTitle] of [
    ['/', 'Dashboard', 'No projects yet'],
    ['/projects', 'Projects', 'Projects will appear here'],
  ] as const) {
    test(`${path} shows "${emptyTitle}" and no non-functional actions`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: emptyTitle })).toBeVisible();
      const main = page.locator('main');
      await expect(main.getByRole('button')).toHaveCount(0);
      const hrefs = await main.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      for (const h of hrefs) expect(h && h !== '#' && !h.startsWith('javascript:')).toBeTruthy();
      await screenshot(page, testInfo, `T16-${heading.toLowerCase()}`);
    });
  }
});
