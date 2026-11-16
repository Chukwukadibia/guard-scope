import { test, expect, USER_B, apiSession, isMobile } from './helpers';
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
  localDate,
  logEvidence,
  openRequest,
  requestsRegion,
  shot3,
  tokenOf,
  uniq3,
} from './p3-helpers';

/** Phase 3 Tester — capture, validation, private notes, archived, isolation (T-01, T-02, T-05, T-07, T-08, §6). */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

test.describe('T-01 / AC-1 capture', () => {
  test('quick add with title only, full add, reload, list order, filter', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'capture'));
    await openProject(page, pid);
    const reqs = requestsRegion(page);
    await expect(reqs.getByText('No requests yet')).toBeVisible();

    // Quick add: title only, date pre-filled with today
    const today = await localDate(page);
    await expect(reqs.getByLabel('Received on')).toHaveValue(today);
    await reqs.getByLabel('What did the client ask for?').fill('Add a contact form');
    await reqs.getByRole('button', { name: 'Save request' }).click();
    await expect(reqs.getByText('Request "Add a contact form" saved.')).toBeVisible();
    await expect(reqs.getByLabel('What did the client ask for?')).toHaveValue('');
    await expect(reqs.getByRole('link', { name: /Add a contact form/ })).toBeVisible();

    // Full add: every field
    const yesterday = await localDate(page, -1);
    await reqs.getByRole('button', { name: 'Add details or private notes' }).click();
    await reqs.getByLabel('What did the client ask for?').fill('Extra landing page');
    await reqs.getByLabel('Received on').fill(yesterday);
    await reqs.getByLabel('Received via (optional)').selectOption('email');
    await reqs.getByLabel('Details (optional)').fill('Client emailed: can we get one more page?');
    await reqs.getByLabel('Private notes (optional)').fill('Probably billable, check budget');
    await reqs.getByRole('button', { name: 'Save request' }).click();
    await expect(reqs.getByText('Request "Extra landing page" saved.')).toBeVisible();

    await page.reload();
    await expect(reqs.getByRole('link', { name: /Add a contact form/ })).toBeVisible();
    await expect(reqs.getByRole('link', { name: /Extra landing page.*via Email/ })).toBeVisible();

    const rows = await rest(
      page,
      token,
      'GET',
      `/rest/v1/requests?select=title,description,source_channel,received_on,classification,internal_notes&project_id=eq.${pid}&order=title`,
    );
    expect(rows.body).toEqual([
      {
        title: 'Add a contact form',
        description: null,
        source_channel: null,
        received_on: today,
        classification: 'unclassified',
        internal_notes: null,
      },
      {
        title: 'Extra landing page',
        description: 'Client emailed: can we get one more page?',
        source_channel: 'email',
        received_on: yesterday,
        classification: 'unclassified',
        internal_notes: 'Probably billable, check budget',
      },
    ]);
    logEvidence('e2e-T01.jsonl', testInfo, 'rows after UI create', rows.body);

    // List order: newest received first, ties by newest created
    await apiCreateRequest(page, token, pid, {
      title: 'Old one',
      received_on: await localDate(page, -10),
    });
    await apiCreateRequest(page, token, pid, {
      title: 'Mid one',
      received_on: await localDate(page, -5),
    });
    await apiCreateRequest(page, token, pid, { title: 'Today later', received_on: today });
    await page.reload();
    await expect(reqs.getByRole('listitem')).toHaveCount(5);
    const titles = (await reqs.getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0]);
    expect(titles).toEqual([
      'Today later',
      'Add a contact form',
      'Extra landing page',
      'Mid one',
      'Old one',
    ]);

    // US-2 filter by classification
    const ids = (
      await rest(page, token, 'GET', `/rest/v1/requests?select=id,title&project_id=eq.${pid}`)
    ).body as { id: string; title: string }[];
    const idOf = (t: string) => ids.find((r) => r.title === t)!.id;
    expect((await apiClassify(page, token, idOf('Old one'), 'included')).status).toBe(200);
    expect((await apiClassify(page, token, idOf('Mid one'), 'additional')).status).toBe(200);
    await page.reload();
    const filters = reqs.getByRole('group', { name: 'Filter requests by classification' });
    await expect(filters.getByRole('button', { name: 'All (5)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await filters.getByRole('button', { name: 'Included (1)' }).click();
    await expect(reqs.getByRole('listitem')).toHaveCount(1);
    await expect(reqs.getByRole('listitem')).toContainText('Old one');
    await filters.getByRole('button', { name: 'Not classified yet (3)' }).click();
    await expect(reqs.getByRole('listitem')).toHaveCount(3);
    await filters.getByRole('button', { name: 'Needs clarification (0)' }).click();
    await expect(reqs.getByText('No requests match this filter.')).toBeVisible();
    await filters.getByRole('button', { name: 'Additional (1)' }).click();
    await expect(reqs.getByRole('listitem')).toContainText('Mid one');
    await shot3(page, testInfo, 'T01-list-filter');

    // Detail shows the full record
    await openRequest(page, pid, idOf('Extra landing page'));
    await expect(page.getByRole('heading', { level: 1, name: 'Extra landing page' })).toBeVisible();
    await expect(page.getByText(/Received .* via Email/)).toBeVisible();
    await expect(page.getByText('Client emailed: can we get one more page?')).toBeVisible();
    await expect(page.getByText('Not classified yet').first()).toBeVisible();
    await shot3(page, testInfo, 'T01-detail');
  });

  test('edit a request persists after reload', async ({ page, sessionA }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'edit'));
    const rid = await apiCreateRequest(page, token, pid, { title: 'Before edit' });
    await openRequest(page, pid, rid);
    await page.getByRole('button', { name: 'Edit request' }).click();
    await page.getByLabel('What did the client ask for?').fill('After edit');
    await page.getByLabel('Received via (optional)').selectOption('call');
    await page.getByLabel('Private notes (optional)').fill('edited note');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Request updated.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'After edit' })).toBeVisible();
    await expect(page.getByText(/via Call/)).toBeVisible();
    await expect(page.getByText('edited note')).toBeVisible();
  });
});

