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
import { openRequest, tokenOf } from './p3-helpers';
import {
  apiAdditionalRequest,
  apiCreateCO,
  apiPatchVersion,
  apiSendableCO,
  apiVersions,
  axeScan4,
  logEvidence4,
  openProposal,
  rpc,
  shot4,
  uniq4,
} from './p4-helpers';

/**
 * Phase 4 Tester, retest 1 (commit dde2091): D-1 / ISS-019 (closed-project proposal header),
 * D-2 / ISS-018 (Additional explainer copy), plus axe at 375 and 1280 on the affected pages.
 */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const versionCard = (page: Page, n: number) =>
  page.getByRole('article', { name: `Version ${n}`, exact: true });
const header = (page: Page) => page.locator('main h1').locator('xpath=../..');

async function a11y(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
  const v = await axeScan4(page, testInfo, `retest1-${name}`);
  const o = await noOverflow(page, true);
  await shot4(page, testInfo, `retest1-${name}`);
  logEvidence4('retest1-a11y.jsonl', testInfo, name, { violations: v, overflow: o });
  expect
    .soft(
      v.filter((x) => x.impact === 'serious' || x.impact === 'critical'),
      `${name}: serious/critical`,
    )
    .toEqual([]);
  expect.soft(o.scrollWidth, `${name}: horizontal overflow`).toBeLessThanOrEqual(o.clientWidth);
}

/**
 * D-3 / ISS-021: the project-page proposal list and the request-page panel describe the same
 * version as the proposal page header (title, version number, status badge), and never a hidden draft.
 */
async function expectRelatedPagesMatch(
  page: Page,
  testInfo: TestInfo,
  ids: { projectId: string; requestId: string },
  want: { title: string; versionNo: number; badge: string; absent: string[] },
  label: string,
) {
  await openProject(page, ids.projectId);
  const section = page.getByRole('region', { name: 'Change proposals' });
  const item = section.getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(want.title);
  await expect(item).toContainText(`Version ${want.versionNo} ·`);
  await expect(item).toContainText(want.badge);
  for (const a of want.absent) await expect(item).not.toContainText(a);
  const listText = (await item.innerText()).replace(/\s+/g, ' ');
  await a11y(page, testInfo, `D3-${label}-project`);
  await openRequest(page, ids.projectId, ids.requestId);
  const panel = page.getByRole('region', { name: 'Change proposal', exact: true });
  await expect(panel.getByRole('link', { name: 'Open the change proposal' })).toBeVisible();
  await expect(panel).toContainText(want.badge);
  for (const a of want.absent) await expect(panel).not.toContainText(a);
  const panelText = (await panel.innerText()).replace(/\s+/g, ' ');
  await a11y(page, testInfo, `D3-${label}-request`);
  logEvidence4('retest1-D3.jsonl', testInfo, label, {
    projectList: listText,
    requestPanel: panelText,
  });
}

async function expectReadOnly(page: Page, status: string) {
  await expect(
    page.getByText(
      `This project is ${status}. Change proposals are read-only until you reopen the project.`,
    ),
  ).toBeVisible();
  for (const name of [
    /^Send version/,
    /^Save draft$/,
    /^Create a new version$/,
    /^Cancel this proposal/,
    /^Discard/,
  ])
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
}

