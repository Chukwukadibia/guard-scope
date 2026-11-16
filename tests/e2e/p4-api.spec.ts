import { test, expect, USER_B, apiSession, isMobile } from './helpers';
import { rest, archiveTracked, trackCreatedProjects, type TrackedProjects } from './p2-helpers';
import { apiClassify, apiCreateRequest, localDate, tokenOf } from './p3-helpers';
import {
  apiAdditionalRequest,
  apiCoEvents,
  apiCreateCO,
  apiPatchVersion,
  apiSendableCO,
  apiVersions,
  errMsg,
  logEvidence4,
  rpc,
  uniq4,
} from './p4-helpers';

/**
 * Phase 4 Tester — API level with real JWTs (T-01..T-04, T-08, T-09).
 * Pure API checks run once (desktop project); the browser is only the HTTP client.
 */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'API-only checks run once, on the desktop project');
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const FORBIDDEN = [401, 403];

test('T-01 API: create from Additional only, pre-filled, no private notes, one per request', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, requestId } = await apiAdditionalRequest(
    page,
    token,
    uniq4(testInfo, 'create'),
    {
      currency: 'GBP',
      description: 'Public detail text',
      notes: 'PRIVATE-NOTE-XYZ',
    },
  );
  const others: Record<string, string> = {};
  for (const cls of ['unclassified', 'included', 'needs_clarification']) {
    const rid = await apiCreateRequest(page, token, projectId, { title: `other ${cls}` });
    if (cls !== 'unclassified') await apiClassify(page, token, rid, cls);
    const r = await rpc(page, token, 'create_change_order', { p_request_id: rid });
    others[cls] = `${r.status}:${errMsg(r.body)}`;
  }
  expect(others).toEqual({
    unclassified: '400:request_not_additional',
    included: '400:request_not_additional',
    needs_clarification: '400:request_not_additional',
  });
  const coId = await apiCreateCO(page, token, requestId);
  const again = await rpc(page, token, 'create_change_order', { p_request_id: requestId });
  expect(`${again.status}:${errMsg(again.body)}`).toBe('400:change_order_exists');
  const direct = await rest(page, token, 'POST', '/rest/v1/change_orders', {
    project_id: projectId,
    request_id: requestId,
  });
  expect(FORBIDDEN).toContain(direct.status);
  const [v1, ...rest1] = await apiVersions(page, token, coId);
  expect(rest1).toEqual([]);
  expect(v1).toMatchObject({
    version_no: 1,
    status: 'draft',
    sent_at: null,
    currency: 'GBP',
    description: 'Public detail text',
    price_impact: 0,
    time_impact_value: null,
    assumptions: null,
    exclusions: null,
    client_terms: null,
  });
  expect(v1.title).toMatch(/^Req P4T create/);
  expect(JSON.stringify(v1)).not.toContain('PRIVATE-NOTE');
  const ev = await apiCoEvents(page, token, coId);
  expect(JSON.stringify(ev)).not.toContain('PRIVATE-NOTE');
  logEvidence4('api-T01.jsonl', testInfo, 'create', {
    others,
    again: again.body,
    direct: direct.status,
    v1,
  });
});

