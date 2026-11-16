import { test, expect } from './helpers';
import {
  apiCreateProject,
  rest,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import { tokenOf } from './p3-helpers';
import {
  apiAdditionalRequest,
  apiCreateCO,
  apiPatchVersion,
  apiVersions,
  logEvidence4,
  openProposal,
  uniq4,
} from './p4-helpers';

/**
 * ISS-017 independent verification. PostgREST returns numeric columns as JSON numbers; the forms must
 * accept them after a reload: (a) the Phase 4 proposal editor, (b) the Phase 2 project edit form.
 */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      /trim is not a function|TypeError/.test(m.text()) &&
      pageErrors.push(m.text()),
  );
});
test.afterEach(async ({ page }) => {
  expect(pageErrors, 'uncaught errors (ISS-017 symptom: n.trim is not a function)').toEqual([]);
  await archiveTracked(page, tracked);
});

for (const [label, price, time] of [
  ['integer', 400, 2],
  ['decimal', 99.99, 1.5],
] as const) {
  test(`ISS-017 (a) proposal editor: save and send after reload with existing ${label} price and time`, async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const { projectId, requestId } = await apiAdditionalRequest(
      page,
      token,
      uniq4(testInfo, `iss017-${label}`),
    );
    const coId = await apiCreateCO(page, token, requestId);
    const [v1] = await apiVersions(page, token, coId);
    await apiPatchVersion(page, token, v1.id, {
      description: 'Existing work',
      price_impact: price,
      time_impact_value: time,
      time_impact_unit: 'days',
    });
    const raw = await rest(
      page,
      token,
      'GET',
      `/rest/v1/change_order_versions?select=price_impact,time_impact_value&id=eq.${v1.id}`,
    );
    logEvidence4('e2e-ISS017.jsonl', testInfo, `(a) ${label} REST JSON`, raw.body);
    expect(
      typeof (raw.body as { price_impact: unknown }[])[0].price_impact,
      'precondition: JSON number',
    ).toBe('number');

    await openProposal(page, projectId, coId); // fresh load from the API
    const d = page.getByRole('region', { name: 'Draft version 1 (not sent)' });
    await expect(d.getByLabel('Price impact')).toHaveValue(String(price));
    await expect(d.getByLabel('Time impact')).toHaveValue(String(time));
    await d.getByLabel('Title', { exact: true }).fill(`Only the title changed ${label}`);
    await d.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();

    await page.reload();
    const d2 = page.getByRole('region', { name: 'Draft version 1 (not sent)' });
    await expect(d2.getByLabel('Price impact')).toHaveValue(String(price));
    await d2.getByLabel('Assumptions').fill('touch another field, leave numbers untouched');
    await d2.getByRole('button', { name: 'Send version 1…' }).click();
    await page.getByRole('button', { name: 'Yes, send version 1' }).click();
    await expect(page.getByText('Version 1 sent. Its content is now fixed.')).toBeVisible();
    const [sent] = await apiVersions(page, token, coId);
    logEvidence4('e2e-ISS017.jsonl', testInfo, `(a) ${label} after send`, sent);
    expect(sent).toMatchObject({
      status: 'pending',
      price_impact: price,
      time_impact_value: time,
      title: `Only the title changed ${label}`,
    });
  });
}

for (const [label, price] of [
  ['integer', 400],
  ['decimal', 1500.5],
] as const) {
  test(`ISS-017 (b) Phase 2 project edit form saves with an untouched ${label} agreed price`, async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const id = await apiCreateProject(page, token, {
      title: uniq4(testInfo, `iss017-proj-${label}`),
      client_name: 'Before',
      currency: 'EUR',
      agreed_price: price,
    });
    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByLabel('Agreed price')).toHaveValue(String(price));
    await page.getByLabel('Client name').fill('After');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Project updated.')).toBeVisible();
    const r = await rest(
      page,
      token,
      'GET',
      `/rest/v1/projects?select=client_name,agreed_price,currency&id=eq.${id}`,
    );
    logEvidence4('e2e-ISS017.jsonl', testInfo, `(b) ${label}`, r.body);
    expect(r.body).toEqual([{ client_name: 'After', agreed_price: price, currency: 'EUR' }]);
  });
}
