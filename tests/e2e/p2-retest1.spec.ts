import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, SUPABASE_URL } from './helpers';
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

/**
 * Phase 2 Tester — retest 1 (commit c380e81). Independent checks of the D-1..D-4 fixes that the
 * original T-specs do not reach: stale-tab writes after confirm / archive in another tab (incl. the
 * 42501 -> not_found mapping the developer flagged), no request for a malformed id, the revision
 * allowance in the Overview (D-3) and one-shot notices after an edit (D-4).
 */
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
const SCOPE_LOCKED = 'Confirmed scope cannot be changed. Edit the draft instead.';
const NOT_FOUND = "We couldn't find that. It may have been removed, or you may not have access.";

async function addItemExpectError(page: Page, region: string, label: string, text: string) {
  const sec = page.getByRole('region', { name: region });
  await sec.getByLabel(label).fill(text);
  await sec.getByRole('button', { name: 'Add' }).click();
  const alert = sec.getByRole('alert');
  await expect(alert).toBeVisible();
  return alert;
}

async function itemCount(page: Page, token: string, versionId: string) {
  const r = await rest(
    page,
    token,
    'GET',
    `/rest/v1/scope_items?select=id&scope_version_id=eq.${versionId}`,
  );
  expect(r.status).toBe(200);
  return (r.body as unknown[]).length;
}

test.describe('Retest 1 / D-1 stale-tab writes', () => {
  test('after the draft was confirmed elsewhere: add item and save draft show "scope locked"; nothing written', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const id = await apiCreateProject(page, token, {
      title: uniq(testInfo, 'R1-stale-confirm'),
      client_name: 'C',
      currency: 'EUR',
    });
    const v1 = await apiDraftId(page, token, id);
    await apiAddItem(page, token, v1, 'deliverable', 'Logo');
    await openProject(page, id);
    expect(
      (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
    ).toBe(200);

    const alert = await addItemExpectError(page, 'Deliverables', 'Add a deliverable', 'Sneaky');
    await expect(alert).toHaveText(`Error: ${SCOPE_LOCKED}`);
    expect(await itemCount(page, token, v1)).toBe(1);

    await page.getByLabel('Scope summary').fill('stale summary');
    await page.getByRole('button', { name: 'Save draft' }).click();
    const form = page.getByRole('button', { name: 'Save draft' }).locator('xpath=ancestor::form');
    await expect(form.getByRole('alert')).toHaveText(`Error: ${SCOPE_LOCKED}`);
    await shot(page, testInfo, 'R1-stale-after-confirm');
    const v = await rest(page, token, 'GET', `/rest/v1/scope_versions?select=summary&id=eq.${v1}`);
    expect((v.body as { summary: string | null }[])[0].summary).toBeNull();
  });

  test('after the project was archived elsewhere: add item is refused (42501) and shows the safe not-found text', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const id = await apiCreateProject(page, token, {
      title: uniq(testInfo, 'R1-stale-archive'),
      client_name: 'C',
      currency: 'EUR',
    });
    const v1 = await apiDraftId(page, token, id);
    await openProject(page, id);
    const codes: string[] = [];
    page.on('response', async (res) => {
      if (
        res.url().startsWith(`${SUPABASE_URL}/rest/v1/scope_items`) &&
        res.request().method() === 'POST'
      )
        codes.push(`${res.status()} ${JSON.stringify(await res.json().catch(() => null))}`);
    });
    expect(
      (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${id}`, { status: 'archived' }))
        .status,
    ).toBe(200);
    const alert = await addItemExpectError(
      page,
      'Deliverables',
      'Add a deliverable',
      'After archive',
    );
    await expect(alert).toHaveText(`Error: ${NOT_FOUND}`);
    await shot(page, testInfo, 'R1-stale-after-archive');
    expect(await itemCount(page, token, v1)).toBe(0);
    await expect.poll(() => codes.length).toBe(1);
    expect(codes[0]).toMatch(/^403 .*"code":"42501"/);
    // the error text names nothing about the project (no title, id or state)
    const text = (await alert.innerText()).toLowerCase();
    expect(text).not.toContain('archived');
    expect(text).not.toContain(id);
    writeFileSync(
      `${P2_OUT}/retest1-42501-${testInfo.project.name}.log`,
      `stale tab add item after archive -> ${codes[0]}\nUI: ${await alert.innerText()}\n`,
    );
  });
});

test.describe('Retest 1 / D-1 §6 ids', () => {
  test('malformed id: "Project not found" and no Supabase request for that id', async ({
    page,
  }) => {
    const hits: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('not-a-uuid')) hits.push(r.url());
    });
    await page.goto('/projects/not-a-uuid');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Project not found');
    await page.goto('/projects/not-a-uuid/edit');
    await expect(page.getByRole('main').getByRole('alert').first()).toBeVisible();
    await expect(page.getByLabel('Project title')).toHaveCount(0);
    expect(hits.filter((u) => u.startsWith(SUPABASE_URL))).toEqual([]);
  });
});

test.describe('Retest 1 / D-3 overview allowance', () => {
  for (const [type, count, label] of [
    ['number', 2, '2 revisions included'],
    ['number', 1, '1 revision included'],
    ['none', null, 'No revisions included'],
    ['not_specified', null, 'Not specified'],
  ] as const) {
    test(`overview shows the baseline allowance: ${label}`, async ({
      page,
      sessionA,
    }, testInfo) => {
      const token = tokenOf(sessionA);
      const id = await apiCreateProject(page, token, {
        title: uniq(testInfo, `R1-D3-${type}`),
        client_name: 'C',
        currency: 'EUR',
      });
      const v1 = await apiDraftId(page, token, id);
      await apiAddItem(page, token, v1, 'deliverable', 'One');
      await apiAddItem(page, token, v1, 'exclusion', 'Ex');
      expect(
        (
          await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, {
            revision_allowance_type: type,
            revision_allowance_count: count,
          })
        ).status,
      ).toBe(200);
      await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 });
      // change the draft's allowance afterwards: the overview must keep the baseline value
      const v2 = await apiDraftId(page, token, id);
      await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${v2}`, {
        revision_allowance_type: 'number',
        revision_allowance_count: 7,
      });
      await openProject(page, id);
      const dd = page
        .getByRole('region', { name: 'Overview' })
        .getByText(/^Confirmed .* · 1 deliverable, 1 exclusion · Revisions: /);
      await expect(dd).toHaveText(new RegExp(` · Revisions: ${label}$`));
      if (type === 'number' && count === 2) await shot(page, testInfo, 'R1-D3-overview');
    });
  }
});

