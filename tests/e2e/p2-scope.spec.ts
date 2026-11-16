import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, USER_B, apiSession, isMobile, SUPABASE_KEY, SUPABASE_URL } from './helpers';
import {
  P2_OUT,
  apiAddItem,
  apiCreateProject,
  apiDraftId,
  openProject,
  rest,
  shot,
  uniq,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';

/** Phase 2 Tester — scope (T-04..T-08). */
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

async function addItem(page: Page, region: string, label: string, text: string) {
  const sec = page.getByRole('region', { name: region });
  await sec.getByLabel(label).fill(text);
  await sec.getByRole('button', { name: 'Add' }).click();
  await expect(sec.getByRole('listitem').filter({ hasText: text })).toBeVisible();
  await expect(sec.getByLabel(label)).toHaveValue('');
}

async function itemTexts(page: Page, region: string) {
  return page.getByRole('region', { name: region }).getByRole('listitem').allInnerTexts();
}

async function confirmViaUi(page: Page, label = 'Confirm original scope') {
  await page.getByRole('button', { name: label }).click();
  const dlg = page.getByRole('group', { name: `${label}?` });
  await expect(dlg).toBeFocused();
  await dlg.getByRole('button', { name: 'Yes, confirm' }).click();
  return dlg;
}

async function getVersions(page: Page, token: string, projectId: string) {
  const r = await rest(
    page,
    token,
    'GET',
    `/rest/v1/scope_versions?select=*,scope_items(*)&project_id=eq.${projectId}&order=version_no`,
  );
  expect(r.status).toBe(200);
  const rows = r.body as Record<string, unknown>[];
  for (const v of rows)
    (v.scope_items as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

test.describe('T-04 / AC-4 draft editing', () => {
  test('add, edit, reorder, remove items; three allowance modes; summary/notes persist', async ({
    page,
    sessionA,
  }, testInfo) => {
    const id = await apiCreateProject(page, tokenOf(sessionA), {
      title: uniq(testInfo, 'draft'),
      client_name: 'Draft Client',
      currency: 'EUR',
    });
    await openProject(page, id);
    await expect(page.getByRole('heading', { name: 'Draft scope (not confirmed)' })).toBeVisible();

    await addItem(page, 'Deliverables', 'Add a deliverable', 'D-one');
    await addItem(page, 'Deliverables', 'Add a deliverable', 'D-two');
    await addItem(page, 'Deliverables', 'Add a deliverable', 'D-three');
    const del = page.getByRole('region', { name: 'Deliverables' });
    await del.getByRole('button', { name: 'Edit "D-two"' }).click();
    await del.getByLabel('Edit deliverable').fill('D-two edited');
    await del.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(del.getByText('D-two edited')).toBeVisible();
    await del.getByRole('button', { name: 'Move "D-three" up' }).click();
    await expect
      .poll(() => itemTexts(page, 'Deliverables'))
      .toEqual(['D-one', 'D-three', 'D-two edited']);
    await del.getByRole('button', { name: 'Remove "D-one"' }).click();
    await expect.poll(() => itemTexts(page, 'Deliverables')).toEqual(['D-three', 'D-two edited']);

    await addItem(page, 'Not included (exclusions)', 'Add an exclusion', 'E-one');
    await addItem(page, 'Not included (exclusions)', 'Add an exclusion', 'E-two');
    await page
      .getByRole('region', { name: 'Not included (exclusions)' })
      .getByRole('button', { name: 'Move "E-one" down' })
      .click();
    await expect
      .poll(() => itemTexts(page, 'Not included (exclusions)'))
      .toEqual(['E-two', 'E-one']);
    await addItem(page, 'Assumptions', 'Add an assumption', 'A-temp');
    await page
      .getByRole('region', { name: 'Assumptions' })
      .getByRole('button', { name: 'Remove "A-temp"' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Assumptions' }).getByText('None yet.'),
    ).toBeVisible();
    await addItem(page, 'Assumptions', 'Add an assumption', 'A-keep');

    // blank item -> field error, nothing added
    const asm = page.getByRole('region', { name: 'Assumptions' });
    await asm.getByLabel('Add an assumption').fill('   ');
    await asm.getByRole('button', { name: 'Add' }).click();
    await expect(asm.getByText('Enter a description.')).toBeVisible();

    // summary, notes, allowance: none
    await page.getByLabel('Scope summary').fill('Five-page site');
    await page.getByLabel('Notes').fill('Agreed on call');
    await page.getByLabel('No revisions included').check();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect.poll(() => itemTexts(page, 'Deliverables')).toEqual(['D-three', 'D-two edited']);
    await expect
      .poll(() => itemTexts(page, 'Not included (exclusions)'))
      .toEqual(['E-two', 'E-one']);
    await expect.poll(() => itemTexts(page, 'Assumptions')).toEqual(['A-keep']);
    await expect(page.getByLabel('Scope summary')).toHaveValue('Five-page site');
    await expect(page.getByLabel('Notes')).toHaveValue('Agreed on call');
    await expect(page.getByLabel('No revisions included')).toBeChecked();

    // number: invalid then 3
    await page.getByLabel('A set number of revisions').check();
    await page.getByRole('textbox', { name: 'Number of revisions' }).fill('abc');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Number of revisions' }).fill('3');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('A set number of revisions')).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Number of revisions' })).toHaveValue('3');

    // not specified
    await page.getByLabel('Not specified').check();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Not specified')).toBeChecked();
    await shot(page, testInfo, 'T04-draft-after-reload');
  });
});

test.describe('T-05 / AC-5 confirm', () => {
  test('UI: confirming with no deliverable is rejected with the empty-scope message', async ({
    page,
    sessionA,
  }, testInfo) => {
    const id = await apiCreateProject(page, tokenOf(sessionA), {
      title: uniq(testInfo, 'empty'),
      client_name: 'C',
      currency: 'EUR',
    });
    await openProject(page, id);
    await expect(page.getByText('Add at least one deliverable before confirming.')).toBeVisible();
    const dlg = await confirmViaUi(page);
    await expect(dlg.getByRole('alert')).toBeVisible();
    await shot(page, testInfo, 'T05-empty-scope');
    // Exact text. Alert starts with a visually hidden "Error: " prefix for screen readers
    // (Phase 1 a11y pattern), so the full accessible text is asserted, prefix included.
    await expect(dlg.getByRole('alert')).toHaveText(
      'Error: Add at least one deliverable before confirming the scope.',
    );
    // nothing confirmed
    const vs = await getVersions(page, tokenOf(sessionA), id);
    expect(vs.filter((v) => v.confirmed_at)).toHaveLength(0);
  });

  test('UI: valid confirm shows date, baseline label, "Not specified" revisions; API flags baseline', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const id = await apiCreateProject(page, token, {
      title: uniq(testInfo, 'confirm'),
      client_name: 'C',
      currency: 'EUR',
      agreed_price: 1200,
      deadline: '2026-12-15',
    });
    await openProject(page, id);
    await addItem(page, 'Deliverables', 'Add a deliverable', 'Logo');
    await confirmViaUi(page);
    await expect(
      page.getByText('Original scope confirmed and saved as the baseline.'),
    ).toBeVisible();
    const baseline = page.getByRole('article', { name: /Original agreement/ });
    await expect(
      baseline.getByRole('heading', { name: /Original agreement.*baseline/ }),
    ).toBeVisible();
    await expect(
      baseline.getByText(
        /^Confirmed \d{1,2} \w{3} \d{4}, \d{2}:\d{2} .+\. This record cannot be changed\.$/,
      ),
    ).toBeVisible();
    await expect(baseline.getByText('Not specified')).toBeVisible(); // BR-4
    await expect(baseline.getByText('EUR 1,200.00')).toBeVisible();
    await expect(baseline.getByText('15 Dec 2026')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Draft changes (not confirmed)' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm as version 2' })).toBeVisible();
    await shot(page, testInfo, 'T05-confirmed');
    const vs = await getVersions(page, token, id);
    expect(vs[0].is_original_baseline).toBe(true);
    expect(vs[0].confirmed_at).not.toBeNull();
    expect(vs[1].confirmed_at).toBeNull();
    // overview shows baseline status + counts (PROJ-003)
    await expect(
      page
        .getByRole('region', { name: 'Overview' })
        .getByText(/Confirmed .* 1 deliverable, 0 exclusions/),
    ).toBeVisible();
  });

  test('UI: stale tab confirming an already-confirmed draft gets the safe "already confirmed" message', async ({
    page,
    context,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const id = await apiCreateProject(page, token, {
      title: uniq(testInfo, 'stale'),
      client_name: 'C',
      currency: 'EUR',
    });
    await apiAddItem(page, token, await apiDraftId(page, token, id), 'deliverable', 'Thing');
    const page2 = await context.newPage();
    await openProject(page, id);
    await openProject(page2, id);
    await confirmViaUi(page);
    await expect(
      page.getByText('Original scope confirmed and saved as the baseline.'),
    ).toBeVisible();
    const dlg2 = await confirmViaUi(page2);
    await expect(dlg2.getByRole('alert')).toBeVisible();
    await shot(page2, testInfo, 'T05-stale-confirm');
    // Exact text incl. the sr-only "Error: " prefix (see the empty-scope test above).
    await expect(dlg2.getByRole('alert')).toHaveText(
      'Error: This scope was already confirmed. Refresh the page to see the latest version.',
    );
    const vs = await getVersions(page, token, id);
    expect(vs.filter((v) => v.confirmed_at)).toHaveLength(1);
  });

  test('API: double confirm (sequential and concurrent) -> exactly one confirmation, other already_confirmed', async ({
    page,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is sufficient');
    const token = tokenOf(sessionA);
    const log: string[] = [];
    // sequential
    const id1 = await apiCreateProject(page, token, {
      title: uniq(testInfo, 'dbl-seq'),
      client_name: 'C',
      currency: 'EUR',
    });
    const d1 = await apiDraftId(page, token, id1);
    const empty = await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', {
      p_version_id: d1,
    });
    log.push(`confirm with no deliverable: HTTP ${empty.status} ${JSON.stringify(empty.body)}`);
    expect((empty.body as { message: string }).message).toBe('empty_scope');
    await apiAddItem(page, token, d1, 'deliverable', 'X');
    const first = await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', {
      p_version_id: d1,
    });
    const second = await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', {
      p_version_id: d1,
    });
    log.push(
      `sequential: 1st HTTP ${first.status} is_original_baseline=${(first.body as { is_original_baseline?: boolean }).is_original_baseline}; 2nd HTTP ${second.status} ${JSON.stringify(second.body)}`,
    );
    expect(first.status).toBe(200);
    expect((first.body as { is_original_baseline: boolean }).is_original_baseline).toBe(true);
    expect((second.body as { message: string }).message).toBe('already_confirmed');

    // concurrent (two requests in flight at once)
    const id2 = await apiCreateProject(page, token, {
      title: uniq(testInfo, 'dbl-conc'),
      client_name: 'C',
      currency: 'EUR',
    });
    const d2 = await apiDraftId(page, token, id2);
    await apiAddItem(page, token, d2, 'deliverable', 'Y');
    const results = await page.evaluate(
      async ({ url, key, token, d2 }) => {
        const call = () =>
          fetch(`${url}/rest/v1/rpc/confirm_scope`, {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_version_id: d2 }),
          }).then(async (r) => ({ status: r.status, body: await r.json() }));
        return Promise.all([call(), call(), call()]);
      },
      { url: SUPABASE_URL, key: SUPABASE_KEY, token, d2 },
    );
    log.push(
      `concurrent x3: ${results.map((r) => `${r.status}:${r.body.message ?? 'ok v' + r.body.version_no}`).join(', ')}`,
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.message === 'already_confirmed')).toHaveLength(2);
    const vs = await getVersions(page, token, id2);
    log.push(
      `after concurrent: versions=${vs.map((v) => `v${v.version_no}:${v.confirmed_at ? 'confirmed' : 'draft'}${v.is_original_baseline ? ':baseline' : ''}`).join(' ')}`,
    );
    expect(vs.filter((v) => v.is_original_baseline)).toHaveLength(1);
    expect(vs.filter((v) => !v.confirmed_at)).toHaveLength(1);
    expect(vs).toHaveLength(2);
    writeFileSync(`${P2_OUT}/api-T05-double-confirm.log`, log.join('\n') + '\n');
  });
});

