import { test, expect, USER_A, isMobile, screenshot } from './helpers';
import { rest } from './p2-helpers';

test.use({ signedInAs: 'A' });

/**
 * The inline error for `field`: the element referenced by its aria-describedby that has `text`.
 * Scoped this way because the §6 error summary repeats the message as a link (GOV.UK pattern),
 * so a page-wide getByText would match twice. Asserts the field is invalid first.
 */
async function inlineError(
  page: import('@playwright/test').Page,
  field: import('@playwright/test').Locator,
  text: string,
) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const ids = ((await field.getAttribute('aria-describedby')) ?? '').split(' ').filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  const err = page.locator(ids.map((id) => `[id="${id}"]`).join(',')).filter({ hasText: text });
  await expect(err).toHaveCount(1);
  return err;
}

async function saveSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

test.describe('T-11 / AC-8 settings persist (BR-4)', () => {
  test('currency starts "Not set"; name + EUR persist after reload; then reset', async ({
    page,
  }, testInfo) => {
    test.skip(
      isMobile(testInfo),
      'mutates user A profile; run once (desktop) to avoid cross-project races',
    );
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
  test('121-character name gives a field error linked via aria-describedby; nothing is sent', async ({
    page,
  }, testInfo) => {
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
    const err = await inlineError(page, name, 'Use 120 characters or fewer.');
    await expect(err).toBeVisible();
    const errId = await err.getAttribute('id');
    expect(errId).toBeTruthy();
    expect((await name.getAttribute('aria-describedby'))?.split(' ')).toContain(errId);
    expect(patches).toBe(0);
    await screenshot(page, testInfo, 'T12-name-too-long');
  });

  test('currency not in the list gives a field error linked via aria-describedby', async ({
    page,
  }) => {
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
    const err = await inlineError(page, currency, 'Choose a currency from the list.');
    await expect(err).toBeVisible();
    expect((await currency.getAttribute('aria-describedby'))?.split(' ')).toContain(
      await err.getAttribute('id'),
    );
  });

  test('§6: validation errors are summarised on submit', async ({ page }) => {
    await page.goto('/settings');
    const name = page.getByLabel(/Display or business name/);
    await name.fill('x'.repeat(121));
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(await inlineError(page, name, 'Use 120 characters or fewer.')).toBeVisible();
    // A submit summary is an alert/status region in addition to the inline field message.
    const summary = page
      .getByRole('alert')
      .or(page.locator('[role="status"]'))
      .filter({ hasText: /120 characters|check|error/i });
    await expect(summary).toHaveCount(1, { timeout: 2000 });
  });
});

test.describe('T-16 / AC-12 empty states, no dead actions', () => {
  // ISS-013 / P2 D-5: Phase 2 FEATURE_SPEC §6 (approved, HA-004) replaces the Phase 1 `/projects`
  // placeholder ("Projects will appear here") with an empty state that has a create action. The
  // Phase 1 intent is kept: an empty state is shown and every action in it works (no dead actions).
  for (const [path, heading, emptyTitle] of [
    ['/', 'Dashboard', 'No projects yet'],
    ['/projects', 'Projects', 'No active projects'],
  ] as const) {
    test(`${path} shows "${emptyTitle}" and no non-functional actions`, async ({
      page,
      sessionA,
    }, testInfo) => {
      test.setTimeout(300_000);
      // Precondition: an empty state needs user A to have no active projects. In a full-suite run
      // other workers create (and later archive) projects for user A, so a check made before the
      // page loads can go stale while it loads (ISS-020: the poll saw 0, then the page rendered a
      // project created in between). The precondition is therefore checked both before and after
      // the page loads, and the page is reloaded only when another test changed the data in that
      // window. If the precondition held throughout but the page still shows no empty state, the
      // test fails at once: that would be a product defect, not a race.
      const token = sessionA.access_token as string;
      const activeCount = async () => {
        const r = await rest(page, token, 'GET', '/rest/v1/projects?select=id&status=eq.active');
        expect(r.status).toBe(200);
        return (r.body as unknown[]).length;
      };
      const emptyHeading = page.getByRole('heading', { level: 2, name: emptyTitle });
      // Loaded = the empty state, or a link to a project (filter tabs and "New project" excluded).
      const projectLink = page.locator('main a[href^="/projects/"]:not([href="/projects/new"])');
      const loaded = emptyHeading.or(projectLink).first();
      const deadline = Date.now() + 240_000;
      const attempts: string[] = [];
      let busy = 0;
      for (;;) {
        expect(
          Date.now(),
          `user A kept active projects (busy polls ${busy}); attempts: ${attempts.join(', ')}`,
        ).toBeLessThan(deadline);
        if ((await activeCount()) !== 0) {
          busy += 1;
          await page.waitForTimeout(250);
          continue;
        }
        const checkedAt = Date.now() - 2_000; // 2 s clock-skew margin
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expect(loaded).toBeVisible();
        if (await emptyHeading.isVisible()) {
          if ((await activeCount()) === 0) {
            attempts.push('ok');
            break;
          }
          attempts.push('raced:empty'); // a project appeared after the empty page rendered
          continue;
        }
        // The page listed projects although none was active before it loaded. That is a race
        // only if every listed project was created by another test after the check; listing an
        // older (e.g. archived) project would be a product defect, so the test fails on it.
        const ids = await projectLink.evaluateAll((els) =>
          els
            .map((e) => /^\/projects\/([0-9a-f-]{36})$/.exec(e.getAttribute('href') ?? '')?.[1])
            .filter((x): x is string => !!x),
        );
        expect(ids.length, 'a listed project link').toBeGreaterThan(0);
        const listed = await rest(
          page,
          token,
          'GET',
          `/rest/v1/projects?select=id,created_at&id=in.(${ids.join(',')})`,
        );
        expect(listed.status).toBe(200);
        const old = (listed.body as { id: string; created_at: string }[]).filter(
          (p) => Date.parse(p.created_at) < checkedAt,
        );
        expect(old, 'listed projects that existed before the precondition check').toEqual([]);
        attempts.push('raced:list');
      }
      testInfo.annotations.push({
        type: 'precondition attempts',
        description: `busy polls ${busy}; ${attempts.join(', ')}`,
      });
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(emptyHeading).toBeVisible();
      const main = page.locator('main');
      await expect(main.getByRole('button')).toHaveCount(0);
      const hrefs = await main
        .getByRole('link')
        .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      for (const h of hrefs) expect(h && h !== '#' && !h.startsWith('javascript:')).toBeTruthy();
      await screenshot(page, testInfo, `T16-${heading.toLowerCase()}`);
      if (path === '/projects') {
        // Phase 2 §6: the empty state itself offers a working create action.
        const empty = main.locator('section').filter({
          has: page.getByRole('heading', { level: 2, name: emptyTitle }),
        });
        const create = empty.getByRole('link', { name: 'New project' });
        await expect(create).toHaveCount(1);
        await expect(create).toHaveAttribute('href', '/projects/new');
        await create.click();
        await expect(page).toHaveURL(/\/projects\/new$/);
        await expect(page.getByLabel('Project title')).toBeVisible();
      }
    });
  }
});