test('T-02 API: every field persists; every rule rejected via REST', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { requestId } = await apiAdditionalRequest(page, token, uniq4(testInfo, 'edit'));
  const coId = await apiCreateCO(page, token, requestId);
  const [v1] = await apiVersions(page, token, coId);
  const deadline = await localDate(page, 21);
  const all = {
    title: 'Pricing page',
    description: 'Line one\nLine two',
    price_impact: 1234.5,
    currency: 'USD',
    time_impact_value: 2.5,
    time_impact_unit: 'weeks',
    proposed_deadline: deadline,
    assumptions: 'Copy supplied by client',
    exclusions: 'No translations',
    client_terms: '50% upfront',
  };
  const p = await apiPatchVersion(page, token, v1.id, all);
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  const [after] = await apiVersions(page, token, coId);
  expect(after).toMatchObject(all);
  const bad: [string, Record<string, unknown>][] = [
    ['blank title', { title: '   ' }],
    ['title 201', { title: 'x'.repeat(201) }],
    ['description 5001', { description: 'd'.repeat(5001) }],
    ['negative price', { price_impact: -1 }],
    ['price too large', { price_impact: 1e12 }],
    ['lowercase currency', { currency: 'usd' }],
    ['negative time', { time_impact_value: -1 }],
    ['bad unit', { time_impact_unit: 'months' }],
    ['value without unit', { time_impact_unit: null }],
    ['unit without value', { time_impact_value: null }],
    ['assumptions 5001', { assumptions: 'a'.repeat(5001) }],
    ['exclusions 5001', { exclusions: 'e'.repeat(5001) }],
    ['terms 5001', { client_terms: 't'.repeat(5001) }],
    ['status write', { status: 'pending' }],
    ['sent_at write', { sent_at: new Date().toISOString() }],
    ['version_no write', { version_no: 9 }],
  ];
  const results: Record<string, string> = {};
  for (const [label, f] of bad) {
    const r = await apiPatchVersion(page, token, v1.id, f);
    results[label] = `${r.status}:${(r.body as { code?: string })?.code}`;
  }
  logEvidence4('api-T02.jsonl', testInfo, 'rejections', results);
  for (const [label, f] of bad) {
    const expected = ['status write', 'sent_at write', 'version_no write'].includes(label)
      ? /^(401|403):42501$/
      : /^400:(23514|22003|23502)$/;
    expect(results[label], `${label} ${JSON.stringify(f).slice(0, 60)}`).toMatch(expected);
  }
  const [unchanged] = await apiVersions(page, token, coId);
  expect(unchanged).toMatchObject(all);
});

test('T-03 API: send-time rules; valid send sets pending + server time', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { requestId } = await apiAdditionalRequest(page, token, uniq4(testInfo, 'send'));
  const coId = await apiCreateCO(page, token, requestId);
  const [v1] = await apiVersions(page, token, coId);
  const send = () => rpc(page, token, 'send_change_order_version', { p_version_id: v1.id });
  const out: Record<string, string> = {};
  await apiPatchVersion(page, token, v1.id, { description: '', price_impact: 100 });
  let r = await send();
  out.no_description = `${r.status}:${errMsg(r.body)}`;
  await apiPatchVersion(page, token, v1.id, { description: 'Work', price_impact: 0 });
  r = await send();
  out.no_impact = `${r.status}:${errMsg(r.body)}`;
  await apiPatchVersion(page, token, v1.id, { time_impact_value: 0, time_impact_unit: 'hours' });
  r = await send();
  out.zero_time_zero_price = `${r.status}:${errMsg(r.body)}`;
  await apiPatchVersion(page, token, v1.id, {
    time_impact_value: 4,
    proposed_deadline: await localDate(page, -2),
  });
  r = await send();
  out.past_deadline = `${r.status}:${errMsg(r.body)}`;
  const mismatch = await apiPatchVersion(page, token, v1.id, { time_impact_unit: null });
  out.mismatch_cannot_be_saved = `${mismatch.status}:${(mismatch.body as { code?: string }).code}`;
  expect(out).toEqual({
    no_description: '400:missing_content',
    no_impact: '400:invalid_impact',
    zero_time_zero_price: '400:invalid_impact',
    past_deadline: '400:deadline_in_past',
    mismatch_cannot_be_saved: '400:23514',
  });
  const [stillDraft] = await apiVersions(page, token, coId);
  expect(stillDraft.status).toBe('draft');
  await apiPatchVersion(page, token, v1.id, { proposed_deadline: await localDate(page, 10) });
  const before = Date.now();
  r = await send();
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const [sent] = await apiVersions(page, token, coId);
  expect(sent.status).toBe('pending');
  expect(Math.abs(new Date(sent.sent_at as string).getTime() - before)).toBeLessThan(5 * 60_000);
  const twice = await send();
  expect(`${twice.status}:${errMsg(twice.body)}`).toBe('400:not_draft');
  logEvidence4('api-T03.jsonl', testInfo, 'send', { out, sent, twice: twice.body });
});