test.describe('T-06 / AC-6 baseline unchanged after later edits', () => {
  test('edit price/deadline + scope, confirm v2; baseline identical; UI shows original/current/draft', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const title = uniq(testInfo, 'base');
    const id = await apiCreateProject(page, token, {
      title,
      client_name: 'C',
      currency: 'EUR',
      agreed_price: 1000,
      start_date: '2026-11-01',
      deadline: '2026-12-31',
    });
    await openProject(page, id);
    await addItem(page, 'Deliverables', 'Add a deliverable', 'D1 original');
    await addItem(page, 'Not included (exclusions)', 'Add an exclusion', 'E1 original');
    await page.getByLabel('Scope summary').fill('Original summary');
    await page.getByLabel('A set number of revisions').check();
    await page.getByRole('textbox', { name: 'Number of revisions' }).fill('2');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await confirmViaUi(page);
    await expect(
      page.getByText('Original scope confirmed and saved as the baseline.'),
    ).toBeVisible();
    const before = (await getVersions(page, token, id))[0];

    // change project terms
    await page.getByRole('link', { name: 'Edit project' }).click();
    await page.getByLabel('Agreed price').fill('2500');
    await page.getByLabel('Deadline').fill('2027-02-28');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Project updated.')).toBeVisible();

    // change draft
    const del = page.getByRole('region', { name: 'Deliverables' });
    await del.getByRole('button', { name: 'Edit "D1 original"' }).click();
    await del.getByLabel('Edit deliverable').fill('D1 changed');
    await del.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(del.getByText('D1 changed')).toBeVisible();
    await addItem(page, 'Deliverables', 'Add a deliverable', 'D2 new');
    await page
      .getByRole('region', { name: 'Not included (exclusions)' })
      .getByRole('button', { name: 'Remove "E1 original"' })
      .click();
    await page.getByLabel('Scope summary').fill('Changed summary');
    await page.getByLabel('No revisions included').check();
    await confirmViaUi(page, 'Confirm as version 2'); // unsaved changes are saved first
    await expect(page.getByText('New scope version confirmed.')).toBeVisible();

    const after = await getVersions(page, token, id);
    expect(after[0]).toEqual(before); // byte-for-byte via API (all columns + items)
    expect(after[1].confirmed_at).not.toBeNull();
    expect(after[1].is_original_baseline).toBe(false);
    expect(after[1].agreed_price).toBe(2500);
    expect(after[1].summary).toBe('Changed summary');
    expect(after[2].confirmed_at).toBeNull();
    writeFileSync(
      `${P2_OUT}/api-T06-baseline-${testInfo.project.name}.json`,
      JSON.stringify({ baseline_before_v2: before, versions_after_v2: after }, null, 2),
    );

    await page.reload();
    const baseline = page.getByRole('article', { name: /Original agreement/ });
    await expect(baseline.getByText('EUR 1,000.00')).toBeVisible();
    await expect(baseline.getByText('31 Dec 2026')).toBeVisible();
    await expect(baseline.getByText('D1 original')).toBeVisible();
    await expect(baseline.getByText('E1 original')).toBeVisible();
    await expect(baseline.getByText('Original summary')).toBeVisible();
    await expect(baseline.getByText('2 revisions included')).toBeVisible();
    await expect(
      baseline.getByText(/current price or deadline differs from the original agreement/),
    ).toBeVisible();
    const current = page.getByRole('article', { name: /Current scope/ });
    await expect(current.getByRole('heading', { name: 'Current scope (version 2)' })).toBeVisible();
    await expect(current.getByText('EUR 2,500.00')).toBeVisible();
    await expect(current.getByText('28 Feb 2027')).toBeVisible();
    await expect(current.getByText('D1 changed')).toBeVisible();
    await expect(current.getByText('No revisions included')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Draft changes (not confirmed)' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Overview' }).getByText('EUR 2,500.00'),
    ).toBeVisible();
    await shot(page, testInfo, 'T06-original-current-draft');
  });
});

