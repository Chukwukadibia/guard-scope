import type { Page } from '@playwright/test';
import { test, expect, isMobile } from './helpers';
import {
  apiCreateProject,
  apiDraftId,
  openProject,
  rest,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
  apiAddItem,
} from './p2-helpers';
import {
  apiClassify,
  apiConfirmedProject,
  apiCreateRequest,
  apiSetAllowance,
  logEvidence,
  openRequest,
  shot3,
  tokenOf,
  uniq3,
} from './p3-helpers';

/** Phase 3 Tester — revision usage (T-06, PRD §7.2, C-3, C-4, BR-4). */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const panel = (page: Page) => page.getByRole('region', { name: 'Revisions', exact: true });
const used = (page: Page) => panel(page).getByTestId('revisions-used');
const remaining = (page: Page) => panel(page).getByTestId('revisions-remaining');

async function record(page: Page, note?: string, related?: string) {
  const p = panel(page);
  if (related) await p.getByLabel('Related request (optional)').selectOption({ label: related });
  if (note) await p.getByLabel('Note (optional)').fill(note);
  await p.getByRole('button', { name: 'Record a revision as used' }).click();
  await expect(p.getByText('Revision recorded as used.')).toBeVisible();
}

test.describe('T-06 / AC-6 revision usage', () => {
  test('no recording before a scope is confirmed', async ({ page, sessionA }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiCreateProject(page, token, {
      title: uniq3(testInfo, 'noscope'),
      client_name: 'C',
      currency: 'EUR',
    });
    await openProject(page, pid);
    await expect(panel(page)).toContainText(/Confirm the scope/);
    await expect(
      panel(page).getByRole('button', { name: 'Record a revision as used' }),
    ).toHaveCount(0);
    await expect(used(page)).toHaveCount(0);
    await shot3(page, testInfo, 'T06-no-scope');
    if (!isMobile(testInfo)) {
      const r = await rest(page, token, 'POST', '/rest/v1/revision_usages', { project_id: pid });
      logEvidence('api-T06.jsonl', testInfo, 'record before confirmation', r);
      expect(r.status).toBe(403);
    }
  });

  test('numeric allowance 2: record, over-use without negatives, undo', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'num'), {
      type: 'number',
      count: 2,
    });
    await apiCreateRequest(page, token, pid, { title: 'Tweak the header' });
    await openProject(page, pid);
    await expect(panel(page)).toContainText('2 revisions included');
    await expect(used(page)).toHaveText('0');
    await expect(remaining(page)).toHaveText('2');

    await record(page, 'Round one', 'Tweak the header');
    await expect(used(page)).toHaveText('1');
    await expect(remaining(page)).toHaveText('1');
    await expect(panel(page)).toContainText('Round one');
    await expect(panel(page)).toContainText('(request: Tweak the header)');
    await record(page);
    await expect(used(page)).toHaveText('2');
    await expect(remaining(page)).toHaveText('0');
    await record(page, 'over');
    await expect(used(page)).toHaveText('3');
    await expect(remaining(page)).toHaveText('0 (3 used of 2)');
    expect(await panel(page).innerText()).not.toMatch(/-\s?1\b/);
    await shot3(page, testInfo, 'T06-overuse');

    // Undo one (C-4): figures update; history logged
    await panel(page)
      .getByRole('button', { name: /^Undo revision recorded/ })
      .last()
      .click();
    await expect(panel(page).getByText('Recorded revision undone.')).toBeVisible();
    await expect(used(page)).toHaveText('2');
    await expect(remaining(page)).toHaveText('0');
    await page.reload();
    await expect(used(page)).toHaveText('2');

    const ev = await rest(
      page,
      token,
      'GET',
      `/rest/v1/activity_events?select=event_type,metadata&project_id=eq.${pid}&entity_type=eq.revision_usage&order=created_at`,
    );
    const types = (ev.body as { event_type: string }[]).map((e) => e.event_type);
    logEvidence('api-T06.jsonl', testInfo, 'revision events', ev.body);
    expect(types.filter((t) => t === 'revision.recorded')).toHaveLength(3);
    expect(types.filter((t) => t === 'revision.undone')).toHaveLength(1);
    const rows = await rest(
      page,
      token,
      'GET',
      `/rest/v1/revision_usages?select=note,request_id&project_id=eq.${pid}&order=recorded_at`,
    );
    expect((rows.body as { note: string | null }[]).map((r) => r.note)).toEqual([
      'Round one',
      null,
    ]);
  });

  test('allowance "none" and "not specified": used shown, no remaining figure', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    for (const [type, text] of [
      ['none', 'No revisions included'],
      ['not_specified', 'Not specified'],
    ] as const) {
      const pid = await apiConfirmedProject(page, token, uniq3(testInfo, type), { type });
      await openProject(page, pid);
      await expect(panel(page)).toContainText(text);
      await expect(used(page)).toHaveText('0');
      await expect(remaining(page)).toHaveCount(0);
      await record(page);
      await expect(used(page)).toHaveText('1');
      await expect(remaining(page)).toHaveCount(0);
      // PRD §7.2: never assume zero or unlimited for "not specified"
      expect(await panel(page).innerText()).not.toMatch(/unlimited|0 remaining|remaining/i);
      await shot3(page, testInfo, `T06-${type}`);
    }
  });

  test('allowance comes from the latest confirmed scope, not the draft', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'latest'), {
      type: 'number',
      count: 2,
    });
    const v2 = await apiDraftId(page, token, pid);
    await apiSetAllowance(page, token, v2, { type: 'number', count: 5 });
    const c = await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v2 });
    expect(c.status).toBe(200);
    const v3 = await apiDraftId(page, token, pid);
    await apiSetAllowance(page, token, v3, { type: 'number', count: 9 });
    await apiAddItem(page, token, v3, 'deliverable', 'draft-only item', 5);
    await openProject(page, pid);
    await expect(panel(page)).toContainText('5 revisions included');
    await expect(remaining(page)).toHaveText('5');
    await expect(panel(page)).not.toContainText('9 revisions');
  });

  test('request page: record a revision linked to an Included request', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'reqpage'), {
      type: 'number',
      count: 1,
    });
    const rid = await apiCreateRequest(page, token, pid, { title: 'Change colours' });
    await apiClassify(page, token, rid, 'included');
    await openRequest(page, pid, rid);
    const rp = page.getByRole('region', { name: 'Revisions for this request' });
    await expect(rp).toContainText('1 revision included');
    await rp.getByLabel('Note (optional)').fill('colour round');
    await rp.getByRole('button', { name: 'Record a revision as used' }).click();
    await expect(rp.getByText('Revision recorded as used.')).toBeVisible();
    await expect(rp.getByTestId('revisions-used')).toHaveText('1');
    await expect(rp.getByTestId('revisions-remaining')).toHaveText('0');
    await shot3(page, testInfo, 'T06-request-page');
    const rows = await rest(
      page,
      token,
      'GET',
      `/rest/v1/revision_usages?select=request_id,note&project_id=eq.${pid}`,
    );
    expect(rows.body).toEqual([{ request_id: rid, note: 'colour round' }]);

    // Other classifications do not show the panel
    await apiClassify(page, token, rid, 'additional');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Revisions for this request' })).toHaveCount(0);
  });

  test('API: a usage cannot link to a request from another project (BR-4)', async ({
    page,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is enough');
    const token = tokenOf(sessionA);
    const p1 = await apiConfirmedProject(page, token, uniq3(testInfo, 'link1'));
    const p2 = await apiConfirmedProject(page, token, uniq3(testInfo, 'link2'));
    const r2 = await apiCreateRequest(page, token, p2, { title: 'in p2' });
    const r1 = await apiCreateRequest(page, token, p1, { title: 'in p1' });
    const res = {
      foreign: await rest(page, token, 'POST', '/rest/v1/revision_usages', {
        project_id: p1,
        request_id: r2,
      }),
      random: await rest(page, token, 'POST', '/rest/v1/revision_usages', {
        project_id: p1,
        request_id: crypto.randomUUID(),
      }),
      same: await rest(page, token, 'POST', '/rest/v1/revision_usages?select=id', {
        project_id: p1,
        request_id: r1,
      }),
      forgedRecordedBy: await rest(page, token, 'POST', '/rest/v1/revision_usages', {
        project_id: p1,
        recorded_by: crypto.randomUUID(),
      }),
      edit: await rest(page, token, 'PATCH', `/rest/v1/revision_usages?project_id=eq.${p1}`, {
        note: 'edited',
      }),
    };
    logEvidence('api-T06.jsonl', testInfo, 'link rules', res);
    expect(res.foreign.status).toBe(403);
    expect(res.random.status).toBe(403);
    expect(res.same.status).toBe(201);
    expect([401, 403]).toContain(res.forgedRecordedBy.status);
    expect([401, 403]).toContain(res.edit.status);
  });
});
