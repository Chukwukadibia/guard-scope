import { test, expect } from './helpers';
import {
  apiAddItem,
  apiCreateProject,
  apiDraftId,
  noOverflow,
  openProject,
  rest,
  uniq,
} from './p2-helpers';

/**
 * Debug Specialist regression checks for Phase 2 D-1..D-4 (ISS-009..012).
 * Runs at 1280 px (desktop) and 375 px (mobile).
 */
test.use({ signedInAs: 'A' });

const tokenOf = (s: Record<string, unknown>) => s.access_token as string;

test('D-2: long unbroken text wraps on list, detail (draft + confirmed) and dashboard', async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(90_000);
  const token = tokenOf(sessionA);
  const tag = uniq(testInfo, 'D2').replace(/ /g, '_');
  // 200 is the title/client maximum; description, contact and items use 300+ characters.
  const long = (c: string, n: number) => `${tag}${c.repeat(n - tag.length)}`;
  const base = {
    title: long('T', 200),
    client_name: long('C', 200),
    client_contact: long('x', 320),
    description: long('W', 300),
    currency: 'EUR',
  };
  const draftId = await apiCreateProject(page, token, base);
  const v = await apiDraftId(page, token, draftId);
  await apiAddItem(page, token, v, 'deliverable', long('D', 300));

  const confirmedId = await apiCreateProject(page, token, base);
  const v1 = await apiDraftId(page, token, confirmedId);
  await apiAddItem(page, token, v1, 'deliverable', long('D', 300));
  await apiAddItem(page, token, v1, 'exclusion', long('E', 300));
  expect(
    (
      await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, {
        summary: long('S', 300),
        notes: long('N', 300),
      })
    ).status,
  ).toBe(200);
  expect(
    (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
  ).toBe(200);

  await page.goto('/projects');
  await expect(page.getByRole('heading', { level: 2, name: base.title }).first()).toBeVisible();
  await noOverflow(page);

  await openProject(page, draftId);
  await expect(page.getByText(long('D', 300))).toBeVisible(); // ScopeItemsEditor
  await noOverflow(page);

  await openProject(page, confirmedId);
  await expect(page.getByRole('heading', { name: /Original agreement/ })).toBeVisible();
  await noOverflow(page);

  await page.goto('/');
  await expect(page.getByText(base.title).first()).toBeVisible();
  await noOverflow(page);

  // archive both so they leave the active list/dashboard for other specs
  for (const id of [draftId, confirmedId])
    expect(
      (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${id}`, { status: 'archived' }))
        .status,
    ).toBe(200);
});

test('D-3: overview shows the original scope revision allowance', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const id = await apiCreateProject(page, token, {
    title: uniq(testInfo, 'D3'),
    client_name: 'D3 client',
    currency: 'EUR',
  });
  const v1 = await apiDraftId(page, token, id);
  await apiAddItem(page, token, v1, 'deliverable', 'Logo');
  expect(
    (
      await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, {
        revision_allowance_type: 'number',
        revision_allowance_count: 3,
      })
    ).status,
  ).toBe(200);
  expect(
    (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
  ).toBe(200);
  await openProject(page, id);
  await expect(
    page
      .getByRole('region', { name: 'Overview' })
      .getByText(/1 deliverable, 0 exclusions · Revisions: 3 revisions included$/),
  ).toBeVisible();
  await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${id}`, { status: 'archived' });
});

test('D-1: "Project not found" for a random id and a malformed id', async ({ page }) => {
  for (const id of ['3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab', 'not-a-uuid']) {
    await page.goto(`/projects/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Project not found');
  }
});

test('D-4: "Project created." shows once, not after reload; back still works', async ({
  page,
  sessionA,
}, testInfo) => {
  const title = uniq(testInfo, 'D4');
  await page.goto('/projects');
  await page.goto('/projects/new');
  await page.getByLabel('Project title').fill(title);
  await page.getByLabel('Client name').fill('D4 client');
  await page.getByLabel('Currency').selectOption('EUR');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const url = page.url();
  await expect(page.getByText('Project created.')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (history.state as { usr?: unknown } | null)?.usr ?? null))
    .toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('Project created.')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.goForward();
  await expect(page).toHaveURL(url);
  await expect(page.getByText('Project created.')).toHaveCount(0);
  const id = url.split('/').pop() as string;
  await rest(page, tokenOf(sessionA), 'PATCH', `/rest/v1/projects?id=eq.${id}`, {
    status: 'archived',
  });
});

test('D-1: empty-scope, stale confirm and archived edit show their specific messages', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const confirm = async (p: typeof page) => {
    await p.getByRole('button', { name: 'Confirm original scope' }).click();
    const dlg = p.getByRole('group', { name: 'Confirm original scope?' });
    await dlg.getByRole('button', { name: 'Yes, confirm' }).click();
    return dlg.getByRole('alert');
  };
  // (a) empty scope; the alert keeps its screen-reader "Error:" prefix (Alert.tsx)
  const emptyId = await apiCreateProject(page, token, {
    title: uniq(testInfo, 'D1-empty'),
    client_name: 'C',
    currency: 'EUR',
  });
  await openProject(page, emptyId);
  await expect(await confirm(page)).toHaveText(
    'Error: Add at least one deliverable before confirming the scope.',
  );

  // (b) stale tab: confirmed via API after the page loaded
  const staleId = await apiCreateProject(page, token, {
    title: uniq(testInfo, 'D1-stale'),
    client_name: 'C',
    currency: 'EUR',
  });
  const v1 = await apiDraftId(page, token, staleId);
  await apiAddItem(page, token, v1, 'deliverable', 'Logo');
  await openProject(page, staleId);
  expect(
    (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
  ).toBe(200);
  await expect(await confirm(page)).toHaveText(
    'Error: This scope was already confirmed. Refresh the page to see the latest version.',
  );

  // (c) archived project's edit URL
  for (const id of [emptyId, staleId])
    await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${id}`, { status: 'archived' });
  await page.goto(`/projects/${emptyId}/edit`);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'This project is archived. Reopen it to make changes.',
  );
});