test('T-04 API: a sent version cannot be changed or deleted by the owner via REST', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { coId, v1Id } = await apiSendableCO(page, token, uniq4(testInfo, 'immut'));
  expect((await rpc(page, token, 'send_change_order_version', { p_version_id: v1Id })).status).toBe(
    200,
  );
  const [before] = await apiVersions(page, token, coId);
  const fields: Record<string, unknown> = {
    title: 'tampered',
    description: 'tampered',
    price_impact: 1,
    currency: 'USD',
    time_impact_value: 1,
    time_impact_unit: 'hours',
    proposed_deadline: '2030-01-01',
    assumptions: 'x',
    exclusions: 'x',
    client_terms: 'x',
  };
  const res: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const r = await apiPatchVersion(page, token, v1Id, { [k]: v });
    res[k] = `${r.status}:${JSON.stringify(r.body)}`;
  }
  const del = await rest(page, token, 'DELETE', `/rest/v1/change_order_versions?id=eq.${v1Id}`);
  const delCo = await rest(page, token, 'DELETE', `/rest/v1/change_orders?id=eq.${coId}`);
  const discard = await rpc(page, token, 'discard_change_order_draft', { p_version_id: v1Id });
  const [after] = await apiVersions(page, token, coId);
  logEvidence4('api-T04.jsonl', testInfo, 'immutability', {
    res,
    del: del.status,
    delCo: delCo.status,
    discard: discard.body,
  });
  for (const k of Object.keys(fields)) expect(res[k], k).toBe('200:[]');
  expect(FORBIDDEN).toContain(del.status);
  expect(FORBIDDEN).toContain(delCo.status);
  expect(errMsg(discard.body)).toBe('not_draft');
  expect(after).toEqual(before);
});

