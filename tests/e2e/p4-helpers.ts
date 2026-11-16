import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from './helpers';
import { apiCreateProject, rest } from './p2-helpers';
import { apiClassify, apiCreateRequest } from './p3-helpers';

/** Phase 4 Tester helpers. Evidence goes to docs/testing/phase4/. */
export const P4_OUT = 'docs/testing/phase4';

export function uniq4(testInfo: TestInfo, label: string) {
  return `P4T ${label} ${testInfo.project.name} ${Math.random().toString(36).slice(2, 8)}`;
}

export type Version = {
  id: string;
  change_order_id: string;
  version_no: number;
  title: string;
  description: string;
  price_impact: number | string;
  currency: string;
  time_impact_value: number | string | null;
  time_impact_unit: string | null;
  proposed_deadline: string | null;
  assumptions: string | null;
  exclusions: string | null;
  client_terms: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
};

/** Active project (no confirmed scope needed for requests) + an Additional request. */
export async function apiAdditionalRequest(
  page: Page,
  token: string,
  title: string,
  opts: { currency?: string; description?: string; notes?: string; agreed_price?: number } = {},
) {
  const projectId = await apiCreateProject(page, token, {
    title,
    client_name: 'P4 Client',
    currency: opts.currency ?? 'EUR',
    ...(opts.agreed_price !== undefined ? { agreed_price: opts.agreed_price } : {}),
  });
  const requestId = await apiCreateRequest(page, token, projectId, {
    title: `Req ${title}`.slice(0, 200),
    description: opts.description ?? 'Client asked for an extra pricing page',
    internal_notes: opts.notes ?? null,
  });
  const c = await apiClassify(page, token, requestId, 'additional');
  expect(c.status, JSON.stringify(c.body)).toBe(200);
  return { projectId, requestId };
}

export async function rpc(
  page: Page,
  token: string | null,
  fn: string,
  args: Record<string, unknown>,
) {
  return rest(page, token, 'POST', `/rest/v1/rpc/${fn}`, args);
}

export async function apiCreateCO(page: Page, token: string, requestId: string) {
  const r = await rpc(page, token, 'create_change_order', { p_request_id: requestId });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as string;
}

export async function apiVersions(page: Page, token: string, coId: string) {
  const r = await rest(
    page,
    token,
    'GET',
    `/rest/v1/change_order_versions?select=*&change_order_id=eq.${coId}&order=version_no`,
  );
  expect(r.status).toBe(200);
  return r.body as Version[];
}

export async function apiPatchVersion(
  page: Page,
  token: string,
  versionId: string,
  fields: Record<string, unknown>,
) {
  return rest(page, token, 'PATCH', `/rest/v1/change_order_versions?id=eq.${versionId}`, fields);
}

/** Creates a proposal and fills v1 so it is sendable. Returns ids. */
export async function apiSendableCO(
  page: Page,
  token: string,
  title: string,
  fields: Record<string, unknown> = {},
  opts: Parameters<typeof apiAdditionalRequest>[3] = {},
) {
  const { projectId, requestId } = await apiAdditionalRequest(page, token, title, opts);
  const coId = await apiCreateCO(page, token, requestId);
  const [v1] = await apiVersions(page, token, coId);
  const p = await apiPatchVersion(page, token, v1.id, {
    description: 'Build one extra pricing page',
    price_impact: 400,
    time_impact_value: 3,
    time_impact_unit: 'days',
    ...fields,
  });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  expect((p.body as unknown[]).length).toBe(1);
  return { projectId, requestId, coId, v1Id: v1.id };
}

export async function apiCoEvents(page: Page, token: string, coId: string) {
  const r = await rest(
    page,
    token,
    'GET',
    `/rest/v1/activity_events?select=seq,event_type,entity_version,summary,created_at&entity_id=eq.${coId}&order=seq`,
  );
  expect(r.status).toBe(200);
  return r.body as {
    seq: number;
    event_type: string;
    entity_version: number;
    summary: string;
    created_at: string;
  }[];
}

/** P0001 message of a failed RPC call (PostgREST puts the raised message in `message`). */
export const errMsg = (body: unknown) => (body as { message?: string })?.message;

export function logEvidence4(file: string, testInfo: TestInfo, label: string, data: unknown) {
  mkdirSync(P4_OUT, { recursive: true });
  appendFileSync(
    `${P4_OUT}/${file}`,
    `${JSON.stringify({ project: testInfo.project.name, label, data })}\n`,
  );
}

export async function shot4(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${P4_OUT}/screenshots`, { recursive: true });
  const path = `${P4_OUT}/screenshots/${testInfo.project.name}-${name}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
  } catch {
    await page.screenshot({ path });
  }
}

export async function axeScan4(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${P4_OUT}/axe`, { recursive: true });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }));
  writeFileSync(
    `${P4_OUT}/axe/${testInfo.project.name}-${name}.json`,
    JSON.stringify(
      { url: page.url(), violations: summary, passes: results.passes.length },
      null,
      2,
    ),
  );
  return summary;
}

export async function openProposal(page: Page, projectId: string, coId: string) {
  await page.goto(`/projects/${projectId}/changes/${coId}`);
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
}

/** Visible text of <main>, for wording checks (AC-10). */
export async function mainText(page: Page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ');
}

/** AC-10: no paid / collected / earned wording anywhere on the page. */
export async function expectNoMoneyClaims(page: Page) {
  const t = await mainText(page);
  expect(t, 'paid/collected/earned wording on page').not.toMatch(
    /\b(paid|collected|earned|revenue|invoice[d]?)\b/i,
  );
}

/** AC-10: every amount on the page carries an ISO currency code. */
export async function expectAmountsHaveCurrency(page: Page) {
  const t = await mainText(page);
  const bare =
    t.match(/(?<![A-Z]{3} )(?<![A-Z]{3}\u00a0)(?<![\d,.])\d{1,3}(?:,\d{3})*\.\d{2}\b/g) ?? [];
  expect(bare, `amounts without currency: ${bare.join(' | ')}`).toEqual([]);
}
