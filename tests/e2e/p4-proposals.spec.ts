import type { Page } from '@playwright/test';
import { test, expect, USER_B, apiSession } from './helpers';
import {
  rest,
  openProject,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import { apiClassify, apiCreateRequest, localDate, openRequest, tokenOf } from './p3-helpers';
import {
  apiAdditionalRequest,
  apiCreateCO,
  apiPatchVersion,
  apiSendableCO,
  apiVersions,
  expectAmountsHaveCurrency,
  expectNoMoneyClaims,
  logEvidence4,
  openProposal,
  rpc,
  shot4,
  uniq4,
} from './p4-helpers';

/** Phase 4 Tester — UI (T-01..T-08, T-10, §6). Desktop 1280 and mobile 375 projects. */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors, 'uncaught page errors').toEqual([]);
  await archiveTracked(page, tracked);
});

const proposalPanel = (page: Page) => page.getByRole('region', { name: 'Change proposal' });
const draftRegion = (page: Page, n: number) =>
  page.getByRole('region', { name: `Draft version ${n} (not sent)` });
const versionCard = (page: Page, n: number) =>
  page.getByRole('article', { name: `Version ${n}`, exact: true });

/** No action that pretends a client link exists (no dead buttons; spec §2). */
async function expectNoDeadLinkButtons(page: Page) {
  const names = await page.locator('main').getByRole('button').allInnerTexts();
  const links = await page.locator('main').getByRole('link').allInnerTexts();
  const all = [...names, ...links].join(' | ');
  expect(all, 'dead client-link actions').not.toMatch(
    /copy link|share|send to client|email client|approval link|download|pdf/i,
  );
}

