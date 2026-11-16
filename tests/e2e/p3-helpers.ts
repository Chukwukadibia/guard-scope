import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from './helpers';
import { apiAddItem, apiCreateProject, apiDraftId, rest } from './p2-helpers';

/** Phase 3 Tester helpers. Evidence goes to docs/testing/phase3/. */
export const P3_OUT = 'docs/testing/phase3';

export const tokenOf = (s: Record<string, unknown>) => s.access_token as string;

export function uniq3(testInfo: TestInfo, label: string) {
  return `P3T ${label} ${testInfo.project.name} ${Math.random().toString(36).slice(2, 8)}`;
}

/** Browser-local calendar date (the app's "today"), offset by `days`. */
export async function localDate(page: Page, days = 0) {
  return page.evaluate((days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);
}

type Allowance = { type: 'none' | 'number' | 'not_specified'; count?: number };

/** Project with a confirmed v1 scope (one deliverable, one exclusion) and the given allowance. */
export async function apiConfirmedProject(
  page: Page,
  token: string,
  title: string,
  allowance: Allowance = { type: 'number', count: 2 },
) {
  const id = await apiCreateProject(page, token, {
    title,
    client_name: 'P3 Client',
    currency: 'EUR',
    agreed_price: 1234.5,
  });
  const draft = await apiDraftId(page, token, id);
  await apiAddItem(page, token, draft, 'deliverable', 'Five-page website');
  await apiAddItem(page, token, draft, 'exclusion', 'Copywriting');
  await apiSetAllowance(page, token, draft, allowance);
  const c = await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: draft });
  expect(c.status, JSON.stringify(c.body)).toBe(200);
  return id;
}

export async function apiSetAllowance(page: Page, token: string, versionId: string, a: Allowance) {
  const r = await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${versionId}`, {
    revision_allowance_type: a.type,
    revision_allowance_count: a.type === 'number' ? (a.count ?? 0) : null,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

export async function apiCreateRequest(
  page: Page,
  token: string,
  projectId: string,
  fields: Record<string, unknown>,
) {
  const r = await rest(page, token, 'POST', '/rest/v1/requests?select=id', {
    project_id: projectId,
    ...fields,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return (r.body as { id: string }[])[0].id;
}

export async function apiClassify(page: Page, token: string, requestId: string, value: string) {
  return rest(page, token, 'POST', '/rest/v1/rpc/classify_request', {
    p_request_id: requestId,
    p_classification: value,
  });
}

export async function apiEvents(page: Page, token: string, entityId: string) {
  const r = await rest(
    page,
    token,
    'GET',
    `/rest/v1/activity_events?select=*&entity_id=eq.${entityId}&order=seq`,
  );
  expect(r.status).toBe(200);
  return r.body as {
    id: string;
    seq: number;
    event_type: string;
    summary: string;
    metadata: Record<string, unknown>;
    created_at: string;
    actor_type: string;
  }[];
}

/** Appends one JSON line to an evidence log in docs/testing/phase3/. */
export function logEvidence(file: string, testInfo: TestInfo, label: string, data: unknown) {
  mkdirSync(P3_OUT, { recursive: true });
  appendFileSync(
    `${P3_OUT}/${file}`,
    `${JSON.stringify({ project: testInfo.project.name, label, data })}\n`,
  );
}

export async function shot3(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${P3_OUT}/screenshots`, { recursive: true });
  const path = `${P3_OUT}/screenshots/${testInfo.project.name}-${name}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
  } catch {
    await page.screenshot({ path });
  }
}

export async function axeScan3(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${P3_OUT}/axe`, { recursive: true });
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
    `${P3_OUT}/axe/${testInfo.project.name}-${name}.json`,
    JSON.stringify(
      { url: page.url(), violations: summary, passes: results.passes.length },
      null,
      2,
    ),
  );
  return summary;
}

export async function openRequest(page: Page, projectId: string, requestId: string) {
  await page.goto(`/projects/${projectId}/requests/${requestId}`);
  await expect(page.getByRole('heading', { name: 'Your decision' })).toBeVisible();
}

export const requestsRegion = (page: Page) => page.getByRole('region', { name: 'Client requests' });
export const historyRegion = (page: Page) => page.getByRole('region', { name: 'History' });
