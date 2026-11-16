import { test, expect, isMobile } from './helpers';
import {
  openProject,
  rest,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import {
  apiClassify,
  apiConfirmedProject,
  apiCreateRequest,
  apiEvents,
  historyRegion,
  logEvidence,
  openRequest,
  shot3,
  tokenOf,
  uniq3,
} from './p3-helpers';

/** Phase 3 Tester — classification and history (T-03, T-04, T-09, BR-6). */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

/** Microseconds since epoch from a PostgREST timestamptz (keeps the sub-millisecond part). */
const micros = (ts: string): bigint => {
  const m = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$/.exec(ts);
  if (!m) throw new Error(`bad timestamp ${ts}`);
  const zone = m[3] || 'Z';
  return BigInt(Date.parse(m[1] + zone)) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0').slice(0, 6));
};

const label: Record<string, string> = {
  unclassified: 'Not classified yet',
  included: 'Included',
  additional: 'Additional',
  needs_clarification: 'Needs clarification',
};

test.describe('T-03 / AC-3 classify and history', () => {
  test('each option updates the label and appends one history entry; same value adds none', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'classify'));
    const rid = await apiCreateRequest(page, token, pid, { title: 'Classify me' });
    await openRequest(page, pid, rid);
    const group = page.getByRole('group', { name: 'Classify this request' });
    const items = historyRegion(page).getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Request recorded: Classify me');

    // Compare-with-scope summary on the same page (US-3)
    const compare = page.getByRole('region', { name: 'Compare with your recorded scope' });
    await expect(compare).toContainText('Five-page website');
    await expect(compare).toContainText('Copywriting');

    const rpcCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/rpc/classify_request')) rpcCalls.push(r.postData() ?? '');
    });

    const sequence = ['included', 'needs_clarification', 'additional', 'included'] as const;
    let expected = 1;
    let previous = 'unclassified';
    const entryTexts: { from: string; to: string; text: string }[] = [];
    for (const value of sequence) {
      await group.getByRole('button', { name: label[value] }).click();
      expected += 1;
      await expect(page.getByText(`Marked as ${label[value]}.`)).toBeVisible();
      await expect(group.getByRole('button', { name: label[value] })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(items).toHaveCount(expected);
      const text = await items.nth(expected - 1).innerText();
      entryTexts.push({ from: previous, to: value, text });
      expect(text).toContain(label[value]);
      expect(text).toMatch(/\d{4}.*\d{2}:\d{2}/); // a time is shown
      previous = value;
    }
    // badge in the header shows the latest value
    await expect(page.locator('h1').locator('..').locator('..')).toContainText('Included');

    // re-selecting the same value: no request, no entry
    const before = rpcCalls.length;
    await group.getByRole('button', { name: 'Included' }).click();
    await page.waitForTimeout(500);
    expect(rpcCalls.length).toBe(before);
    await expect(items).toHaveCount(expected);

    await page.reload();
    await expect(historyRegion(page).getByRole('listitem')).toHaveCount(expected);
    await shot3(page, testInfo, 'T03-history');
    logEvidence('e2e-T03.jsonl', testInfo, 'history entries (from -> to, UI text)', entryTexts);

    // DB: one event per real change, exact from/to
    const ev = (await apiEvents(page, token, rid)).filter(
      (e) => e.event_type === 'request.classified',
    );
    expect(ev.map((e) => `${e.metadata.from}>${e.metadata.to}`)).toEqual([
      'unclassified>included',
      'included>needs_clarification',
      'needs_clarification>additional',
      'additional>included',
    ]);

    // AC-3: the entry shows from -> to. The UI must state what it changed FROM (retest 1: hard).
    for (const e of entryTexts)
      expect(
        e.text,
        `history entry for ${e.from} -> ${e.to} should name the previous value`,
      ).toContain(label[e.from]);
    // Screen readers: each classification entry reads "Changed from <from> to <to>" (arrow hidden).
    const after = historyRegion(page).getByRole('listitem');
    for (let i = 0; i < entryTexts.length; i++) {
      const e = entryTexts[i];
      const li = after.nth(i + 1);
      const spoken = (
        await li.evaluate((el) => {
          const walk = (n: Node): string =>
            n.nodeType === Node.TEXT_NODE
              ? (n.textContent ?? '')
              : (n as Element).getAttribute?.('aria-hidden') === 'true'
                ? ''
                : Array.from(n.childNodes).map(walk).join('');
          return walk(el);
        })
      ).replace(/\s+/g, ' ');
      expect(spoken, `spoken text of entry ${i + 1}`).toContain(
        `Changed from ${label[e.from]} to ${label[e.to]}`,
      );
      expect(spoken).not.toContain('→');
      await expect(li.locator('[aria-hidden="true"]')).toHaveText('→');
    }
  });

  test('API: same value twice adds no event; history cannot be edited or deleted', async ({
    page,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is enough');
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'api-classify'));
    const rid = await apiCreateRequest(page, token, pid, { title: 'API classify' });
    expect((await apiClassify(page, token, rid, 'additional')).status).toBe(200);
    expect((await apiClassify(page, token, rid, 'additional')).status).toBe(200);
    const unc = await apiClassify(page, token, rid, 'unclassified');
    const bad = await apiClassify(page, token, rid, 'out_of_scope');
    const ev = await apiEvents(page, token, rid);
    expect(ev.filter((e) => e.event_type === 'request.classified')).toHaveLength(1);
    const evId = ev[0].id;
    const attacks = {
      unclassified: unc,
      invalid: bad,
      patchEvent: await rest(page, token, 'PATCH', `/rest/v1/activity_events?id=eq.${evId}`, {
        summary: 'edited',
      }),
      deleteEvent: await rest(page, token, 'DELETE', `/rest/v1/activity_events?id=eq.${evId}`),
      insertEvent: await rest(page, token, 'POST', '/rest/v1/activity_events', {
        project_id: pid,
        actor_type: 'freelancer',
        event_type: 'request.classified',
        entity_type: 'request',
        entity_id: rid,
        summary: 'Marked as Included',
        metadata: { from: 'additional', to: 'included' },
      }),
      patchClassification: await rest(page, token, 'PATCH', `/rest/v1/requests?id=eq.${rid}`, {
        classification: 'included',
      }),
      patchClassificationWithTitle: await rest(
        page,
        token,
        'PATCH',
        `/rest/v1/requests?id=eq.${rid}`,
        { title: 'x', classification: 'included' },
      ),
    };
    logEvidence('api-T03-T04.jsonl', testInfo, 'history + classification attacks', attacks);
    expect(JSON.stringify(unc.body)).toContain('invalid_classification');
    expect(JSON.stringify(bad.body)).toContain('invalid_classification');
    for (const k of [
      'patchEvent',
      'deleteEvent',
      'insertEvent',
      'patchClassification',
      'patchClassificationWithTitle',
    ] as const)
      expect([401, 403], k).toContain(attacks[k].status);
    const after = await apiEvents(page, token, rid);
    expect(after).toEqual(ev);
    const row = await rest(
      page,
      token,
      'GET',
      `/rest/v1/requests?select=title,classification&id=eq.${rid}`,
    );
    expect(row.body).toEqual([{ title: 'API classify', classification: 'additional' }]);
  });

  test('concurrent classification keeps a consistent history', async ({
    page,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is enough');
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'concurrent'));
    const rid = await apiCreateRequest(page, token, pid, { title: 'Race' });
    const { SUPABASE_URL, SUPABASE_KEY } = await import('./helpers');
    const fire = (values: string[]) =>
      page.evaluate(
        async ({ url, key, token, rid, values }) =>
          Promise.all(
            values.map((v) =>
              fetch(`${url}/rest/v1/rpc/classify_request`, {
                method: 'POST',
                headers: {
                  apikey: key,
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ p_request_id: rid, p_classification: v }),
              }).then((r) => r.status),
            ),
          ),
        { url: SUPABASE_URL, key: SUPABASE_KEY, token, rid, values },
      );
    // 10 parallel calls, all the same value -> exactly one event
    const same = await fire(Array(10).fill('included'));
    let ev = (await apiEvents(page, token, rid)).filter(
      (e) => e.event_type === 'request.classified',
    );
    expect(same.every((s) => s === 200)).toBe(true);
    expect(ev).toHaveLength(1);
    // 12 parallel calls with mixed values -> history forms an unbroken chain ending at the stored value
    const vals = ['additional', 'needs_clarification', 'included'];
    const mixed = await fire(Array.from({ length: 12 }, (_, i) => vals[i % 3]));
    expect(mixed.every((s) => s === 200)).toBe(true);
    ev = (await apiEvents(page, token, rid)).filter((e) => e.event_type === 'request.classified');
    const row = await rest(
      page,
      token,
      'GET',
      `/rest/v1/requests?select=classification&id=eq.${rid}`,
    );
    const finalValue = (row.body as { classification: string }[])[0].classification;
    const chain = ev.map((e) => [e.metadata.from as string, e.metadata.to as string]);
    logEvidence('api-T03-concurrency.jsonl', testInfo, 'chain', {
      requestId: rid,
      same,
      mixed,
      sent: Array.from({ length: 12 }, (_, i) => vals[i % 3]),
      historyRows: ev.map((e) => ({
        id: e.id,
        created_at: e.created_at,
        from: e.metadata.from,
        to: e.metadata.to,
        summary: e.summary,
      })),
      chain,
      finalValue,
    });
    // Integrity (hard): no self-transitions, and the transitions form one unbroken path
    // unclassified -> ... -> stored value (Eulerian path check, order-independent).
    for (const [f, t] of chain) expect(f).not.toBe(t);
    const bal: Record<string, number> = {};
    for (const [f, t] of chain) {
      bal[f] = (bal[f] ?? 0) - 1;
      bal[t] = (bal[t] ?? 0) + 1;
    }
    const expectedBal: Record<string, number> = {};
    if (finalValue !== 'unclassified') {
      expectedBal.unclassified = -1;
      expectedBal[finalValue] = 1;
    }
    for (const k of Object.keys(bal)) if (bal[k] === 0) delete bal[k];
    expect(bal).toEqual(expectedBal);
    expect(chain.filter(([f]) => f === 'unclassified')).toHaveLength(1);
    // Order (hard since retest 1, D-2 / ISS-015): read in the app's order (seq), each entry's "from"
    // equals the previous entry's "to", and the last entry equals the stored value.
    expect(chain[0][0], 'first event starts from unclassified').toBe('unclassified');
    for (let i = 1; i < chain.length; i++)
      expect(chain[i][0], `history order: link ${i}`).toBe(chain[i - 1][1]);
    expect(chain[chain.length - 1][1], 'last entry matches stored value').toBe(finalValue);
    // seq strictly increasing and unique; created_at order agrees with seq order.
    const all = await apiEvents(page, token, rid);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].seq, `seq increases at ${i}`).toBeGreaterThan(all[i - 1].seq);
      expect(
        micros(all[i].created_at),
        `created_at non-decreasing in seq order at ${i}`,
      ).toBeGreaterThanOrEqual(micros(all[i - 1].created_at));
    }
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect(all.filter((e) => e.event_type === 'request.created')).toHaveLength(1);
    expect(all[0].event_type).toBe('request.created');
    logEvidence('api-T03-concurrency-retest1.jsonl', testInfo, 'seq order', {
      requestId: rid,
      finalValue,
      events: all.map((e) => ({
        seq: e.seq,
        created_at: e.created_at,
        type: e.event_type,
        from: e.metadata.from,
        to: e.metadata.to,
      })),
    });
    // UI: the request page shows the stored value and a history whose last entry ends at it.
    await openRequest(page, pid, rid);
    const items = historyRegion(page).getByRole('listitem');
    await expect(items).toHaveCount(all.length);
    await expect(items.last()).toContainText(`to ${label[finalValue]}`);
    await expect(page.locator('h1').locator('..').locator('..')).toContainText(label[finalValue]);
  });
});