test('T-01 UI: create from an Additional request, pre-filled, no private notes; other classifications offer nothing', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'ui-create'),
    {
      currency: 'GBP',
      description: 'Client wants a pricing page with three tiers',
      notes: 'PRIVATE-NOTE-ui-create',
    },
  );
  const included = await apiCreateRequest(page, token, projectId, { title: 'An included one' });
  await apiClassify(page, token, included, 'included');
  const unclassified = await apiCreateRequest(page, token, projectId, {
    title: 'An unclassified one',
  });
  const clar = await apiCreateRequest(page, token, projectId, { title: 'A clarification one' });
  await apiClassify(page, token, clar, 'needs_clarification');

  for (const rid of [included, unclassified, clar]) {
    await openRequest(page, projectId, rid);
    await expect(page.getByRole('button', { name: 'Create change proposal' })).toHaveCount(0);
  }

  await openRequest(page, projectId, requestId);
  await expect(proposalPanel(page)).toBeVisible();
  await proposalPanel(page).getByRole('button', { name: 'Create change proposal' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/changes/[0-9a-f-]{36}$`));
  const draft = draftRegion(page, 1);
  await expect(draft).toBeVisible();
  await expect(draft.getByLabel('Title', { exact: true })).toHaveValue(/^Req P4T ui-create/);
  await expect(draft.getByLabel("What's included in this change")).toHaveValue(
    'Client wants a pricing page with three tiers',
  );
  await expect(draft.getByLabel('Currency')).toHaveValue('GBP');
  await expect(draft.getByLabel('Price impact')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('PRIVATE-NOTE');
  await expect(page.getByText('Draft (not sent)').first()).toBeVisible();
  await expectNoDeadLinkButtons(page);
  await shot4(page, testInfo, 'T01-new-draft');

  // Back on the request: a link to the proposal, not a second create button (C-1)
  await openRequest(page, projectId, requestId);
  await expect(
    proposalPanel(page).getByRole('link', { name: 'Open the change proposal' }),
  ).toBeVisible();
  await expect(proposalPanel(page).getByText('Draft (not sent)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create change proposal' })).toHaveCount(0);

  // C-6: reclassify the request -> the proposal stays linked
  await page.getByRole('button', { name: 'Included', exact: true }).click();
  await expect(
    proposalPanel(page).getByRole('link', { name: 'Open the change proposal' }),
  ).toBeVisible();
  const cos = await rest(
    page,
    token,
    'GET',
    `/rest/v1/change_orders?select=id&request_id=eq.${requestId}`,
  );
  expect((cos.body as unknown[]).length).toBe(1);
});

test('T-02 UI: edit and save every field; validation shows field messages and a summary', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'ui-edit'),
  );
  const coId = await apiCreateCO(page, token, requestId);
  await openProposal(page, projectId, coId);
  const d = draftRegion(page, 1);
  const deadline = await localDate(page, 30);

  // Validation (client side)
  await d.getByLabel('Title', { exact: true }).fill('');
  await d.getByLabel('Price impact').fill('12.345');
  await d.getByLabel('Time impact').fill('3');
  await d.getByRole('button', { name: 'Save draft' }).click();
  const summary = page
    .getByRole('alert')
    .filter({ hasText: 'Enter a title your client will recognise.' });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('link')).toHaveCount(3);
  await expect(
    d.getByText('Enter an amount like 400 or 400.50 (no negative values).').first(),
  ).toBeVisible();
  await expect(
    d.getByText('Enter both the amount of time and the unit, or leave both empty.').first(),
  ).toBeVisible();
  await shot4(page, testInfo, 'T02-validation');
  await d.getByLabel('Title', { exact: true }).fill('x'.repeat(201));
  await d.getByRole('button', { name: 'Save draft' }).click();
  await expect(d.getByText('Use 200 characters or fewer.').first()).toBeVisible();

  // Valid: every field
  await d.getByLabel('Title', { exact: true }).fill('Extra pricing page');
  await d
    .getByLabel("What's included in this change")
    .fill('Design and build one pricing page.\nThree tiers.');
  await d.getByLabel('Price impact').fill('1234.50');
  await d.getByLabel('Currency').selectOption('USD');
  await d.getByLabel('Time impact').fill('2.5');
  await d.getByLabel('Time unit').selectOption('weeks');
  await d.getByLabel('Proposed new deadline').fill(deadline);
  await d.getByLabel('Assumptions').fill('Copy supplied by the client');
  await d.getByLabel('Not included in this change').fill('Translations');
  await d.getByLabel('Terms').fill('50% before work starts');
  await d.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();

  await page.reload();
  const d2 = draftRegion(page, 1);
  await expect(d2.getByLabel('Title', { exact: true })).toHaveValue('Extra pricing page');
  await expect(d2.getByLabel("What's included in this change")).toHaveValue(
    'Design and build one pricing page.\nThree tiers.',
  );
  await expect(d2.getByLabel('Price impact')).toHaveValue('1234.5');
  await expect(d2.getByLabel('Currency')).toHaveValue('USD');
  await expect(d2.getByLabel('Time impact')).toHaveValue('2.5');
  await expect(d2.getByLabel('Time unit')).toHaveValue('weeks');
  await expect(d2.getByLabel('Proposed new deadline')).toHaveValue(deadline);
  await expect(d2.getByLabel('Assumptions')).toHaveValue('Copy supplied by the client');
  await expect(d2.getByLabel('Not included in this change')).toHaveValue('Translations');
  await expect(d2.getByLabel('Terms')).toHaveValue('50% before work starts');
  const [v] = await apiVersions(page, token, coId);
  logEvidence4('e2e-T02.jsonl', testInfo, 'saved row', v);
  expect(v).toMatchObject({
    title: 'Extra pricing page',
    price_impact: 1234.5,
    currency: 'USD',
    time_impact_value: 2.5,
    time_impact_unit: 'weeks',
    proposed_deadline: deadline,
  });
});

test('T-03/T-05/T-06/T-07/T-10 UI: preview, send confirmation, v2 supersedes v1, cancel, discard vN, history, wording', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(180_000);
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'ui-flow'),
    {
      currency: 'GBP',
      notes: 'PRIVATE-NOTE-flow',
    },
  );
  const coId = await apiCreateCO(page, token, requestId);
  await openProposal(page, projectId, coId);
  const d = draftRegion(page, 1);
  await d.getByLabel('Title', { exact: true }).fill('Pricing page v1');
  await d.getByLabel("What's included in this change").fill('');
  await d.getByLabel('Assumptions').fill('Copy from client');

  // T-03 send-time rules in the UI
  await d.getByRole('button', { name: 'Send version 1…' }).click();
  await expect(page.getByRole('group', { name: 'Send version 1?' })).toBeVisible();
  // Phase 5 copy (was: "Secure approval links ... next release.")
  await expect(page.getByRole('group', { name: 'Send version 1?' })).toContainText(
    'After sending, you get a private link to share with your client.',
  );
  await page.getByRole('button', { name: 'Yes, send version 1' }).click();
  await expect(page.getByText('Describe the extra work before sending.').first()).toBeVisible();
  await expect(
    page.getByText('Enter a price impact above 0, a time impact above 0, or both.').first(),
  ).toBeVisible();
  await d.getByLabel("What's included in this change").fill('One extra pricing page');
  await d.getByLabel('Price impact').fill('400');
  await d.getByLabel('Time impact').fill('3');
  await d.getByLabel('Time unit').selectOption('days');
  await d.getByLabel('Proposed new deadline').fill(await localDate(page, -1));
  await d.getByRole('button', { name: 'Send version 1…' }).click();
  await page.getByRole('button', { name: 'Yes, send version 1' }).click();
  await expect(page.getByText("The proposed deadline can't be in the past.").first()).toBeVisible();
  expect((await apiVersions(page, token, coId))[0].status).toBe('draft');
  await d.getByLabel('Proposed new deadline').fill(await localDate(page, 14));

  // Client preview
  await d.getByRole('button', { name: 'Preview what your client sees' }).click();
  const preview = page.getByRole('region', { name: 'Client preview' });
  await expect(preview).toContainText('Pricing page v1');
  await expect(preview).toContainText('Proposed price impact');
  await expect(preview).toContainText('+GBP 400.00');
  await expect(preview).toContainText('+3 days');
  await expect(preview).toContainText('Copy from client');
  await expect(preview).not.toContainText('PRIVATE-NOTE');
  await shot4(page, testInfo, 'T03-preview');

  // Send v1 with confirmation (unsaved changes are saved first)
  await d.getByRole('button', { name: 'Send version 1…' }).click();
  const confirm = page.getByRole('group', { name: 'Send version 1?' });
  await expect(confirm).toContainText('Unsaved changes will be saved first.');
  await expect(confirm).toContainText("It can't be edited afterwards");
  await shot4(page, testInfo, 'T03-send-confirm');
  await page.getByRole('button', { name: 'Yes, send version 1' }).click();
  await expect(page.getByText('Version 1 sent. Its content is now fixed.')).toBeVisible();
  const v1Card = versionCard(page, 1);
  await expect(v1Card).toContainText('Sent, waiting for the client');
  // Phase 5 copy (was: "Secure approval links ... next release.")
  await expect(v1Card).toContainText('Waiting for the client. Share the link below yourself');
  await expect(v1Card).toContainText('+GBP 400.00');
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  // Phase 5: after sending, the link actions are REAL (a link was just issued), so the "no dead link
  // buttons" check no longer applies here; it still applies to the draft state (T-01) above.
  await expect(page.getByRole('group', { name: 'Link for version 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expectNoMoneyClaims(page);
  await expectAmountsHaveCurrency(page);
  const v1Text = await v1Card.locator('dl').innerText();
  const [sentRow] = await apiVersions(page, token, coId);
  expect(sentRow).toMatchObject({ status: 'pending', title: 'Pricing page v1', price_impact: 400 });
  await shot4(page, testInfo, 'T03-sent');

  // T-05 new version copies, sending supersedes v1, v1 content unchanged on screen
  await page.getByRole('button', { name: 'Create a new version' }).click();
  await expect(page.getByText('New draft version created from the latest version.')).toBeVisible();
  const d2 = draftRegion(page, 2);
  await expect(d2.getByLabel('Title', { exact: true })).toHaveValue('Pricing page v1');
  await expect(d2.getByLabel('Price impact')).toHaveValue('400');
  await expect(d2.getByLabel('Time impact')).toHaveValue('3');
  await d2.getByLabel('Title', { exact: true }).fill('Pricing page v2');
  await d2.getByLabel('Price impact').fill('650');
  await d2.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await d2.getByRole('button', { name: 'Send version 2…' }).click();
  await expect(page.getByRole('group', { name: 'Send version 2?' })).toContainText(
    'marked as replaced',
  );
  await page.getByRole('button', { name: 'Yes, send version 2' }).click();
  await expect(page.getByText('Version 2 sent. Its content is now fixed.')).toBeVisible();
  await expect(versionCard(page, 2)).toContainText('Sent, waiting for the client');
  await expect(versionCard(page, 2)).toContainText('+GBP 650.00');
  await expect(versionCard(page, 1)).toContainText('Replaced by a newer version');
  await expect(versionCard(page, 1)).toContainText('Pricing page v1');
  expect(await versionCard(page, 1).locator('dl').innerText()).toBe(v1Text);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pricing page v2');
  await shot4(page, testInfo, 'T05-v2-supersedes');

  // T-06 cancel v2
  await versionCard(page, 2).getByRole('button', { name: 'Cancel this proposal…' }).click();
  await expect(
    page.getByRole('group', { name: 'Cancel version 2? The record of it stays.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('Version 2 cancelled.')).toBeVisible();
  await expect(versionCard(page, 2)).toContainText('Cancelled');
  await expect(page.getByRole('button', { name: 'Cancel this proposal…' })).toHaveCount(0);

  // T-06 discard vN keeps the others
  await page.getByRole('button', { name: 'Create a new version' }).click();
  const d3 = draftRegion(page, 3);
  await expect(d3).toBeVisible();
  await d3.getByRole('button', { name: 'Discard this draft…' }).click();
  await expect(page.getByRole('group', { name: 'Discard draft version 3?' })).toContainText(
    'Earlier sent versions stay in the record.',
  );
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(page.getByText('Draft discarded.')).toBeVisible();
  await expect(draftRegion(page, 3)).toHaveCount(0);
  await expect(versionCard(page, 1)).toBeVisible();
  await expect(versionCard(page, 2)).toBeVisible();
  expect((await apiVersions(page, token, coId)).map((v) => `${v.version_no}:${v.status}`)).toEqual([
    '1:superseded',
    '2:cancelled',
  ]);

  // T-07 history on screen, in order
  const hist = page.getByRole('region', { name: 'History' }).getByRole('listitem');
  const items = (await hist.allInnerTexts()).map((t) => t.split('\n')[0]);
  logEvidence4('e2e-T07.jsonl', testInfo, 'history on screen', items);
  expect(items).toEqual([
    expect.stringMatching(/^Change proposal created from request/),
    'Version 1 sent',
    'Approval link issued for version 1', // Phase 5: sending issues the link
    'Draft version 2 created from version 1',
    'Version 1 superseded by version 2',
    'Version 2 sent',
    'Approval link issued for version 2', // Phase 5
    'Version 2 cancelled before the client decided',
    'Draft version 3 created from version 2',
    'Draft version 3 discarded',
  ]);
  await shot4(page, testInfo, 'T07-history');

  // T-10 project page: proposals section with currency and "Proposed"
  await openProject(page, projectId);
  const section = page.getByRole('region', { name: 'Change proposals' });
  await expect(section).toContainText('Pricing page v2');
  await expect(section).toContainText('Version 2 · Proposed: +GBP 650.00, +3 days');
  await expect(section).toContainText('Cancelled');
  await expectNoMoneyClaims(page);
  await expectAmountsHaveCurrency(page);
  await shot4(page, testInfo, 'T10-project-section');
  await openRequest(page, projectId, requestId);
  await expectNoMoneyClaims(page);
  await expectAmountsHaveCurrency(page);
});

test('T-06 UI: discarding an unsent v1 removes the whole proposal', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'ui-discard1'),
  );
  const coId = await apiCreateCO(page, token, requestId);
  await openProposal(page, projectId, coId);
  await draftRegion(page, 1).getByRole('button', { name: 'Discard proposal…' }).click();
  await expect(page.getByRole('group', { name: 'Discard this unsent proposal?' })).toContainText(
    'the whole proposal is removed',
  );
  await page.getByRole('button', { name: 'Yes, discard' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}(#changes)?$`));
  await expect(
    page.getByRole('region', { name: 'Change proposals' }).getByText('No change proposals yet'),
  ).toBeVisible();
  const left = await rest(page, token, 'GET', `/rest/v1/change_orders?select=id&id=eq.${coId}`);
  expect(left.body).toEqual([]);
  await openRequest(page, projectId, requestId);
  await expect(page.getByRole('button', { name: 'Create change proposal' })).toBeVisible();
});

