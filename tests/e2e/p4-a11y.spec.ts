import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './helpers';
import {
  noOverflow,
  openProject,
  rest,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import { apiCreateRequest, apiClassify, openRequest, tokenOf } from './p3-helpers';
import {
  apiAdditionalRequest,
  apiPatchVersion,
  apiSendableCO,
  axeScan4,
  logEvidence4,
  openProposal,
  rpc,
  shot4,
  uniq4,
} from './p4-helpers';

/** Phase 4 Tester — T-11 / AC-11: axe (0 serious/critical), overflow at 375 and 1280, keyboard operation. */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const LONG = 'Supercalifragilisticexpialidocious'.repeat(5); // 170 chars, unbroken

async function check(page: Page, testInfo: TestInfo, name: string) {
  const v = await axeScan4(page, testInfo, name);
  const serious = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  const o = await noOverflow(page, true);
  logEvidence4('a11y-T11.jsonl', testInfo, name, { violations: v, overflow: o });
  await shot4(page, testInfo, `T11-${name}`);
  expect.soft(serious, `${name}: serious/critical axe violations`).toEqual([]);
}

test('T-11 axe + overflow: proposal page (draft, preview, confirm, sent, multi-version), request page, project page', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(240_000);
  const token = tokenOf(sessionA);
  // Empty proposals section
  const empty = await apiAdditionalRequest(page, token, uniq4(testInfo, 'a11y-empty'));
  await openProject(page, empty.projectId);
  await expect(page.getByText('No change proposals yet')).toBeVisible();
  await check(page, testInfo, 'project-empty-proposals');
  await openRequest(page, empty.projectId, empty.requestId);
  await expect(page.getByRole('button', { name: 'Create change proposal' })).toBeVisible();
  await check(page, testInfo, 'request-create-panel');

  // Draft with long unbroken text, preview and confirm open
  const { projectId, requestId, coId, v1Id } = await apiSendableCO(
    page,
    token,
    uniq4(testInfo, 'a11y'),
    {
      title: LONG,
      description: `${LONG} ${LONG}`,
      assumptions: LONG,
      exclusions: LONG,
      client_terms: LONG,
      price_impact: 123456789.5,
    },
  );
  await openProposal(page, projectId, coId);
  await check(page, testInfo, 'proposal-draft');
  await page.getByRole('button', { name: 'Preview what your client sees' }).click();
  await page.getByRole('button', { name: 'Send version 1…' }).click();
  await check(page, testInfo, 'proposal-draft-preview-confirm');
  // validation state
  await page.getByLabel('Title', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Enter a title your client will recognise.').first()).toBeVisible();
  await check(page, testInfo, 'proposal-draft-errors');

  // Sent
  await rpc(page, token, 'send_change_order_version', { p_version_id: v1Id });
  await openProposal(page, projectId, coId);
  await check(page, testInfo, 'proposal-sent');
  await page.getByRole('button', { name: 'Cancel this proposal…' }).click();
  await check(page, testInfo, 'proposal-cancel-confirm');

  // Multi-version: v1 superseded, v2 cancelled, v3 pending, v4 draft
  const v2 = (await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  await rpc(page, token, 'send_change_order_version', { p_version_id: v2 });
  await rpc(page, token, 'cancel_change_order_version', { p_version_id: v2 });
  const v3 = (await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  await apiPatchVersion(page, token, v3, { price_impact: 10 });
  await rpc(page, token, 'send_change_order_version', { p_version_id: v3 });
  await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId });
  await openProposal(page, projectId, coId);
  await expect(page.getByRole('article')).toHaveCount(3);
  await check(page, testInfo, 'proposal-multi-version');

  // Request page with linked proposal; project page with proposals section
  await openRequest(page, projectId, requestId);
  await expect(page.getByRole('link', { name: 'Open the change proposal' })).toBeVisible();
  await check(page, testInfo, 'request-with-proposal');
  await openProject(page, projectId);
  await expect(
    page.getByRole('region', { name: 'Change proposals' }).getByRole('link'),
  ).toHaveCount(1);
  await check(page, testInfo, 'project-with-proposals');

  // Read-only (archived)
  const other = await apiCreateRequest(page, token, projectId, { title: 'other additional' });
  await apiClassify(page, token, other, 'additional');
  await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, { status: 'archived' });
  await openProposal(page, projectId, coId);
  await check(page, testInfo, 'proposal-archived');
});

test('T-11 keyboard: create, fill, preview, send and create a new version without a mouse', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(page, token, uniq4(testInfo, 'kbd'));
  await openRequest(page, projectId, requestId);
  const create = page.getByRole('button', { name: 'Create change proposal' });
  await create.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Draft version 1 (not sent)' })).toBeVisible();
  const price = page.getByLabel('Price impact');
  await price.focus();
  await page.keyboard.type('250');
  await page.keyboard.press('Tab'); // Currency
  await expect(page.getByLabel('Currency')).toBeFocused();
  await page.keyboard.press('Tab'); // Time impact
  await expect(page.getByLabel('Time impact')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Time unit')).toBeFocused();
  // Preview toggle via keyboard
  const previewBtn = page.getByRole('button', { name: 'Preview what your client sees' });
  await previewBtn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Client preview' })).toContainText('+EUR 250.00');
  await expect(page.getByRole('button', { name: 'Hide client preview' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const send = page.getByRole('button', { name: 'Send version 1…' });
  await send.focus();
  await page.keyboard.press('Enter');
  const yes = page.getByRole('button', { name: 'Yes, send version 1' });
  await yes.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Version 1 sent. Its content is now fixed.')).toBeVisible();
  const nv = page.getByRole('button', { name: 'Create a new version' });
  await nv.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Draft version 2 (not sent)' })).toBeVisible();
  // focus indicator present on a focused button
  const discard = page.getByRole('button', { name: 'Discard this draft…' });
  await page.getByRole('button', { name: 'Send version 2…' }).focus();
  await page.keyboard.press('Tab');
  await expect(discard).toBeFocused();
  const outline = await discard.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
  });
  logEvidence4('a11y-T11.jsonl', testInfo, 'keyboard focus style on Discard', outline);
  expect.soft(outline, 'visible focus indicator').not.toMatch(/^none .* none$/);
});