test.describe('T-07 / T-08 API (AC-7, AC-8)', () => {
  test('owner cannot change confirmed versions/items; B and anon cannot touch A; archived draft locked', async ({
    page,
    browser,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is sufficient');
    const A = tokenOf(sessionA);
    const B = (await apiSession(browser, USER_B)).access_token as string;
    const log: string[] = [];
    const rec = (name: string, r: { status: number; body: unknown }) => {
      log.push(`${name}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
      return r;
    };
    const pid = await apiCreateProject(page, A, {
      title: uniq(testInfo, 'api'),
      client_name: 'C',
      currency: 'EUR',
      agreed_price: 10,
    });
    const v1 = await apiDraftId(page, A, pid);
    const item1 = await apiAddItem(page, A, v1, 'deliverable', 'Baseline item');
    expect(
      (await rest(page, A, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
    ).toBe(200);
    const v2 = await apiDraftId(page, A, pid);
    const before = await getVersions(page, A, pid);

    log.push('--- T-07 owner (A) against confirmed v1 ---');
    let r = rec(
      'PATCH v1 summary',
      await rest(page, A, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, { summary: 'x' }),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'PATCH v1 confirmed_at=null',
      await rest(page, A, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, { confirmed_at: null }),
    );
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec(
      'PATCH v1 is_original_baseline=false',
      await rest(page, A, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, {
        is_original_baseline: false,
      }),
    );
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec(
      'PATCH v2 confirmed_at=now (self-confirm)',
      await rest(page, A, 'PATCH', `/rest/v1/scope_versions?id=eq.${v2}`, {
        confirmed_at: new Date().toISOString(),
      }),
    );
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec('DELETE v1', await rest(page, A, 'DELETE', `/rest/v1/scope_versions?id=eq.${v1}`));
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec(
      'PATCH v1 item',
      await rest(page, A, 'PATCH', `/rest/v1/scope_items?id=eq.${item1}`, {
        description: 'changed',
      }),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'DELETE v1 items',
      await rest(page, A, 'DELETE', `/rest/v1/scope_items?scope_version_id=eq.${v1}`),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'POST item into v1',
      await rest(page, A, 'POST', '/rest/v1/scope_items', {
        scope_version_id: v1,
        kind: 'deliverable',
        description: 'sneak',
      }),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
    r = rec(
      'PATCH v2 item scope_version_id -> v1',
      await rest(page, A, 'PATCH', `/rest/v1/scope_items?scope_version_id=eq.${v2}`, {
        scope_version_id: v1,
      }),
    );
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec(
      'DELETE project (no hard delete, C-4)',
      await rest(page, A, 'DELETE', `/rest/v1/projects?id=eq.${pid}`),
    );
    expect((r.body as { code: string }).code).toBe('42501');

    log.push('--- T-08 user B against A ---');
    r = rec('B GET A project', await rest(page, B, 'GET', `/rest/v1/projects?id=eq.${pid}`));
    expect(r.body).toEqual([]);
    r = rec(
      'B GET A versions',
      await rest(page, B, 'GET', `/rest/v1/scope_versions?project_id=eq.${pid}`),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'B GET A items',
      await rest(page, B, 'GET', `/rest/v1/scope_items?scope_version_id=in.(${v1},${v2})`),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'B POST item into A draft',
      await rest(page, B, 'POST', '/rest/v1/scope_items', {
        scope_version_id: v2,
        kind: 'deliverable',
        description: 'B',
      }),
    );
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec(
      'B PATCH A project status',
      await rest(page, B, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, { status: 'archived' }),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'B PATCH A project title',
      await rest(page, B, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, { title: 'pwned' }),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'B PATCH A draft',
      await rest(page, B, 'PATCH', `/rest/v1/scope_versions?id=eq.${v2}`, { summary: 'B' }),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'B DELETE A draft items',
      await rest(page, B, 'DELETE', `/rest/v1/scope_items?scope_version_id=eq.${v2}`),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'B RPC confirm_scope(A draft)',
      await rest(page, B, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v2 }),
    );
    expect((r.body as { message: string }).message).toBe('not_found');
    r = rec(
      'B RPC confirm_scope(A confirmed v1)',
      await rest(page, B, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 }),
    );
    expect((r.body as { message: string }).message).toBe('not_found');

    log.push('--- anon (publishable key only) ---');
    for (const [m, p, body] of [
      ['GET', '/rest/v1/projects', undefined],
      ['GET', '/rest/v1/scope_versions', undefined],
      ['GET', '/rest/v1/scope_items', undefined],
      ['POST', '/rest/v1/projects', { title: 'anon', client_name: 'x', currency: 'EUR' }],
      ['POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v2 }],
      ['POST', '/rest/v1/rpc/delete_my_account', {}],
    ] as const) {
      r = rec(`anon ${m} ${p}`, await rest(page, null, m, p, body));
      expect(r.status, `${m} ${p}`).toBeGreaterThanOrEqual(401);
      expect(r.status, `${m} ${p}`).toBeLessThan(500);
    }
    log.push('--- bypass flag reachability via API ---');
    r = rec(
      'A RPC set_config (pg_catalog)',
      await rest(page, A, 'POST', '/rest/v1/rpc/set_config', {
        setting_name: 'guardscope.account_deletion',
        new_value: 'on',
        is_local: true,
      }),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);

    const after = await getVersions(page, A, pid);
    expect(after).toEqual(before);
    log.push('A data after all attempts: identical to before (deep-equal of versions + items)');

    log.push('--- archived project via API (owner) ---');
    expect(
      (await rest(page, A, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, { status: 'archived' }))
        .status,
    ).toBe(200);
    r = rec(
      'PATCH archived draft summary',
      await rest(page, A, 'PATCH', `/rest/v1/scope_versions?id=eq.${v2}`, {
        summary: 'while archived',
      }),
    );
    expect(r.body).toEqual([]);
    r = rec(
      'POST item to archived draft',
      await rest(page, A, 'POST', '/rest/v1/scope_items', {
        scope_version_id: v2,
        kind: 'deliverable',
        description: 'x',
      }),
    );
    expect((r.body as { code: string }).code).toBe('42501');
    r = rec(
      'RPC confirm archived draft',
      await rest(page, A, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v2 }),
    );
    expect((r.body as { message: string }).message).toBe('project_archived');
    r = rec(
      'PATCH archived project title (observation: allowed; BR-6 is UI-only)',
      await rest(page, A, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, {
        title: 'P2T edited while archived',
      }),
    );
    writeFileSync(`${P2_OUT}/api-T07-T08.log`, log.join('\n') + '\n');
  });
});