test('T-08 UI: completed and archived projects show proposals read-only', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, coId, v1Id } = await apiSendableCO(page, token, uniq4(testInfo, 'ui-closed'));
  await rpc(page, token, 'send_change_order_version', { p_version_id: v1Id });
  const v2 = (await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  await apiPatchVersion(page, token, v2, { title: 'Draft two title' });
  const other = await apiCreateRequest(page, token, projectId, {
    title: 'Additional without proposal',
  });
  await apiClassify(page, token, other, 'additional');
  const observations: Record<string, unknown> = {};
  for (const status of ['completed', 'archived']) {
    expect(
      (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, { status })).status,
    ).toBe(200);
    await openProposal(page, projectId, coId);
    await expect(
      page.getByText(
        `This project is ${status}. Change proposals are read-only until you reopen the project.`,
      ),
    ).toBeVisible();
    await expect(versionCard(page, 1)).toBeVisible();
    for (const name of [
      /^Send version/,
      /^Save draft$/,
      /^Create a new version$/,
      /^Cancel this proposal/,
      /^Discard/,
    ])
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    observations[`${status}: draft v2 content visible`] = await page
      .getByText('Draft two title')
      .count();
    await shot4(page, testInfo, `T08-${status}`);
    await openRequest(page, projectId, other);
    await expect(page.getByText('Reopen the project to create a change proposal.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create change proposal' })).toHaveCount(0);
  }
  logEvidence4('e2e-T08.jsonl', testInfo, 'read-only', observations);
  expect(
    (await apiVersions(page, token, coId)).map((v) => `${v.version_no}:${v.status}:${v.title}`),
  ).toEqual([expect.stringMatching(/^1:pending:/), '2:draft:Draft two title']);
});