test('D-1 (a): closed project with sent versions and a hidden draft: header describes the latest sent version', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(180_000);
  const token = tokenOf(sessionA);
  const { projectId, requestId, coId, v1Id } = await apiSendableCO(
    page,
    token,
    uniq4(testInfo, 'rt1-sent'),
    { title: 'Sent one title' },
  );
  expect((await rpc(page, token, 'send_change_order_version', { p_version_id: v1Id })).status).toBe(
    200,
  );
  // v2 sent (supersedes v1), then v3 as a hidden draft: header must show v2, count 2 sent versions.
  const v2 = (await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  await apiPatchVersion(page, token, v2, { title: 'Sent two title' });
  expect((await rpc(page, token, 'send_change_order_version', { p_version_id: v2 })).status).toBe(
    200,
  );
  const v3 = (await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  await apiPatchVersion(page, token, v3, { title: 'Hidden draft three title' });

  // Active baseline: header still describes the newest version (the draft) and its editor is shown.
  await openProposal(page, projectId, coId);
  await expect(page.locator('main h1')).toHaveText('Hidden draft three title');
  await expect(header(page)).toContainText('3 versions');
  await expect(header(page)).toContainText('Draft (not sent)');
  await expect(page).toHaveTitle('Hidden draft three title · GuardScope');
  // D-3 active regression: list and panel follow the newest version (the editable draft).
  await expectRelatedPagesMatch(
    page,
    testInfo,
    { projectId, requestId },
    { title: 'Hidden draft three title', versionNo: 3, badge: 'Draft (not sent)', absent: [] },
    'a-active',
  );

  const obs: Record<string, unknown> = {};
  for (const status of ['completed', 'archived']) {
    expect(
      (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, { status })).status,
    ).toBe(200);
    await openProposal(page, projectId, coId);
    await expectReadOnly(page, status);
    await expect(page.locator('main h1')).toHaveText('Sent two title');
    await expect(page).toHaveTitle('Sent two title · GuardScope');
    await expect(header(page)).toContainText('Change proposal · 2 sent versions');
    await expect(header(page)).toContainText('Sent, waiting for the client');
    await expect(header(page)).not.toContainText('Draft (not sent)');
    await expect(header(page)).not.toContainText('3 versions');
    await expect(page.locator('main')).not.toContainText('Hidden draft three title');
    await expect(versionCard(page, 2)).toBeVisible();
    await expect(versionCard(page, 1)).toBeVisible();
    await expect(versionCard(page, 3)).toHaveCount(0);
    await a11y(page, testInfo, `D1a-${status}-proposal`);

    // D-3: the project list and request panel match the header (v2, pending), never the hidden draft.
    await expectRelatedPagesMatch(
      page,
      testInfo,
      { projectId, requestId },
      {
        title: 'Sent two title',
        versionNo: 2,
        badge: 'Sent, waiting for the client',
        absent: ['Hidden draft three title', 'Draft (not sent)', 'Version 3'],
      },
      `a-${status}`,
    );
  }
  logEvidence4('retest1-D1.jsonl', testInfo, 'sent + hidden draft, closed', obs);
  // Nothing changed in the data.
  expect((await apiVersions(page, token, coId)).map((v) => `${v.version_no}:${v.status}`)).toEqual([
    '1:superseded',
    '2:pending',
    '3:draft',
  ]);
});

test('D-1 (b): closed project with a never-sent draft only: draft header, labelled not sent, read-only', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(120_000);
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'rt1-draft'),
  );
  const coId = await apiCreateCO(page, token, requestId);
  const [v1] = await apiVersions(page, token, coId);
  await apiPatchVersion(page, token, v1.id, { title: 'Never sent title' });
  await expectRelatedPagesMatch(
    page,
    testInfo,
    { projectId, requestId },
    { title: 'Never sent title', versionNo: 1, badge: 'Draft (not sent)', absent: [] },
    'b-active',
  );
  const obs: Record<string, unknown> = {};
  for (const status of ['completed', 'archived']) {
    expect(
      (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, { status })).status,
    ).toBe(200);
    await openProposal(page, projectId, coId);
    await expectReadOnly(page, status);
    await expect(page.locator('main h1')).toHaveText('Never sent title');
    await expect(page).toHaveTitle('Never sent title · GuardScope');
    await expect(header(page)).toContainText('Change proposal · Draft only, not sent');
    await expect(header(page)).toContainText('Draft (not sent)');
    await expect(page.getByRole('heading', { name: 'Sent versions' })).toHaveCount(0);
    obs[`${status}: main text`] = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    await a11y(page, testInfo, `D1b-${status}-proposal`);
    await expectRelatedPagesMatch(
      page,
      testInfo,
      { projectId, requestId },
      { title: 'Never sent title', versionNo: 1, badge: 'Draft (not sent)', absent: ['Sent,'] },
      `b-${status}`,
    );
  }
  logEvidence4('retest1-D1.jsonl', testInfo, 'never-sent draft, closed', obs);
});

test('D-2: Additional explainer on active and closed projects is truthful and matches the panel', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'rt1-d2'),
  );
  const unavailable =
    /once .* available|not (yet )?available|coming soon|next release|later release/i;
  const explainer =
    'You marked this as outside the agreement. You can turn it into a change proposal for your client.';
  const obs: Record<string, unknown> = {};

  await openRequest(page, projectId, requestId);
  const decision = page.getByRole('region', { name: 'Your decision' });
  const panel = page.getByRole('region', { name: 'Change proposal', exact: true });
  await expect(decision).toContainText(explainer);
  await expect(decision).not.toContainText(unavailable);
  await expect(panel.getByRole('button', { name: 'Create change proposal' })).toBeVisible();
  await a11y(page, testInfo, 'D2-active-request');

  expect(
    (
      await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, {
        status: 'completed',
      })
    ).status,
  ).toBe(200);
  await openRequest(page, projectId, requestId);
  await expect(panel).toContainText('Reopen the project to create a change proposal.');
  obs['completed: decision'] = (await decision.innerText()).replace(/\s+/g, ' ');
  await expect(decision).not.toContainText(unavailable);
  await a11y(page, testInfo, 'D2-completed-request');
  logEvidence4('retest1-D2.jsonl', testInfo, 'explainer', obs);
});
