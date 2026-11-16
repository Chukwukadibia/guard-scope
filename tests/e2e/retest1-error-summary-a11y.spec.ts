import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, hasHorizontalOverflow } from './helpers';

/**
 * Tester retest 1 (commit 006c7da): accessibility of the §6 error summary (D-1) while it is visible.
 * Runs at 1280 (desktop) and 375 (mobile). Results saved to docs/testing/phase1/axe-retest1/.
 */

const OUT = 'docs/testing/phase1/axe-retest1';

async function axeAll(page: import('@playwright/test').Page, file: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  mkdirSync(OUT, { recursive: true });
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
  }));
  writeFileSync(
    `${OUT}/${file}.json`,
    JSON.stringify({ url: page.url(), violations, passes: results.passes.length }, null, 2),
  );
  return violations;
}

async function headingLevels(page: import('@playwright/test').Page) {
  return page.locator('h1,h2,h3,h4,h5,h6').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
}

function assertHeadingOrder(levels: number[]) {
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
}

const summaryOf = (page: import('@playwright/test').Page) =>
  page
    .getByRole('alert')
    .filter({ has: page.getByRole('heading', { name: 'There is a problem' }) });

async function checkSummaryState(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  name: string,
  firstFieldId: string,
) {
  const summary = summaryOf(page);
  await expect(summary).toHaveCount(1);
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  // Every summary link points at an existing, invalid control whose inline error is still shown.
  const hrefs = await summary
    .getByRole('link')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs[0]).toBe(`#${firstFieldId}`);
  for (const h of hrefs) {
    const field = page.locator(h!);
    await expect(field).toHaveCount(1);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator(`${h}-err`)).toBeVisible();
  }
  assertHeadingOrder(await headingLevels(page));
  const o = await hasHorizontalOverflow(page);
  expect(o.scrollWidth, JSON.stringify(o)).toBeLessThanOrEqual(o.clientWidth);
  const v = await axeAll(page, `${testInfo.project.name}-${name}-summary`);
  expect(v, JSON.stringify(v)).toEqual([]); // zero violations of any impact
  await page.screenshot({
    path: `docs/testing/phase1/screenshots/${testInfo.project.name}-R1-${name}-summary.png`,
    fullPage: true,
  });
  // Keyboard: Tab from the focused summary reaches the first link; Enter moves focus to the field.
  await page.keyboard.press('Tab');
  await expect(summary.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator(`#${firstFieldId}`)).toBeFocused();
}

test.describe('signed out forms with the error summary visible', () => {
  for (const [path, button, firstFieldId, name] of [
    ['/sign-in', 'Sign in', 'sign-in-email', 'sign-in'],
    ['/register', 'Create account', 'register-email', 'register'],
    ['/forgot-password', 'Send reset link', 'forgot-password-email', 'forgot-password'],
  ] as const) {
    test(`${path}: summary is focused, linked, keyboard-operable; axe 0 violations`, async ({
      page,
    }, testInfo) => {
      await page.goto(path);
      await page.getByRole('button', { name: button }).click();
      await checkSummaryState(page, testInfo, name, firstFieldId);
    });
  }

  test('/register: invalid email and 7-char password give two summary entries in form order', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('Abc-123');
    await page.getByRole('button', { name: 'Create account' }).click();
    const links = summaryOf(page).getByRole('link');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute('href', '#register-email');
    await expect(links.nth(1)).toHaveAttribute('href', '#register-password');
    await expect(links.nth(1)).toHaveText('Use at least 8 characters.');
  });

  test('summary is removed once the errors are fixed and the form is resubmitted', async ({
    page,
  }) => {
    // The recover call is stubbed so no real email request is made (UI behaviour only).
    await page.route('**/auth/v1/recover**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/forgot-password');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(summaryOf(page)).toBeVisible();
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(summaryOf(page)).toBeFocused(); // re-focused on every failed submit
    await page.getByLabel('Email').fill('valid-r1@guardscope.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(summaryOf(page)).toHaveCount(0);
  });
});

test.describe('signed in forms with the error summary visible', () => {
  test.use({ signedInAs: 'A' });

  test('/settings: 121-char name, summary focused, linked, keyboard-operable; axe 0 violations', async ({
    page,
  }, testInfo) => {
    let patches = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/profiles') && r.method() === 'PATCH') patches++;
    });
    await page.goto('/settings');
    await page.getByLabel(/Display or business name/).fill('x'.repeat(121));
    await page.getByRole('button', { name: 'Save settings' }).click();
    await checkSummaryState(page, testInfo, 'settings', 'settings-display-name');
    expect(patches).toBe(0);
  });

  test('/reset-password (form shown with a session): short password, summary; axe 0 violations', async ({
    page,
  }, testInfo) => {
    let updates = 0;
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/user') && r.method() === 'PUT') updates++;
    });
    await page.goto('/reset-password');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choose a new password' }),
    ).toBeVisible();
    await page.getByLabel('New password').fill('Abc-123');
    await page.getByRole('button', { name: /password/i }).click();
    await checkSummaryState(page, testInfo, 'reset-password', 'reset-password-new');
    expect(updates).toBe(0);
  });
});
