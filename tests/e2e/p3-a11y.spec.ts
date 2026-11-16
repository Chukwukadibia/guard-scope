import { test, expect } from './helpers';
import {
  apiCreateProject,
  noOverflow,
  openProject,
  rest,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import {
  apiClassify,
  apiConfirmedProject,
  apiCreateRequest,
  axeScan3,
  localDate,
  logEvidence,
  openRequest,
  requestsRegion,
  shot3,
  tokenOf,
  uniq3,
} from './p3-helpers';

/** Phase 3 Tester — T-10 / AC-10: axe 0 serious/critical, keyboard, no horizontal overflow at 375 and 1280. */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const serious = (v: { impact?: string | null }[]) =>
  v.filter((x) => x.impact === 'serious' || x.impact === 'critical');

test('T-10 axe + overflow on every Phase 3 page and state', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(180_000);
  const token = tokenOf(sessionA);
  const results: Record<string, number> = {};
  const all: Record<string, unknown> = {};
  const overflow: Record<string, unknown> = {};
  const check = async (name: string) => {
    const o = await noOverflow(page, true);
    if (o.scrollWidth > o.clientWidth) overflow[name] = o;
    const v = await axeScan3(page, testInfo, name);
    results[name] = serious(v).length;
    all[name] = v.map((x) => `${x.impact}:${x.id}`);
    await shot3(page, testInfo, `T10-${name}`);
  };

  // 1. project without confirmed scope, no requests
  const p0 = await apiCreateProject(page, token, {
    title: uniq3(testInfo, 'a11y-empty'),
    client_name: 'C',
    currency: 'EUR',
  });
  await openProject(page, p0);
  await expect(page.getByText('No requests yet')).toBeVisible();
  await check('project-empty-no-scope');

  // 2. validation errors in the quick-add form
  await requestsRegion(page).getByRole('button', { name: 'Save request' }).click();
  await expect(requestsRegion(page).getByText('There is a problem')).toBeVisible();
  await check('project-form-errors');

  // 3. project with requests in every state + revisions (incl. over-use) + long unbroken text
  const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'a11y'), {
    type: 'number',
    count: 1,
  });
  const longTitle = 'R'.repeat(200);
  const longId = await apiCreateRequest(page, token, pid, {
    title: longTitle,
    description: 'D'.repeat(5000),
    internal_notes: 'N'.repeat(5000),
    source_channel: 'whatsapp',
  });
  const ids: Record<string, string> = {};
  for (const c of ['included', 'additional', 'needs_clarification']) {
    ids[c] = await apiCreateRequest(page, token, pid, {
      title: `A11y ${c}`,
      received_on: await localDate(page, -2),
    });
    await apiClassify(page, token, ids[c], c);
  }
  // retest 1 (D-1): a multi-entry from -> to history with the 200-char unbroken title
  for (const c of ['included', 'needs_clarification', 'additional', 'included'])
    await apiClassify(page, token, longId, c);
  for (let i = 0; i < 2; i++)
    await rest(page, token, 'POST', '/rest/v1/revision_usages', {
      project_id: pid,
      request_id: longId,
      note: 'W'.repeat(500),
    });
  await openProject(page, pid);
  await expect(requestsRegion(page).getByRole('listitem')).toHaveCount(4);
  await check('project-requests-revisions-long');
  await requestsRegion(page)
    .getByRole('button', { name: /^Included \(/ })
    .click();
  await check('project-filter-included');

  // 4. request detail in each state
  await openRequest(page, pid, longId);
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByRole('listitem')).toHaveCount(5);
  await expect(history.getByRole('listitem').nth(2)).toContainText(
    /Changed from Included\s*→?\s*to Needs clarification/,
  );
  await history.scrollIntoViewIfNeeded();
  await check('request-included-long-text');
  await check('request-history-from-to');
  await page.getByRole('button', { name: 'Edit request' }).click();
  await check('request-edit-form');
  for (const c of ['additional', 'needs_clarification']) {
    await openRequest(page, pid, ids[c]);
    await check(`request-${c}`);
  }
  const unc = await apiCreateRequest(page, token, pid, { title: 'A11y unclassified' });
  await openRequest(page, pid, unc);
  await check('request-unclassified');

  // 5. not found
  await page.goto(`/projects/${pid}/requests/${crypto.randomUUID()}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Request not found' })).toBeVisible();
  await check('request-not-found');

  // 6. archived project + request
  await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, { status: 'archived' });
  await openProject(page, pid);
  await check('project-archived');
  await openRequest(page, pid, ids.included);
  await check('request-archived');

  logEvidence('a11y-T10.jsonl', testInfo, 'serious/critical per page', results);
  logEvidence('a11y-T10.jsonl', testInfo, 'all violations per page', all);
  logEvidence('a11y-T10.jsonl', testInfo, 'overflow', overflow);
  expect(results).toEqual(Object.fromEntries(Object.keys(results).map((k) => [k, 0])));
  expect(overflow).toEqual({});
});

test('T-10 keyboard: capture and classify without a mouse', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'kbd'));
  await openProject(page, pid);
  const reqs = requestsRegion(page);
  const title = reqs.getByLabel('What did the client ask for?');
  await title.focus();
  await page.keyboard.type('Keyboard request');
  await page.keyboard.press('Enter');
  await expect(reqs.getByText('Request "Keyboard request" saved.')).toBeVisible();
  await expect(title).toBeFocused(); // focus returns to the title for the next request

  // expand details by keyboard (the date input has several tab stops in Chromium)
  const more = reqs.getByRole('button', { name: 'Add details or private notes' });
  for (let i = 0; i < 10 && !(await more.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(reqs.getByLabel('Details (optional)')).toBeVisible();

  // open the request with the keyboard: Tab until the link is focused
  const link = reqs.getByRole('link', { name: /Keyboard request/ });
  for (let i = 0; i < 40 && !(await link.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();

  const group = page.getByRole('group', { name: 'Classify this request' });
  const additional = group.getByRole('button', { name: 'Additional' });
  for (
    let i = 0;
    i < 40 && !(await additional.evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press('Tab');
  await expect(additional).toBeFocused();
  const outline = await additional.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  });
  logEvidence('a11y-T10.jsonl', testInfo, 'focus style on classify button', outline);
  expect(outline.outline !== 'none' || outline.shadow !== 'none').toBe(true);
  await page.keyboard.press('Space');
  await expect(page.getByText('Marked as Additional.')).toBeVisible();
  await expect(additional).toHaveAttribute('aria-pressed', 'true');
  await shot3(page, testInfo, 'T10-keyboard-classified');
});
