import type { Page } from '@playwright/test';
import { test, expect, SUPABASE_KEY, SUPABASE_URL, APP_ORIGIN, isMobile } from './helpers';
import {
  apiCreateProject,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import { apiClassify, apiCreateRequest, tokenOf } from './p3-helpers';
import { apiCoEvents, apiPatchVersion, apiVersions, logEvidence4, uniq4 } from './p4-helpers';

/**
 * Phase 4 Tester — concurrency with real JWTs (TEST_PLAN T-05: draft/pending uniqueness under concurrent calls).
 * Each race fires all requests inside one page.evaluate with Promise.all, so they are in flight together.
 */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'API-only race, run on the desktop project');
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

type Call = { fn: string; args: Record<string, unknown> };

async function race(page: Page, token: string, calls: Call[]) {
  if (!page.url().startsWith(APP_ORIGIN)) await page.goto(`${APP_ORIGIN}/p`);
  return page.evaluate(
    async ({ url, key, token, calls }) =>
      Promise.all(
        calls.map(async (c) => {
          const res = await fetch(`${url}/rest/v1/rpc/${c.fn}`, {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(c.args),
          });
          const body = await res.json().catch(() => null);
          return {
            fn: c.fn,
            status: res.status,
            msg: res.status === 200 ? 'ok' : (body?.message ?? String(res.status)),
            body,
          };
        }),
      ),
    { url: SUPABASE_URL, key: SUPABASE_KEY, token, calls },
  );
}

const tally = (r: { msg: string }[]) =>
  r.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.msg]: (acc[x.msg] ?? 0) + 1 }), {});

/** Replays the history by seq and checks it against the stored versions (BR-1, BR-3, BR-5). */
function replay(events: { event_type: string; entity_version: number }[]) {
  const st = new Map<number, string>();
  const problems: string[] = [];
  for (const e of events) {
    const t = e.event_type.replace('change_order.', '');
    const v = e.entity_version;
    const cur = st.get(v);
    const need = (from: string | undefined, to: string) => {
      if (cur !== from) problems.push(`${t}:${v} from ${cur} (expected ${from})`);
      st.set(v, to);
    };
    if (t === 'created' || t === 'version_created') need(undefined, 'draft');
    else if (t === 'sent') need('draft', 'pending');
    else if (t === 'superseded') need('pending', 'superseded');
    else if (t === 'cancelled') need('pending', 'cancelled');
    else if (t === 'draft_discarded') {
      if (cur !== 'draft') problems.push(`discard ${v} from ${cur}`);
      st.delete(v);
    } else problems.push(`unknown ${t}`);
    const counts = [...st.values()].reduce<Record<string, number>>(
      (a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }),
      {},
    );
    if ((counts.draft ?? 0) > 1 || (counts.pending ?? 0) > 1)
      problems.push(`after ${t}:${v} ${JSON.stringify(counts)}`);
  }
  return { st, problems };
}

const ITERATIONS = Number(process.env.P4_RACE_ITERATIONS ?? 12);
const PARALLEL = 6;

