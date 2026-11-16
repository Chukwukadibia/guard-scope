import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { APP_ORIGIN, SUPABASE_KEY, SUPABASE_URL, expect } from './helpers';

/** Phase 2 Tester helpers. Evidence goes to docs/testing/phase2/. */
export const P2_OUT = 'docs/testing/phase2';

export type RestResult = { status: number; body: unknown };

/** Unique, recognisable title so parallel desktop/mobile runs never collide. */
export function uniq(testInfo: TestInfo, label: string) {
  return `P2T ${label} ${testInfo.project.name} ${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Calls Supabase REST/RPC from inside the browser (Node fetch bypasses the sandbox proxy).
 * `token` null = anon (publishable key only).
 */
export async function rest(
  page: Page,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<RestResult> {
  if (!page.url().startsWith(APP_ORIGIN)) await page.goto(`${APP_ORIGIN}/p`);
  return page.evaluate(
    async ({ url, key, token, method, path, body, extraHeaders }) => {
      const headers: Record<string, string> = {
        apikey: key,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...extraHeaders,
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep text */
      }
      return { status: res.status, body: parsed };
    },
    { url: SUPABASE_URL, key: SUPABASE_KEY, token, method, path, body, extraHeaders },
  );
}

export async function apiCreateProject(page: Page, token: string, input: Record<string, unknown>) {
  const r = await rest(page, token, 'POST', '/rest/v1/projects?select=id', input);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return (r.body as { id: string }[])[0].id;
}

export async function apiDraftId(page: Page, token: string, projectId: string) {
  const r = await rest(
    page,
    token,
    'GET',
    `/rest/v1/scope_versions?select=id&project_id=eq.${projectId}&confirmed_at=is.null`,
  );
  expect(r.status).toBe(200);
  return (r.body as { id: string }[])[0].id;
}

export async function apiAddItem(
  page: Page,
  token: string,
  versionId: string,
  kind: string,
  description: string,
  sort_order = 1,
) {
  const r = await rest(page, token, 'POST', '/rest/v1/scope_items?select=id', {
    scope_version_id: versionId,
    kind,
    description,
    sort_order,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return (r.body as { id: string }[])[0].id;
}

export async function axeScan(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${P2_OUT}/axe`, { recursive: true });
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
    `${P2_OUT}/axe/${testInfo.project.name}-${name}.json`,
    JSON.stringify(
      { url: page.url(), violations: summary, passes: results.passes.length },
      null,
      2,
    ),
  );
  return summary;
}

export async function shot(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${P2_OUT}/screenshots`, { recursive: true });
  const path = `${P2_OUT}/screenshots/${testInfo.project.name}-${name}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
  } catch {
    await page.screenshot({ path }); // page too wide for a full-page capture (overflow defect)
  }
}

export async function noOverflow(page: Page, soft = false) {
  const o = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // innermost elements whose right edge passes the viewport (diagnostics for the report)
    const offenders = Array.from(document.querySelectorAll('main *'))
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .filter(
        (el) => !Array.from(el.children).some((c) => c.getBoundingClientRect().right > vw + 1),
      )
      .slice(0, 8)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const path: string[] = [];
        for (let e: Element | null = el; e && e.tagName !== 'MAIN'; e = e.parentElement)
          path.unshift(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`);
        return `${path.join('>')} width=${Math.round(r.width)} text="${(el.textContent ?? '').slice(0, 12)}…"`;
      });
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, offenders };
  });
  const e = soft ? expect.soft : expect;
  e(o.scrollWidth, `horizontal overflow ${JSON.stringify(o)}`).toBeLessThanOrEqual(o.clientWidth);
  return o;
}

/** Opens a project's detail page and waits for it to load. */
export async function openProject(page: Page, id: string) {
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

/**
 * Test hygiene (retest 1): records every project created through `page` (UI or REST, any user)
 * so the spec can archive them after the test. Without this, Phase 2 specs left user A with
 * active projects and broke Phase 1's T-16 empty-state precondition in a full-suite run.
 */
export type TrackedProjects = { id: string; token: string }[] & { pending?: Promise<void>[] };

export function trackCreatedProjects(page: Page): TrackedProjects {
  const created: TrackedProjects = [];
  created.pending = [];
  page.on('response', (res) => {
    const req = res.request();
    if (req.method() !== 'POST' || res.status() !== 201) return;
    if (!/\/rest\/v1\/projects(\?|$)/.test(res.url())) return;
    const token = (req.headers()['authorization'] ?? '').replace(/^Bearer /, '');
    created.pending?.push(
      res
        .json()
        .then((body: { id?: string }[] | { id?: string }) => {
          for (const row of Array.isArray(body) ? body : [body])
            if (row.id && token) created.push({ id: row.id, token });
        })
        .catch(() => undefined),
    );
  });
  return created;
}

/** Archives the tracked projects that are not archived yet (archive is the only removal, C-4). */
export async function archiveTracked(page: Page, created: TrackedProjects) {
  await Promise.all(created.pending ?? []);
  for (const { id, token } of created.splice(0)) {
    await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${id}&status=neq.archived`, {
      status: 'archived',
    }).catch(() => undefined);
  }
}
