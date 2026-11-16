import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, hasHorizontalOverflow, isMobile, mainNav } from './helpers';

const publicPages = [
  ['/sign-in', 'Sign in'],
  ['/register', 'Create your account'],
  ['/forgot-password', 'Reset your password'],
  ['/reset-password', 'Reset link not valid'],
  ['/p', "This link isn't available"],
  ['/no-such-page', 'Page not found'],
] as const;
const appPages = [
  ['/', 'Dashboard'],
  ['/projects', 'Projects'],
  ['/settings', 'Settings'],
] as const;

async function headingLevels(page: import('@playwright/test').Page) {
  return page.locator('h1,h2,h3,h4,h5,h6').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
}

function assertHeadingOrder(levels: number[]) {
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
}

async function runAxe(page: import('@playwright/test').Page, project: string, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  mkdirSync('docs/testing/phase1/axe', { recursive: true });
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
  }));
  writeFileSync(
    `docs/testing/phase1/axe/${project}-${name}.json`,
    JSON.stringify(
      { url: page.url(), violations: summary, passes: results.passes.length },
      null,
      2,
    ),
  );
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

const slug = (p: string) => (p === '/' ? 'dashboard' : p.replace(/^\//, '').replace(/\//g, '-'));

test.describe('signed out pages', () => {
  for (const [path, h1] of publicPages) {
    test(`T-13/T-14 ${path}: no overflow, 0 serious/critical axe, labelled inputs, heading order`, async ({
      page,
    }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
      const o = await hasHorizontalOverflow(page);
      expect(o.scrollWidth, JSON.stringify(o)).toBeLessThanOrEqual(o.clientWidth);
      expect(await runAxe(page, testInfo.project.name, slug(path))).toEqual([]);
      assertHeadingOrder(await headingLevels(page));
      // Every form control has an accessible name.
      for (const input of await page.locator('input, select, textarea').all()) {
        expect(
          await input.evaluate((el) => (el as HTMLInputElement).labels?.length ?? 0),
        ).toBeGreaterThan(0);
      }
    });
  }
});

test.describe('signed in pages', () => {
  test.use({ signedInAs: 'A' });

  for (const [path, h1] of appPages) {
    test(`T-13/T-14 ${path}: no overflow, 0 serious/critical axe, heading order`, async ({
      page,
    }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
      if (path === '/settings')
        await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
      const o = await hasHorizontalOverflow(page);
      expect(o.scrollWidth, JSON.stringify(o)).toBeLessThanOrEqual(o.clientWidth);
      expect(await runAxe(page, testInfo.project.name, slug(path))).toEqual([]);
      assertHeadingOrder(await headingLevels(page));
      if (isMobile(testInfo)) {
        // Mobile menu open state must not overflow either
        await (await mainNav(page, true)).waitFor();
        const o2 = await hasHorizontalOverflow(page);
        expect(o2.scrollWidth).toBeLessThanOrEqual(o2.clientWidth);
        expect(await runAxe(page, testInfo.project.name, `${slug(path)}-menu-open`)).toEqual([]);
      }
    });
  }

  test('T-13 / AC-9: main navigation is keyboard-operable, with visible focus (AC-10)', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const mobile = isMobile(testInfo);

    // Tab from the top of the page until a target control has focus.
    async function tabTo(name: RegExp, max = 15) {
      for (let i = 0; i < max; i++) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return (el?.innerText || el?.getAttribute('aria-label') || '').trim();
        });
        if (name.test(label)) return;
      }
      throw new Error(`could not reach ${name} with Tab`);
    }
    async function focusVisible() {
      return page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return {
          outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
          matches: el.matches(':focus-visible'),
        };
      });
    }

    await page.locator('body').click({ position: { x: 1, y: 1 } });
    if (mobile) {
      await tabTo(/open menu/i);
      expect((await focusVisible()).outline).not.toMatch(/^none/);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: /close menu/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    }
    await tabTo(/^Projects$/);
    const f = await focusVisible();
    expect(f.matches).toBe(true);
    expect(f.outline).not.toMatch(/^none/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

    if (mobile) {
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await tabTo(/open menu/i);
      await page.keyboard.press('Enter');
    }
    await tabTo(/^Settings$/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/settings');
    // Skip link exists and is first in tab order
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Skip to main content');
    await page.screenshot({
      path: `docs/testing/phase1/screenshots/${testInfo.project.name}-T13-skip-link-focus.png`,
    });
  });

  test('AC-9: mobile nav reachable, desktop nav visible', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const nav = await mainNav(page, isMobile(testInfo));
    for (const name of ['Dashboard', 'Projects', 'Settings'])
      await expect(nav.getByRole('link', { name })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.screenshot({
      path: `docs/testing/phase1/screenshots/${testInfo.project.name}-AC09-nav.png`,
    });
  });
});