test(`T-05 concurrency: create/send/new-version/send-vs-cancel races x${ITERATIONS}`, async ({
  page,
  sessionA,
}, testInfo) => {
  test.setTimeout(20 * 60_000);
  const token = tokenOf(sessionA);
  const projectId = await apiCreateProject(page, token, {
    title: uniq4(testInfo, 'race'),
    client_name: 'Race',
    currency: 'EUR',
  });
  const summary = {
    create: {} as Record<string, number>,
    send_same_draft: {} as Record<string, number>,
    new_version: {} as Record<string, number>,
    send_v2_vs_cancel_v1: {} as Record<string, number>,
    final_states: {} as Record<string, number>,
    max_draft_per_co: 0,
    max_pending_per_co: 0,
    history_problems: 0,
  };
  const add = (into: Record<string, number>, from: Record<string, number>) => {
    for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
  };
  for (let i = 0; i < ITERATIONS; i++) {
    const requestId = await apiCreateRequest(page, token, projectId, { title: `race ${i}` });
    expect((await apiClassify(page, token, requestId, 'additional')).status).toBe(200);

    // 1. simultaneous create_change_order on one request
    const r1 = await race(
      page,
      token,
      Array.from({ length: PARALLEL }, () => ({
        fn: 'create_change_order',
        args: { p_request_id: requestId },
      })),
    );
    const t1 = tally(r1);
    add(summary.create, t1);
    expect(t1, `iteration ${i} create`).toEqual({ ok: 1, change_order_exists: PARALLEL - 1 });
    const coId = r1.find((x) => x.status === 200)!.body as string;

    // 2. simultaneous send of the same draft
    const [v1] = await apiVersions(page, token, coId);
    expect(
      (await apiPatchVersion(page, token, v1.id, { description: 'race', price_impact: 100 }))
        .status,
    ).toBe(200);
    const r2 = await race(
      page,
      token,
      Array.from({ length: PARALLEL }, () => ({
        fn: 'send_change_order_version',
        args: { p_version_id: v1.id },
      })),
    );
    const t2 = tally(r2);
    add(summary.send_same_draft, t2);
    expect(t2, `iteration ${i} send`).toEqual({ ok: 1, not_draft: PARALLEL - 1 });

    // 3. simultaneous new_change_order_version
    const r3 = await race(
      page,
      token,
      Array.from({ length: PARALLEL }, () => ({
        fn: 'new_change_order_version',
        args: { p_change_order_id: coId },
      })),
    );
    const t3 = tally(r3);
    add(summary.new_version, t3);
    expect(t3, `iteration ${i} new version`).toEqual({ ok: 1, draft_exists: PARALLEL - 1 });
    const v2 = r3.find((x) => x.status === 200)!.body as string;

    // 4. send v2 while cancelling v1 (either order is valid; the result must be consistent)
    await apiPatchVersion(page, token, v2, { price_impact: 150 });
    const r4 = await race(page, token, [
      { fn: 'send_change_order_version', args: { p_version_id: v2 } },
      { fn: 'cancel_change_order_version', args: { p_version_id: v1.id } },
    ]);
    const outcome = `send=${r4[0].msg},cancel=${r4[1].msg}`;
    add(summary.send_v2_vs_cancel_v1, { [outcome]: 1 });
    expect(r4[0].msg, `iteration ${i} send v2 must succeed`).toBe('ok');
    expect(['ok', 'not_pending']).toContain(r4[1].msg);

    // DB state + history replay
    const versions = await apiVersions(page, token, coId);
    const states = versions.map((v) => `${v.version_no}:${v.status}`).join(',');
    add(summary.final_states, { [states]: 1 });
    const drafts = versions.filter((v) => v.status === 'draft').length;
    const pendings = versions.filter((v) => v.status === 'pending').length;
    summary.max_draft_per_co = Math.max(summary.max_draft_per_co, drafts);
    summary.max_pending_per_co = Math.max(summary.max_pending_per_co, pendings);
    const events = await apiCoEvents(page, token, coId);
    const { st, problems } = replay(events);
    for (const v of versions)
      if (st.get(v.version_no) !== v.status)
        problems.push(`v${v.version_no} replay=${st.get(v.version_no)} stored=${v.status}`);
    if (r4[1].msg === 'ok') expect(states).toBe('1:cancelled,2:pending');
    else expect(states).toBe('1:superseded,2:pending');
    summary.history_problems += problems.length;
    logEvidence4('api-T05-concurrency.jsonl', testInfo, `iteration ${i}`, {
      coId,
      create: t1,
      send: t2,
      newVersion: t3,
      sendVsCancel: outcome,
      states,
      history: events.map(
        (e) => `${e.seq}:${e.event_type.replace('change_order.', '')}:${e.entity_version}`,
      ),
      problems,
    });
    expect(problems, `iteration ${i} history`).toEqual([]);
    expect(drafts).toBeLessThanOrEqual(1);
    expect(pendings).toBeLessThanOrEqual(1);
  }
  logEvidence4(
    'api-T05-concurrency.jsonl',
    testInfo,
    `SUMMARY iterations=${ITERATIONS} parallel=${PARALLEL}`,
    summary,
  );
});