test('§6 UI: not-found and foreign ids look the same; stale tab gets a safe message', async ({
  page,
  sessionA,
  browser,
  context,
}, testInfo) => {
  // Two tabs, a second user's session and four navigations: ~15 s unloaded, so the 30 s default
  // budget ran out under full-suite load (retest 1, run 1). Timing only; assertions unchanged.
  test.setTimeout(90_000);
  const tokenA = tokenOf(sessionA);
  const { projectId, coId, v1Id } = await apiSendableCO(page, tokenA, uniq4(testInfo, 'ui-stale'));

  // Stale tab: two tabs on the same draft; tab 1 sends, tab 2 tries to send and to save.
  const tab2 = await context.newPage();
  await openProposal(page, projectId, coId);
  await openProposal(tab2, projectId, coId);
  await draftRegion(page, 1).getByRole('button', { name: 'Send version 1…' }).click();
  await page.getByRole('button', { name: 'Yes, send version 1' }).click();
  await expect(page.getByText('Version 1 sent. Its content is now fixed.')).toBeVisible();
  await draftRegion(tab2, 1).getByRole('button', { name: 'Send version 1…' }).click();
  await tab2.getByRole('button', { name: 'Yes, send version 1' }).click();
  const stale =
    'This version was already sent, so it can no longer be changed. Refresh to see the latest state.';
  await expect(tab2.getByText(stale)).toBeVisible();
  await draftRegion(tab2, 1).getByLabel('Title', { exact: true }).fill('stale edit');
  await draftRegion(tab2, 1).getByRole('button', { name: 'Save draft' }).click();
  await expect(tab2.getByText(stale)).toBeVisible();
  await shot4(tab2, testInfo, 'S6-stale-tab');
  await tab2.close();
  const [v] = await apiVersions(page, tokenA, coId);
  expect(v.title).not.toBe('stale edit');
  expect(v.id).toBe(v1Id);

  // Not found vs foreign (B's real proposal) vs malformed
  const tokenB = tokenOf(await apiSession(browser, USER_B));
  const b = await apiSendableCO(page, tokenB, uniq4(testInfo, 'B-own'));
  const texts: Record<string, string> = {};
  for (const [label, url] of [
    ['random', `/projects/${projectId}/changes/00000000-0000-4000-8000-000000000000`],
    ['foreign', `/projects/${b.projectId}/changes/${b.coId}`],
    ['foreign-in-own-project', `/projects/${projectId}/changes/${b.coId}`],
    ['malformed', `/projects/${projectId}/changes/not-a-uuid`],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    texts[label] = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  }
  logEvidence4('e2e-S6-notfound.jsonl', testInfo, 'not found texts', texts);
  expect(texts.random).toContain('Change proposal not found');
  expect(texts.foreign).toBe(texts.random);
  expect(texts['foreign-in-own-project']).toBe(texts.random);
  expect(texts.malformed).toContain('not found');
  // B cleans up B's project (archive)
  await rest(page, tokenB, 'PATCH', `/rest/v1/projects?id=eq.${b.projectId}`, {
    status: 'archived',
  });
});