test.describe('Retest 1 / D-4 one-shot notices', () => {
  test('"Project updated." shows once; not after reload, confirm + reload, or back/forward', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const title = uniq(testInfo, 'R1-D4');
    const id = await apiCreateProject(page, token, { title, client_name: 'C', currency: 'EUR' });
    await apiAddItem(page, token, await apiDraftId(page, token, id), 'deliverable', 'Thing');
    await openProject(page, id);
    await page.getByRole('link', { name: 'Edit project' }).click();
    await page.getByLabel('Project title').fill(`${title} edited`);
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
    await expect(page.getByText('Project updated.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: `${title} edited` })).toBeVisible();
    await expect(page.getByText('Project updated.')).toHaveCount(0);
    // the original D-4 path: edit, then confirm, then reload
    await page.getByRole('button', { name: 'Confirm original scope' }).click();
    await page
      .getByRole('group', { name: 'Confirm original scope?' })
      .getByRole('button', { name: 'Yes, confirm' })
      .click();
    await expect(
      page.getByText('Original scope confirmed and saved as the baseline.'),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Draft changes (not confirmed)' }),
    ).toBeVisible();
    await expect(page.getByText('Project updated.')).toHaveCount(0);
    // Saving an edit navigates with replace (unchanged since 3a7c1eb), so Back goes to the detail
    // entry before "Edit project"; that entry must not carry the notice either.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Project updated.')).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name: `${title} edited` })).toBeVisible();
    await expect(page.getByText('Project updated.')).toHaveCount(0);
    await shot(page, testInfo, 'R1-D4-after-reload');
  });
});