test.describe('T-09 / AC-9 no money; Phase 4 hint; BR-6 wording', () => {
  test('Included shows no value; Additional shows the hint without a dead action', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'money'));
    const inc = await apiCreateRequest(page, token, pid, { title: 'Included one' });
    const add = await apiCreateRequest(page, token, pid, { title: 'Additional one' });
    const clar = await apiCreateRequest(page, token, pid, { title: 'Unclear one' });
    await apiClassify(page, token, inc, 'included');
    await apiClassify(page, token, add, 'additional');
    await apiClassify(page, token, clar, 'needs_clarification');
    const money = /EUR|USD|€|\$|£|1,?234|price|revenue|earned|paid|value|amount/i;

    await openRequest(page, pid, inc);
    await expect(
      page.getByText('You marked this as covered by the agreement or the remaining revisions.'),
    ).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(money);
    await shot3(page, testInfo, 'T09-included');

    await openRequest(page, pid, add);
    const decision = page.getByRole('region', { name: 'Your decision' });
    await expect(decision).toContainText('You marked this as outside the agreement.');
    await expect(decision).toContainText(/change proposal once change orders are available/);
    expect(await page.locator('main').innerText()).not.toMatch(money);
    await expect(page.getByRole('button', { name: /change (order|proposal)/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /change (order|proposal)/i })).toHaveCount(0);
    await shot3(page, testInfo, 'T09-additional');

    await openRequest(page, pid, clar);
    await expect(page.getByText('You need more information before deciding.')).toBeVisible();

    // BR-6: no legal conclusions anywhere on these pages
    for (const r of [inc, add, clar]) {
      await openRequest(page, pid, r);
      const text = await page.locator('main').innerText();
      expect(text).not.toMatch(/legally|out of scope|in scope|breach|you are owed|client owes/i);
    }

    // Project page: request list and revisions show no money beyond the project's own agreed price
    await openProject(page, pid);
    expect(await page.getByRole('region', { name: 'Client requests' }).innerText()).not.toMatch(
      money,
    );
    expect(await page.getByRole('region', { name: 'Revisions' }).innerText()).not.toMatch(money);
  });
});