test('T-08 API: completed and archived projects block every proposal write', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, coId, v1Id } = await apiSendableCO(page, token, uniq4(testInfo, 'closed'));
  await rpc(page, token, 'send_change_order_version', { p_version_id: v1Id });
  const v2 = (await rpc(page, token, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  const otherReq = await apiCreateRequest(page, token, projectId, { title: 'second additional' });
  await apiClassify(page, token, otherReq, 'additional');
  const results: Record<string, Record<string, string>> = {};
  for (const status of ['completed', 'archived']) {
    const s = await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, { status });
    expect(s.status).toBe(200);
    const calls: [string, string, Record<string, unknown>][] = [
      ['create', 'create_change_order', { p_request_id: otherReq }],
      ['send', 'send_change_order_version', { p_version_id: v2 }],
      ['cancel', 'cancel_change_order_version', { p_version_id: v1Id }],
      ['new', 'new_change_order_version', { p_change_order_id: coId }],
      ['discard', 'discard_change_order_draft', { p_version_id: v2 }],
    ];
    results[status] = {};
    for (const [k, fn, args] of calls) {
      const r = await rpc(page, token, fn, args);
      results[status][k] = `${r.status}:${errMsg(r.body)}`;
    }
    const p = await apiPatchVersion(page, token, v2, { title: `edited while ${status}` });
    results[status].patch_draft = `${p.status}:${JSON.stringify(p.body)}`;
    const read = await apiVersions(page, token, coId);
    results[status].readable = String(read.length);
  }
  logEvidence4('api-T08.jsonl', testInfo, 'closed', results);
  for (const status of ['completed', 'archived']) {
    expect(results[status]).toEqual({
      create: '400:project_not_active',
      send: '400:project_not_active',
      cancel: '400:project_not_active',
      new: '400:project_not_active',
      discard: '400:project_not_active',
      patch_draft: '200:[]',
      readable: '2',
    });
  }
  await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${projectId}`, { status: 'active' });
  const reopened = await rpc(page, token, 'send_change_order_version', { p_version_id: v2 });
  expect(reopened.status, 'C-2: reopening re-enables writes').toBe(200);
});

test("T-09 API: user B and anon have no access to A's proposals", async ({
  page,
  sessionA,
  browser,
}, testInfo) => {
  const tokenA = tokenOf(sessionA);
  const { requestId, coId, v1Id } = await apiSendableCO(page, tokenA, uniq4(testInfo, 'iso'));
  await rpc(page, tokenA, 'send_change_order_version', { p_version_id: v1Id });
  const v2 = (await rpc(page, tokenA, 'new_change_order_version', { p_change_order_id: coId }))
    .body as string;
  const tokenB = tokenOf(await apiSession(browser, USER_B));
  const out: Record<string, string> = {};
  const get = async (who: string, token: string | null, path: string) => {
    const r = await rest(page, token, 'GET', path);
    out[`${who} GET ${path.split('?')[0].split('/').pop()}`] =
      `${r.status}:${JSON.stringify(r.body).slice(0, 80)}`;
  };
  for (const [who, token] of [
    ['B', tokenB],
    ['anon', null],
  ] as const) {
    await get(who, token, `/rest/v1/change_orders?select=*&id=eq.${coId}`);
    await get(who, token, `/rest/v1/change_order_versions?select=*&change_order_id=eq.${coId}`);
    await get(who, token, `/rest/v1/activity_events?select=*&entity_id=eq.${coId}`);
    const calls: [string, string, Record<string, unknown>][] = [
      ['create', 'create_change_order', { p_request_id: requestId }],
      ['send', 'send_change_order_version', { p_version_id: v2 }],
      ['cancel', 'cancel_change_order_version', { p_version_id: v1Id }],
      ['new', 'new_change_order_version', { p_change_order_id: coId }],
      ['discard', 'discard_change_order_draft', { p_version_id: v2 }],
      ['lock', '_lock_change_order', { p_change_order_id: coId, p_require_active: true }],
    ];
    for (const [k, fn, args] of calls) {
      const r = await rpc(page, token, fn, args);
      out[`${who} rpc ${k}`] = `${r.status}:${errMsg(r.body) ?? ''}`;
    }
    const p = await apiPatchVersion(page, token as string, v2, { title: `${who} was here` });
    out[`${who} PATCH draft`] = `${p.status}:${JSON.stringify(p.body).slice(0, 60)}`;
    const d = await rest(page, token, 'DELETE', `/rest/v1/change_order_versions?id=eq.${v2}`);
    out[`${who} DELETE draft`] = `${d.status}`;
  }
  // A also cannot call the internal helper
  const lockA = await rpc(page, tokenA, '_lock_change_order', {
    p_change_order_id: coId,
    p_require_active: true,
  });
  out['A rpc lock'] = `${lockA.status}:${errMsg(lockA.body) ?? ''}`;
  logEvidence4('api-T09.jsonl', testInfo, 'isolation', out);
  for (const k of ['change_orders', 'change_order_versions', 'activity_events'])
    expect(out[`B GET ${k}`], k).toBe('200:[]');
  for (const k of ['create', 'send', 'cancel', 'new', 'discard'])
    expect(out[`B rpc ${k}`], `B ${k}`).toBe('400:not_found');
  expect(out['B PATCH draft']).toBe('200:[]');
  expect(out['B DELETE draft']).toMatch(/^40[13]$/);
  for (const k of ['change_orders', 'change_order_versions', 'activity_events'])
    expect(out[`anon GET ${k}`], `anon ${k}`).toMatch(/^40[13]:/);
  for (const k of ['create', 'send', 'cancel', 'new', 'discard', 'lock'])
    expect(out[`anon rpc ${k}`], `anon ${k}`).toMatch(/^(401|403|404):/);
  expect(out['B rpc lock']).toMatch(/^(401|403|404):/);
  expect(out['A rpc lock']).toMatch(/^(401|403|404):/);
  expect(out['anon PATCH draft']).toMatch(/^40[13]:/);
  const after = await apiVersions(page, tokenA, coId);
  expect(after.map((v) => `${v.version_no}:${v.status}:${v.title}`)).toEqual([
    `1:pending:${after[0].title}`,
    `2:draft:${after[0].title}`,
  ]);
  expect(after[1].title).not.toMatch(/was here/);
});

test('T-07 API: history order with version numbers for a full lifecycle', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { coId, v1Id } = await apiSendableCO(page, token, uniq4(testInfo, 'hist'));
  const call = (fn: string, args: Record<string, unknown>) => rpc(page, token, fn, args);
  await call('send_change_order_version', { p_version_id: v1Id });
  const v2 = (await call('new_change_order_version', { p_change_order_id: coId })).body as string;
  await call('send_change_order_version', { p_version_id: v2 });
  await call('cancel_change_order_version', { p_version_id: v2 });
  const v3 = (await call('new_change_order_version', { p_change_order_id: coId })).body as string;
  await call('discard_change_order_draft', { p_version_id: v3 });
  const ev = await apiCoEvents(page, token, coId);
  const chain = ev.map((e) => `${e.event_type.replace('change_order.', '')}:${e.entity_version}`);
  logEvidence4('api-T07.jsonl', testInfo, 'history', ev);
  expect(chain).toEqual([
    'created:1',
    'sent:1',
    'version_created:2',
    'superseded:1',
    'sent:2',
    'cancelled:2',
    'version_created:3',
    'draft_discarded:3',
  ]);
  for (let i = 1; i < ev.length; i++)
    expect(new Date(ev[i].created_at).getTime()).toBeGreaterThanOrEqual(
      new Date(ev[i - 1].created_at).getTime(),
    );
  expect(ev.map((e) => e.summary).join(' ')).not.toMatch(/paid|collected|earned/i);
});