test.describe('T-02 / AC-2 validation', () => {
  test('UI: field errors + focused summary, nothing sent', async ({ page, sessionA }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'valid'));
    await openProject(page, pid);
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/rest/v1/requests')) posts.push(r.url());
    });
    const reqs = requestsRegion(page);
    const title = reqs.getByLabel('What did the client ask for?');
    const save = reqs.getByRole('button', { name: 'Save request' });
    const summary = reqs.getByRole('alert').filter({ hasText: 'There is a problem' });

    // missing title
    await save.click();
    await expect(summary).toBeFocused();
    await expect(summary).toContainText('Enter a short title for the request.');
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await shot3(page, testInfo, 'T02-missing-title');

    // 201 chars
    await title.fill('x'.repeat(201));
    await save.click();
    await expect(summary).toContainText('Use 200 characters or fewer.');

    // future date
    await title.fill('Valid title');
    await reqs.getByLabel('Received on').fill(await localDate(page, 1));
    await save.click();
    await expect(summary).toContainText("The received date can't be in the future.");

    // empty date
    await reqs.getByLabel('Received on').fill('');
    await save.click();
    await expect(summary).toContainText('Enter the date you received the request.');
    await reqs.getByLabel('Received on').fill(await localDate(page));

    // long details / notes (form expands on error)
    await reqs.getByRole('button', { name: 'Add details or private notes' }).click();
    await reqs.getByLabel('Details (optional)').fill('d'.repeat(5001));
    await reqs.getByLabel('Private notes (optional)').fill('n'.repeat(5001));
    await save.click();
    await expect(summary.getByRole('link')).toHaveCount(2);
    await reqs.getByLabel('Details (optional)').fill('ok');
    await reqs.getByLabel('Private notes (optional)').fill('ok');

    // invalid channel (option injected into the DOM — simulates a tampered client)
    await reqs.getByLabel('Received via (optional)').evaluate((el) => {
      const o = document.createElement('option');
      o.value = 'telegram';
      o.textContent = 'Telegram';
      el.appendChild(o);
    });
    await reqs.getByLabel('Received via (optional)').selectOption('telegram');
    await save.click();
    await expect(summary).toContainText('Choose a channel from the list.');
    await shot3(page, testInfo, 'T02-invalid-channel');

    // summary link moves focus to the field
    await summary.getByRole('link', { name: 'Choose a channel from the list.' }).click();
    await expect(reqs.getByLabel('Received via (optional)')).toBeFocused();
    expect(posts).toEqual([]);
  });

  test('API: the same invalid data is rejected by the server', async ({
    page,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is enough');
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'api-valid'));
    const d = (n: number) => localDate(page, n);
    const cases: [string, Record<string, unknown>][] = [
      ['missing title', {}],
      ['blank title', { title: '   ' }],
      ['201-char title', { title: 'x'.repeat(201) }],
      ['5001-char description', { title: 't', description: 'd'.repeat(5001) }],
      ['5001-char notes', { title: 't', internal_notes: 'n'.repeat(5001) }],
      ['bad channel', { title: 't', source_channel: 'telegram' }],
      ['future date +2', { title: 't', received_on: await d(2) }],
      ['future date +30', { title: 't', received_on: await d(30) }],
      ['not a date', { title: 't', received_on: '2026-02-30' }],
      ['garbage date', { title: 't', received_on: 'next week-ish' }],
      ['null date', { title: 't', received_on: null }],
      ['forged classification', { title: 't', classification: 'included' }],
      ['forged created_at', { title: 't', created_at: '2020-01-01T00:00:00Z' }],
    ];
    for (const [label, body] of cases) {
      const r = await rest(page, token, 'POST', '/rest/v1/requests', { project_id: pid, ...body });
      logEvidence('api-T02.jsonl', testInfo, label, { status: r.status, body: r.body });
      expect(r.status, `${label}: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400);
    }
    // Observation: PostgreSQL date literals such as 'yesterday' resolve to a real past date and are accepted
    const literal = await rest(page, token, 'POST', '/rest/v1/requests?select=received_on', {
      project_id: pid,
      title: 'pg literal',
      received_on: 'yesterday',
    });
    logEvidence('api-T02.jsonl', testInfo, "received_on 'yesterday' literal", literal);
    // +1 day is accepted on purpose (time-zone tolerance) — recorded as an observation
    const plus1 = await rest(page, token, 'POST', '/rest/v1/requests', {
      project_id: pid,
      title: 'tomorrow (tolerance)',
      received_on: await d(1),
    });
    logEvidence('api-T02.jsonl', testInfo, 'future date +1 (tolerance)', { status: plus1.status });
    expect(plus1.status).toBe(201);
    const count = await rest(
      page,
      token,
      'GET',
      `/rest/v1/requests?select=id&project_id=eq.${pid}`,
    );
    expect((count.body as unknown[]).length).toBe(literal.status === 201 ? 2 : 1);
  });
});

test.describe('T-05 / AC-5 private notes', () => {
  test('private label on the request; notes nowhere else in the UI or history', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'notes'));
    const secret = `SECRET-NOTE-${Math.random().toString(36).slice(2, 8)}`;
    const rid = await apiCreateRequest(page, token, pid, {
      title: 'Request with notes',
      description: 'Public-ish details',
      internal_notes: secret,
    });
    expect((await apiClassify(page, token, rid, 'included')).status).toBe(200);

    // Create form label
    await openProject(page, pid);
    const reqs = requestsRegion(page);
    await reqs.getByRole('button', { name: 'Add details or private notes' }).click();
    await expect(reqs.getByText('Private — never shown to your client.')).toBeVisible();
    // Not on the project page / list
    await expect(page.locator('main')).not.toContainText(secret);
    for (const f of ['All', 'Included']) {
      await reqs.getByRole('button', { name: new RegExp(`^${f} \\(`) }).click();
      await expect(page.locator('main')).not.toContainText(secret);
    }

    // Detail: shown with the private label
    await openRequest(page, pid, rid);
    const notes = page.locator('dt', { hasText: 'Private notes' }).locator('..');
    await expect(notes).toContainText('Private — never shown to your client.');
    await expect(notes).toContainText(secret);
    await expect(page.getByRole('region', { name: 'History' })).not.toContainText(secret);
    await shot3(page, testInfo, 'T05-private-notes');

    // Stored only on the request row: no event, usage or other row carries it
    const ev = await rest(
      page,
      token,
      'GET',
      `/rest/v1/activity_events?select=summary,metadata&project_id=eq.${pid}`,
    );
    expect(JSON.stringify(ev.body)).not.toContain(secret);
    const proj = await rest(page, token, 'GET', `/rest/v1/projects?select=*&id=eq.${pid}`);
    expect(JSON.stringify(proj.body)).not.toContain(secret);

    // Observation: the owner's list query also returns internal_notes (not rendered)
    const listResp = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/rest/v1/requests') &&
          r.url().includes(`project_id=eq.${pid}`) &&
          r.request().method() === 'GET',
      ),
      page.goto(`/projects/${pid}`),
    ]).then(([r]) => r.text());
    logEvidence(
      'e2e-T05.jsonl',
      testInfo,
      'list response includes internal_notes',
      listResp.includes(secret),
    );
  });
});

test.describe('T-07 / AC-7 archived project', () => {
  test('requests visible; every write blocked in UI and API', async ({
    page,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'archived'));
    const rid = await apiCreateRequest(page, token, pid, {
      title: 'Archived request',
      internal_notes: 'n',
    });
    expect((await apiClassify(page, token, rid, 'included')).status).toBe(200);
    const u = await rest(page, token, 'POST', '/rest/v1/revision_usages?select=id', {
      project_id: pid,
      request_id: rid,
    });
    expect(u.status).toBe(201);
    const usageId = (u.body as { id: string }[])[0].id;
    const a = await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, {
      status: 'archived',
    });
    expect(a.status).toBe(200);

    // UI: project page
    await openProject(page, pid);
    const reqs = requestsRegion(page);
    await expect(reqs.getByRole('link', { name: /Archived request/ })).toBeVisible();
    await expect(reqs.getByText('Log a new request')).toHaveCount(0);
    await expect(reqs.getByLabel('What did the client ask for?')).toHaveCount(0);
    const rev = page.getByRole('region', { name: 'Revisions' });
    await expect(rev.getByRole('button', { name: 'Record a revision as used' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
    await shot3(page, testInfo, 'T07-archived-project');

    // UI: request page
    await openRequest(page, pid, rid);
    await expect(
      page.getByText('This project is archived. Requests are read-only until you reopen it.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit request' })).toHaveCount(0);
    for (const n of ['Included', 'Additional', 'Needs clarification'])
      await expect(
        page.getByRole('group', { name: 'Classify this request' }).getByRole('button', { name: n }),
      ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Record a revision as used' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
    await shot3(page, testInfo, 'T07-archived-request');

    if (isMobile(testInfo)) return;
    // API: every write
    const results: Record<string, { status: number; body: unknown }> = {
      create: await rest(page, token, 'POST', '/rest/v1/requests', {
        project_id: pid,
        title: 'late',
      }),
      edit: await rest(page, token, 'PATCH', `/rest/v1/requests?id=eq.${rid}`, { title: 'edited' }),
      classify: await apiClassify(page, token, rid, 'additional'),
      record: await rest(page, token, 'POST', '/rest/v1/revision_usages', { project_id: pid }),
      undo: await rest(page, token, 'DELETE', `/rest/v1/revision_usages?id=eq.${usageId}`),
    };
    logEvidence('api-T07.jsonl', testInfo, 'archived writes', results);
    expect(results.create.status).toBe(403);
    expect(results.edit.body).toEqual([]);
    expect(results.classify.status).toBe(400);
    expect(JSON.stringify(results.classify.body)).toContain('project_archived');
    expect(results.record.status).toBe(403);
    expect(results.undo.body).toEqual([]);
    const after = await rest(
      page,
      token,
      'GET',
      `/rest/v1/requests?select=title,classification&id=eq.${rid}`,
    );
    expect(after.body).toEqual([{ title: 'Archived request', classification: 'included' }]);
    const usages = await rest(
      page,
      token,
      'GET',
      `/rest/v1/revision_usages?select=id&project_id=eq.${pid}`,
    );
    expect((usages.body as unknown[]).length).toBe(1);
  });
});

test.describe('T-08 / AC-8 isolation', () => {
  test('B and anon cannot touch A’s requests, events, usages or the RPC', async ({
    page,
    browser,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'API-only; desktop run is enough');
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'iso'));
    const rid = await apiCreateRequest(page, token, pid, {
      title: 'A only',
      internal_notes: 'A secret',
    });
    const u = await rest(page, token, 'POST', '/rest/v1/revision_usages?select=id', {
      project_id: pid,
    });
    const usageId = (u.body as { id: string }[])[0].id;
    const sB = await apiSession(browser, USER_B);
    const tB = tokenOf(sB);

    const b = {
      listByProject: await rest(page, tB, 'GET', `/rest/v1/requests?select=*&project_id=eq.${pid}`),
      getById: await rest(page, tB, 'GET', `/rest/v1/requests?select=*&id=eq.${rid}`),
      events: await rest(page, tB, 'GET', `/rest/v1/activity_events?select=*&project_id=eq.${pid}`),
      eventsByEntity: await rest(
        page,
        tB,
        'GET',
        `/rest/v1/activity_events?select=*&entity_id=eq.${rid}`,
      ),
      usages: await rest(page, tB, 'GET', `/rest/v1/revision_usages?select=*&project_id=eq.${pid}`),
      create: await rest(page, tB, 'POST', '/rest/v1/requests', {
        project_id: pid,
        title: 'B was here',
      }),
      edit: await rest(page, tB, 'PATCH', `/rest/v1/requests?id=eq.${rid}`, { title: 'B edit' }),
      move: await rest(page, tB, 'PATCH', `/rest/v1/requests?id=eq.${rid}`, { project_id: pid }),
      classify: await apiClassify(page, tB, rid, 'included'),
      classifyRandom: await apiClassify(page, tB, crypto.randomUUID(), 'included'),
      record: await rest(page, tB, 'POST', '/rest/v1/revision_usages', { project_id: pid }),
      undo: await rest(page, tB, 'DELETE', `/rest/v1/revision_usages?id=eq.${usageId}`),
      forgeEvent: await rest(page, tB, 'POST', '/rest/v1/activity_events', {
        project_id: pid,
        actor_type: 'client',
        event_type: 'x',
        entity_type: 'request',
        entity_id: rid,
        summary: 'forged',
      }),
    };
    logEvidence('api-T08.jsonl', testInfo, 'user B', b);
    expect(b.listByProject.body).toEqual([]);
    expect(b.getById.body).toEqual([]);
    expect(b.events.body).toEqual([]);
    expect(b.eventsByEntity.body).toEqual([]);
    expect(b.usages.body).toEqual([]);
    expect(b.create.status).toBe(403);
    expect(b.edit.body).toEqual([]);
    expect([401, 403]).toContain(b.move.status);
    expect(b.classify.status).toBe(400);
    expect(JSON.stringify(b.classify.body)).toContain('not_found');
    expect(JSON.stringify(b.classifyRandom.body)).toContain('not_found');
    expect(b.record.status).toBe(403);
    expect(b.undo.body).toEqual([]);
    expect([401, 403]).toContain(b.forgeEvent.status);

    const anon = {
      requests: await rest(page, null, 'GET', '/rest/v1/requests?select=*'),
      events: await rest(page, null, 'GET', '/rest/v1/activity_events?select=*'),
      usages: await rest(page, null, 'GET', '/rest/v1/revision_usages?select=*'),
      rpc: await apiClassify(page, '' as unknown as string, rid, 'included'),
      create: await rest(page, null, 'POST', '/rest/v1/requests', {
        project_id: pid,
        title: 'anon',
      }),
    };
    logEvidence('api-T08.jsonl', testInfo, 'anon', anon);
    for (const [k, r] of Object.entries(anon)) expect(r.status, k).toBe(401);

    // A's data intact
    const mine = await rest(
      page,
      token,
      'GET',
      `/rest/v1/requests?select=title,classification,internal_notes&id=eq.${rid}`,
    );
    expect(mine.body).toEqual([
      { title: 'A only', classification: 'unclassified', internal_notes: 'A secret' },
    ]);
    const us = await rest(
      page,
      token,
      'GET',
      `/rest/v1/revision_usages?select=id&project_id=eq.${pid}`,
    );
    expect((us.body as unknown[]).length).toBe(1);
  });
});

test.describe('§6 not found', () => {
  test('missing, foreign, malformed and wrong-project request ids look the same', async ({
    page,
    browser,
    sessionA,
  }, testInfo) => {
    const token = tokenOf(sessionA);
    const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'nf'));
    const pid2 = await apiConfirmedProject(page, token, uniq3(testInfo, 'nf2'));
    const rid2 = await apiCreateRequest(page, token, pid2, { title: 'Other project request' });
    const sB = await apiSession(browser, USER_B);
    const bPid = await apiConfirmedProject(page, tokenOf(sB), uniq3(testInfo, 'nf-B'));
    const bRid = await apiCreateRequest(page, tokenOf(sB), bPid, { title: 'B request' });
    tracked.push({ id: bPid, token: tokenOf(sB) });

    const urls = {
      random: `/projects/${pid}/requests/${crypto.randomUUID()}`,
      malformed: `/projects/${pid}/requests/not-a-uuid`,
      wrongProject: `/projects/${pid}/requests/${rid2}`,
      foreign: `/projects/${bPid}/requests/${bRid}`,
      foreignInOwnProject: `/projects/${pid}/requests/${bRid}`,
    };
    const texts: Record<string, string> = {};
    for (const [k, url] of Object.entries(urls)) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Request not found');
      texts[k] = await page.locator('main').innerText();
      await shot3(page, testInfo, `S6-${k}`);
    }
    const values = Object.values(texts);
    for (const t of values) expect(t).toBe(values[0]);
    await expect(page.locator('main')).not.toContainText('B request');
  });
});
