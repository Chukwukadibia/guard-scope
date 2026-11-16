import { test, expect } from './helpers';
import {
  apiAddItem,
  apiCreateProject,
  apiDraftId,
  axeScan,
  noOverflow,
  openProject,
  rest,
  shot,
  uniq,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';

/** Phase 2 Tester — T-11 / AC-11: axe (0 serious/critical), keyboard, no overflow at 375/1280. */
test.use({ signedInAs: 'A' });

// Test hygiene: archive every project this test created (see trackCreatedProjects).
let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const tokenOf = (s: Record<string, unknown>) => s.access_token as string;
const serious = (v: { impact?: string | null }[]) =>
  v.filter((x) => x.impact === 'serious' || x.impact === 'critical');

test('T-11 axe + overflow on every Phase 2 page and state', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(120_000);
  const token = tokenOf(sessionA);
  const results: Record<string, number> = {};
  const overflow: Record<string, unknown> = {};
  const check = async (name: string) => {
    const o = await noOverflow(page, true);
    if (o.scrollWidth > o.clientWidth) overflow[name] = o;
    const v = await axeScan(page, testInfo, name);
    results[name] = serious(v).length;
    await shot(page, testInfo, `T11-${name}`);
  };

  // project with long unbroken text (wrap check) + a confirmed baseline + current + draft
  const longTitle = 'L'.repeat(200);
  const pid = await apiCreateProject(page, token, {
    title: longTitle,
    client_name: 'C'.repeat(200),
    client_contact: 'x'.repeat(320),
    description: 'W'.repeat(5000),
    currency: 'EUR',
    agreed_price: 123456789012.34,
    start_date: '2026-11-01',
    deadline: '2026-12-31',
  });
  const v1 = await apiDraftId(page, token, pid);
  await apiAddItem(page, token, v1, 'deliverable', 'D'.repeat(1000));
  await apiAddItem(page, token, v1, 'exclusion', 'E'.repeat(1000));
  await apiAddItem(page, token, v1, 'assumption', 'A'.repeat(1000));
  expect(
    (
      await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, {
        summary: 'S'.repeat(5000),
        notes: 'N'.repeat(5000),
      })
    ).status,
  ).toBe(200);
  expect(
    (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
  ).toBe(200);
  const v2 = await apiDraftId(page, token, pid);
  expect(
    (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v2 })).status,
  ).toBe(200);
  expect(
    (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, { agreed_price: 5 }))
      .status,
  ).toBe(200);

  const draftPid = await apiCreateProject(page, token, {
    title: uniq(testInfo, 'a11y-draft'),
    client_name: 'C',
    currency: 'EUR',
  });
  const archPid = await apiCreateProject(page, token, {
    title: uniq(testInfo, 'a11y-arch'),
    client_name: 'C',
    currency: 'EUR',
  });
  expect(
    (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${archPid}`, { status: 'archived' }))
      .status,
  ).toBe(200);

  await page.goto('/');
  await expect(page.getByTestId('active-project-count')).toBeVisible();
  await check('dashboard');

  await page.goto('/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  await check('projects-list');

  await page.goto('/projects?status=archived');
  await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  await check('projects-archived');

  await page.goto('/projects?status=completed');
  await expect(page.getByText(/No completed projects|Completed/).first()).toBeVisible();
  await check('projects-completed');

  await page.goto('/projects/new');
  await expect(page.getByLabel('Project title')).toBeVisible();
  await check('project-form');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toBeVisible();
  await check('project-form-errors');

  await page.goto(`/projects/${pid}/edit`);
  await expect(page.getByLabel('Project title')).toHaveValue(longTitle);
  await check('project-edit');

  await openProject(page, draftPid);
  await check('detail-draft-editor');
  await page.getByRole('button', { name: 'Confirm original scope' }).click();
  await expect(page.getByRole('group', { name: 'Confirm original scope?' })).toBeVisible();
  await check('confirm-dialog');
  await page.getByRole('button', { name: 'Yes, confirm' }).click();
  await expect(page.getByRole('group').getByRole('alert')).toBeVisible();
  await check('confirm-dialog-error');

  await openProject(page, pid);
  await expect(page.getByRole('heading', { name: /Current scope/ })).toBeVisible();
  await check('detail-baseline-current-draft-long-text');

  await openProject(page, archPid);
  await check('detail-archived');

  await page.goto('/projects/3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await check('project-not-found');

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  await expect(page.getByLabel('Your password')).toBeFocused();
  await page.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toBeVisible();
  await check('settings-delete-open-error');

  console.log(
    `axe serious/critical per page (${testInfo.project.name}): ${JSON.stringify(results)}`,
  );
  console.log(`overflow (${testInfo.project.name}): ${JSON.stringify(overflow, null, 1)}`);
  expect(
    Object.values(results).every((n) => n === 0),
    JSON.stringify(results),
  ).toBe(true);
});

test('T-11 keyboard: add item with Enter, remove via keyboard, confirm via keyboard', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const pid = await apiCreateProject(page, token, {
    title: uniq(testInfo, 'kbd'),
    client_name: 'C',
    currency: 'EUR',
  });
  await openProject(page, pid);
  const del = page.getByRole('region', { name: 'Deliverables' });
  await del.getByLabel('Add a deliverable').focus();
  await page.keyboard.type('Keyboard item');
  await page.keyboard.press('Enter');
  await expect(del.getByRole('listitem').filter({ hasText: 'Keyboard item' })).toBeVisible();
  await expect(del.getByLabel('Add a deliverable')).toBeFocused(); // focus returned to the add field
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await expect(del.getByRole('listitem')).toHaveCount(2);
  // reach "Remove" for "Second" via Tab from the first item's controls
  await del.getByRole('button', { name: 'Move "Keyboard item" down' }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => del.getByRole('listitem').allInnerTexts())
    .toEqual(['Second', 'Keyboard item']);
  await del.getByRole('button', { name: 'Remove "Second"' }).focus();
  await expect(del.getByRole('button', { name: 'Remove "Second"' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(del.getByRole('listitem')).toHaveCount(1);

  const confirmBtn = page.getByRole('button', { name: 'Confirm original scope' });
  await confirmBtn.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('group', { name: 'Confirm original scope?' });
  await expect(dlg).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dlg.getByRole('button', { name: 'Yes, confirm' })).toBeFocused();
  // visible focus indicator
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element);
    return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
  });
  expect(outline).not.toMatch(/^none 0px none$/);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Original scope confirmed and saved as the baseline.')).toBeVisible();
  await shot(page, testInfo, 'T11-keyboard-confirmed');
});

test('§6 realistic long text: spaced words wrap; a long URL in client contact / description', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`)
    .join(' ')
    .slice(0, 200);
  const url = `https://example.test/${'path-segment/'.repeat(20)}file.pdf`;
  const pid = await apiCreateProject(page, token, {
    title: words,
    client_name: words,
    client_contact: url,
    description: `See ${url} for the brief.`,
    currency: 'EUR',
  });
  const v1 = await apiDraftId(page, token, pid);
  await apiAddItem(page, token, v1, 'deliverable', `Deliver per ${url}`);
  const res: Record<string, unknown> = {};
  await page.goto('/projects');
  await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  res.list = await noOverflow(page, true);
  await openProject(page, pid);
  res.detail = await noOverflow(page, true);
  await shot(page, testInfo, 'S6-realistic-long-text');
  console.log(`realistic long text (${testInfo.project.name}): ${JSON.stringify(res)}`);
});
