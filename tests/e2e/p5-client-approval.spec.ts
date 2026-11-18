import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { test, expect, APP_ORIGIN } from './helpers';
import { rest, trackCreatedProjects, archiveTracked, type TrackedProjects } from './p2-helpers';
import { tokenOf } from './p3-helpers';
import { apiSendableCO, apiVersions, rpc, uniq4 } from './p4-helpers';

/**
 * Phase 5 Tester, chunk B: client approval UI (T-03, T-04, T-05, T-07, T-08, T-11, T-12; AC-1..AC-13 UI parts).
 * The public page is always driven from a FRESH context (no session, no storage). Raw approval tokens are kept
 * in memory only: assertions on token leaks use booleans so a failure never prints a token.
 */
const OUT = 'docs/testing/phase5';
const FORBIDDEN_WORDING =
  /legally binding|\bsigned\b|signature|e-?signature|certif(?:y|ied|ication)|\bcontract\b|enforceable/i;
const MONEY_CLAIMS = /\b(paid|collected|earned)\b/i;

test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors, 'uncaught page errors (owner page)').toEqual([]);
  await archiveTracked(page, tracked);
});

function log5(file: string, testInfo: TestInfo, label: string, data: unknown) {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(
    `${OUT}/${file}`,
    `${JSON.stringify({ project: testInfo.project.name, label, data })}\n`,
  );
}

async function publicContext(
  browser: Browser,
  testInfo: TestInfo,
  extra: Record<string, unknown> = {},
) {
  const use = testInfo.project.use;
  const ctx = await browser.newContext({
    baseURL: APP_ORIGIN,
    // browser.newContext() inherits test.use(): force an EMPTY storage state so the client has no session at all
    storageState: { cookies: [], origins: [] },
    viewport: use.viewport ?? undefined,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    ...extra,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

async function axe5(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${OUT}/axe`, { recursive: true });
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const v = r.violations.map((x) => ({
    id: x.id,
    impact: x.impact,
    help: x.help,
    nodes: x.nodes.map((n) => n.target.join(' ')),
  }));
  writeFileSync(
    `${OUT}/axe/${testInfo.project.name}-${name}.json`,
    JSON.stringify({ violations: v, passes: r.passes.length }, null, 2),
  );
  return v;
}

async function noOverflow5(page: Page) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bsw: document.body.scrollWidth,
  }));
  expect(o.sw, `horizontal overflow ${JSON.stringify(o)}`).toBeLessThanOrEqual(o.cw);
  expect(o.bsw).toBeLessThanOrEqual(o.cw);
}

async function shot5(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync(`${OUT}/screenshots`, { recursive: true });
  await page
    .screenshot({ path: `${OUT}/screenshots/${testInfo.project.name}-${name}.png`, fullPage: true })
    .catch(() => undefined);
}

/** Checks a rendered public state: no overflow, no serious/critical axe, no forbidden wording, URL has no fragment. */
async function checkPublicState(page: Page, testInfo: TestInfo, name: string) {
  await noOverflow5(page);
  const violations = await axe5(page, testInfo, `public-${name}`);
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad, `axe serious/critical on public ${name}`).toEqual([]);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(text, `forbidden wording on public ${name}`).not.toMatch(FORBIDDEN_WORDING);
  expect(text, `money claim on public ${name}`).not.toMatch(MONEY_CLAIMS);
  expect(new URL(page.url()).hash, 'fragment must be gone from the address bar').toBe('');
  await shot5(page, testInfo, `public-${name}`);
}

type Fixture = { projectId: string; coId: string; v1Id: string; tok: string; token: string };

/** Sendable proposal sent and linked through the REAL RPCs (owner session A). Returns the raw link token in memory. */
async function sentWithLink(
  page: Page,
  token: string,
  title: string,
  fields: Record<string, unknown> = {},
  send = true,
): Promise<Fixture> {
  const { projectId, coId, v1Id } = await apiSendableCO(page, token, title, fields);
  let tok = '';
  if (send) {
    const s = await rpc(page, token, 'send_change_order_version', { p_version_id: v1Id });
    expect(s.status, 'send').toBe(200);
    const i = await rpc(page, token, 'issue_approval_link', { p_version_id: v1Id });
    expect(i.status, 'issue').toBe(200);
    tok = (i.body as { token: string }).token;
  }
  return { projectId, coId, v1Id, tok, token };
}

const linkUrl = (tok: string) => `/p#${tok}`;

/**
 * Opens a link the way a client does from a mail/chat app: a fresh document load. A plain goto between two
 * "/p#..." URLs is a same-document hash navigation (see the F-5 test), which is not what a new link click does.
 */
async function openLink(page: Page, url: string) {
  await page.goto('about:blank');
  await page.goto(url);
}

// ---------------------------------------------------------------------------------------------------------
test('T-03/T-12 public page: valid state shows exactly the BR-1 content, no private data, a11y, overflow, wording', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const f = await sentWithLink(page, tokenOf(sessionA), uniq4(testInfo, 'p5-valid'), {
    assumptions: 'Assumption A',
    exclusions: 'Exclusion B',
    client_terms: 'Terms C',
  });
  const { ctx, page: pub, errors } = await publicContext(browser, testInfo);
  await openLink(pub, linkUrl(f.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  const main = (await pub.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(main).toContain('Version 1');
  expect(main).toContain('Proposed price impact');
  expect(main).toMatch(/GBP|EUR/); // amount carries its currency
  expect(main).toContain('Assumption A');
  expect(main).toContain('Exclusion B');
  expect(main).toContain('Terms C');
  expect(main).not.toContain('PRIVATE-NOTE');
  expect(main, 'internal ids / emails / account data').not.toMatch(
    /@guardscope|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/,
  );
  expect(await pub.title()).toMatch(/Proposal/);
  expect(await pub.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex');
  const storageKeys = await pub.evaluate(() => [
    ...Object.keys(window.localStorage).map((k) => `local:${k}`),
    ...Object.keys(window.sessionStorage).map((k) => `session:${k}`),
  ]);
  const storageShape = await pub.evaluate(() =>
    Object.entries(window.localStorage).map(([k, v]) => [
      k,
      v.length,
      v.replace(/[A-Za-z0-9_-]{20,}/g, '<long>').slice(0, 80),
    ]),
  );
  log5('chunkB-public.jsonl', testInfo, 'storage key names on the valid public page', {
    storageKeys,
    storageShape,
  });
  expect(storageKeys, 'no session or storage for the client').toEqual([]);
  await checkPublicState(pub, testInfo, 'valid');
  expect(errors, 'page errors (public)').toEqual([]);
  log5('chunkB-public.jsonl', testInfo, 'T-03 valid projection text', { len: main.length });
  await ctx.close();
});

test('T-07 public page: invalid / malformed / no-fragment links show the generic page; revoked, superseded, cancelled, decided from the real database', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  // no fragment, malformed, truncated, random well-formed
  const randTok = () =>
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const cases: Record<string, string> = {
    nofragment: '/p',
    short: '/p#abc',
    random: `/p#${randTok()}`,
    trailing: `/p#${randTok()}x`,
    query: `/p?token=${randTok()}`,
  };
  for (const [name, url] of Object.entries(cases)) {
    await openLink(pub, url);
    await expect(pub.getByRole('heading', { name: "This link isn't available" })).toBeVisible();
    if (name === 'random' || name === 'trailing')
      await checkPublicState(pub, testInfo, `invalid-${name}`);
  }
  // revoked
  const rv = await sentWithLink(page, token, uniq4(testInfo, 'p5-revoked'));
  const r = await rpc(page, token, 'revoke_approval_link', { p_version_id: rv.v1Id });
  expect(r.body).toBe(true);
  await openLink(pub, linkUrl(rv.tok));
  await expect(pub.getByRole('heading', { name: 'This link was withdrawn' })).toBeVisible();
  await expect(pub.locator('main')).not.toContainText(/pricing|Acme|P4 Client/i);
  await checkPublicState(pub, testInfo, 'revoked');
  // superseded: send v2
  const sp = await sentWithLink(page, token, uniq4(testInfo, 'p5-superseded'));
  const n = await rpc(page, token, 'new_change_order_version', { p_change_order_id: sp.coId });
  const v2 = n.body as string;
  await rest(page, token, 'PATCH', `/rest/v1/change_order_versions?id=eq.${v2}`, {
    price_impact: 500,
  });
  expect((await rpc(page, token, 'send_change_order_version', { p_version_id: v2 })).status).toBe(
    200,
  );
  await openLink(pub, linkUrl(sp.tok));
  await expect(pub.getByRole('heading', { name: 'A newer version was sent' })).toBeVisible();
  await checkPublicState(pub, testInfo, 'superseded');
  // cancelled
  const cn = await sentWithLink(page, token, uniq4(testInfo, 'p5-cancelled'));
  expect(
    (await rpc(page, token, 'cancel_change_order_version', { p_version_id: cn.v1Id })).status,
  ).toBe(200);
  await openLink(pub, linkUrl(cn.tok));
  await expect(pub.getByRole('heading', { name: 'This proposal was cancelled' })).toBeVisible();
  await checkPublicState(pub, testInfo, 'cancelled');
  // draft revision of a pending version must NOT disable the link (F-1 retest, UI level)
  const dr = await sentWithLink(page, token, uniq4(testInfo, 'p5-draftrev'));
  await rpc(page, token, 'new_change_order_version', { p_change_order_id: dr.coId });
  await openLink(pub, linkUrl(dr.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  await ctx.close();
});

test('T-07 public page: expired and rate_limited wording (server answer simulated at the network layer; real states covered in chunk A)', async ({
  browser,
}, testInfo) => {
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  const fake = (body: unknown) =>
    pub.route('**/rest/v1/rpc/get_public_proposal', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
    );
  const tok = 'A'.repeat(43);
  await fake({ state: 'expired', freelancer_name: 'Pat Freelancer' });
  await openLink(pub, linkUrl(tok));
  await expect(pub.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  await expect(pub.locator('main')).toContainText('Please contact Pat Freelancer.');
  await checkPublicState(pub, testInfo, 'expired');
  await pub.unroute('**/rest/v1/rpc/get_public_proposal');
  await fake({ state: 'rate_limited' });
  await openLink(pub, linkUrl(tok));
  await expect(pub.getByRole('heading', { name: 'Too many attempts' })).toBeVisible();
  await checkPublicState(pub, testInfo, 'rate_limited');
  // HTTP 429 from the gateway is also shown as rate limited, never as a broken link
  await pub.unroute('**/rest/v1/rpc/get_public_proposal');
  await pub.route('**/rest/v1/rpc/get_public_proposal', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: '{"message":"rate"}' }),
  );
  await openLink(pub, linkUrl(tok));
  const t = (await pub.locator('main').innerText()).replace(/\s+/g, ' ');
  log5('chunkB-public.jsonl', testInfo, 'HTTP 429 rendering', t.slice(0, 200));
  await ctx.close();
});

async function decideFlow(
  page: Page,
  browser: Browser,
  sessionA: Record<string, unknown>,
  testInfo: TestInfo,
  which: 'approved' | 'declined' | 'clarification_requested',
  comment: string | null,
) {
  const token = tokenOf(sessionA);
  const f = await sentWithLink(page, token, uniq4(testInfo, `p5-${which}`));
  const { ctx, page: pub, errors } = await publicContext(browser, testInfo);
  await openLink(pub, linkUrl(f.tok));
  const label = {
    approved: 'Approve',
    declined: 'Decline',
    clarification_requested: 'I have a question / need clarification',
  }[which];
  if (comment !== null) await pub.getByLabel('Comment').fill(comment);
  await pub.getByRole('button', { name: label }).click();
  // confirm step: nothing recorded yet
  const group = pub.getByRole('group', { name: 'Please confirm' });
  await expect(group).toBeVisible();
  const confirmText = (await group.innerText()).replace(/\s+/g, ' ');
  if (which === 'approved') expect(confirmText).toContain('Approving is not a payment');
  if (which === 'clarification_requested') expect(confirmText).toMatch(/not an approval/i);
  const before = await rest(
    page,
    token,
    'GET',
    `/rest/v1/client_decisions?select=id&version_id=eq.${f.v1Id}`,
  );
  expect((before.body as unknown[]).length, 'nothing recorded before confirm').toBe(0);
  await pub.getByRole('button', { name: 'Go back' }).click();
  await expect(pub.getByRole('button', { name: label })).toBeVisible();
  await pub.getByRole('button', { name: label }).click();
  await pub.getByRole('button', { name: /^Yes, / }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  const done = (await pub.locator('main').innerText()).replace(/\s+/g, ' ');
  log5('chunkB-decisions.jsonl', testInfo, `client confirmation text (${which})`, done);
  if (which === 'clarification_requested') {
    // F-6 / OD-6 A: the client is told the version is closed and that the sender has been told
    expect(done).toContain('This version is now closed');
    expect(done).toContain('The sender has been told');
  } else {
    expect(done).not.toContain('This version is now closed');
  }
  await checkPublicState(pub, testInfo, `done-${which}`);
  // a freshly opened link shows the recorded response (reload of a recorded decision)
  await openLink(pub, linkUrl(f.tok));
  await expect(pub.getByRole('heading', { name: 'A response was already recorded' })).toBeVisible();
  const decided = (await pub.locator('main').innerText()).replace(/\s+/g, ' ');
  const expectWord = {
    approved: 'Approved',
    declined: 'Declined',
    clarification_requested: 'Asked a question',
  }[which];
  expect(decided).toContain(expectWord);
  if (which === 'clarification_requested') {
    expect(decided).toContain('This version is now closed');
    expect(decided).toContain('The sender has been told');
  }
  expect(decided, 'the comment is never echoed to the public page').not.toContain('Looks fine');
  await expect(pub.getByRole('button', { name: /Approve|Decline/ })).toHaveCount(0);
  await checkPublicState(pub, testInfo, `decided-${which}`);
  // literal reload of the page after the fragment was removed (by design the token is gone)
  await pub.reload();
  const afterReload = (await pub.getByRole('heading').first().innerText()).trim();
  log5(
    'chunkB-decisions.jsonl',
    testInfo,
    `literal reload heading after fragment removal (${which})`,
    afterReload,
  );
  expect(errors, 'page errors (public)').toEqual([]);
  await ctx.close();
  // owner view against the exact version
  await page.goto(`/projects/${f.projectId}/changes/${f.coId}`);
  const card = page.getByRole('article', { name: 'Version 1', exact: true });
  await expect(card).toBeVisible();
  const owner = (await card.innerText()).replace(/\s+/g, ' ');
  const ownerWord = {
    approved: 'Client approved',
    declined: 'Client declined',
    clarification_requested: 'Client asked for clarification',
  }[which];
  expect(owner).toContain(ownerWord);
  if (comment) expect(owner).toContain(comment.slice(0, 40));
  else expect(owner).toContain('No comment.');
  if (which === 'clarification_requested') {
    expect(owner).toContain('Not an approval');
    expect(owner).not.toMatch(/Client approved/);
  } else expect(owner).not.toContain('Not an approval');
  expect(owner).not.toMatch(FORBIDDEN_WORDING);
  expect(owner).not.toMatch(MONEY_CLAIMS);
  log5('chunkB-decisions.jsonl', testInfo, `owner card text (${which})`, owner.slice(0, 600));
  // no link controls remain on a decided version
  await expect(
    card.getByRole('button', { name: /Issue a new link|Create a link|Revoke link/ }),
  ).toHaveCount(0);
  await shot5(page, testInfo, `owner-decided-${which}`);
  return f;
}

test('T-05 approve with a comment: confirm step, record, public decided page, owner view, history event', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const f = await decideFlow(
    page,
    browser,
    sessionA,
    testInfo,
    'approved',
    'Looks fine to me, thanks',
  );
  const ev = await rest(
    page,
    tokenOf(sessionA),
    'GET',
    `/rest/v1/activity_events?select=event_type,summary,metadata,actor_type&entity_id=eq.${f.coId}&actor_type=eq.client`,
  );
  const rows = ev.body as { event_type: string; summary: string; metadata: unknown }[];
  expect(rows.length).toBe(1);
  expect(rows[0].event_type).toBe('change_order.approved');
  expect(JSON.stringify(rows[0])).not.toContain('Looks fine');
});

test('T-05 decline without a comment', async ({ page, browser, sessionA }, testInfo) => {
  await decideFlow(page, browser, sessionA, testInfo, 'declined', null);
});

test('T-05 request clarification (terminal for that version, not an approval)', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const f = await decideFlow(
    page,
    browser,
    sessionA,
    testInfo,
    'clarification_requested',
    'Does this include hosting?',
  );
  // OD-6 A: the version is terminal; the freelancer replies outside the app and sends a NEW version
  const vs = await apiVersions(page, tokenOf(sessionA), f.coId);
  expect(vs[0].status).toBe('clarification_requested');
  await page.goto(`/projects/${f.projectId}/changes/${f.coId}`);
  const panel = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  log5(
    'chunkB-decisions.jsonl',
    testInfo,
    'owner page text after clarification (for OD-6 wording review)',
    panel.slice(0, 900),
  );
});

test('T-05/AC-6 comment limits and long text: 2000 accepted, 2001 blocked client-side, long unbroken text wraps (no overflow)', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const longWord = 'W'.repeat(180);
  const f = await sentWithLink(page, token, uniq4(testInfo, 'p5-long'), {
    description: `${longWord} ${'long '.repeat(300)}`,
    assumptions: longWord + longWord,
  });
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  await openLink(pub, linkUrl(f.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  await noOverflow5(pub);
  await pub.getByLabel('Comment').fill('x'.repeat(2001));
  await pub.getByRole('button', { name: 'Approve' }).click();
  await expect(pub.getByText('Use 2000 characters or fewer.').first()).toBeVisible();
  await expect(pub.getByRole('group', { name: 'Please confirm' })).toHaveCount(0);
  const v = (await axe5(pub, testInfo, 'public-comment-error')).filter(
    (x) => x.impact === 'serious' || x.impact === 'critical',
  );
  expect(v).toEqual([]);
  await shot5(pub, testInfo, 'public-comment-2001');
  const none = await rest(
    page,
    token,
    'GET',
    `/rest/v1/client_decisions?select=id&version_id=eq.${f.v1Id}`,
  );
  expect((none.body as unknown[]).length).toBe(0);
  await pub.getByLabel('Comment').fill('é'.repeat(2000));
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  const row = await rest(
    page,
    token,
    'GET',
    `/rest/v1/client_decisions?select=comment&version_id=eq.${f.v1Id}`,
  );
  expect(((row.body as { comment: string }[])[0].comment ?? '').length).toBe(2000);
  await ctx.close();
  // owner view: 2000-char comment and long text do not overflow
  await page.goto(`/projects/${f.projectId}/changes/${f.coId}`);
  await expect(page.getByRole('article', { name: 'Version 1', exact: true })).toContainText(
    'Client approved',
  );
  await noOverflow5(page);
  await shot5(page, testInfo, 'owner-long-comment');
});

test('T-05/AC-6 HTML in a comment is shown as text on the owner page (BR-8)', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const f = await sentWithLink(page, token, uniq4(testInfo, 'p5-xss'));
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  await openLink(pub, linkUrl(f.tok));
  await pub
    .getByLabel('Comment')
    .fill('<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> <b>bold</b>');
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  await ctx.close();
  await page.goto(`/projects/${f.projectId}/changes/${f.coId}`);
  const quote = page.locator('blockquote');
  await expect(quote).toContainText('<script>window.__xss=2</script>');
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  expect(await quote.locator('b, img, script').count()).toBe(0);
});

test('T-06/AC-6 retry after a network failure reuses the idempotency key (one decision); double click records once; offline disables actions', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const f = await sentWithLink(page, token, uniq4(testInfo, 'p5-retry'));
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  const keys: string[] = [];
  let first = true;
  await pub.route('**/rest/v1/rpc/submit_public_decision', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { p_idempotency_key: string };
    keys.push(body.p_idempotency_key);
    if (first) {
      first = false;
      return route.abort('connectionreset');
    }
    return route.continue();
  });
  await openLink(pub, linkUrl(f.tok));
  await pub.getByLabel('Comment').fill('retry me');
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByText(/couldn't reach the server/i)).toBeVisible();
  await expect(pub.getByRole('button', { name: 'Yes, approve' })).toBeEnabled();
  await pub.getByRole('button', { name: 'Yes, approve' }).dblclick();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  expect(keys.length, 'one failed + at least one retry').toBeGreaterThanOrEqual(2);
  expect(new Set(keys).size, 'the retry reuses the same idempotency key').toBe(1);
  const rows = await rest(
    page,
    token,
    'GET',
    `/rest/v1/client_decisions?select=id&version_id=eq.${f.v1Id}`,
  );
  expect((rows.body as unknown[]).length, 'exactly one decision').toBe(1);
  await ctx.close();
  // offline: actions disabled, banner shown; coming back enables them
  const f2 = await sentWithLink(page, token, uniq4(testInfo, 'p5-offline'));
  const o = await publicContext(browser, testInfo);
  await openLink(o.page, linkUrl(f2.tok));
  await expect(o.page.getByRole('button', { name: 'Approve' })).toBeEnabled();
  await o.ctx.setOffline(true);
  await expect(o.page.getByText(/You're offline/)).toBeVisible();
  await expect(o.page.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await shot5(o.page, testInfo, 'public-offline');
  await o.ctx.setOffline(false);
  await expect(o.page.getByRole('button', { name: 'Approve' })).toBeEnabled();
  await o.ctx.close();
});

test('T-04/AC-4 token leak audit: address bar, history, referrer, request URLs/headers, storage, caches, console, DOM', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const f = await sentWithLink(page, token, uniq4(testInfo, 'p5-leak'));
  const tok = f.tok;
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  const reqs: { method: string; url: string; headers: string; post: string }[] = [];
  const consoleText: string[] = [];
  pub.on('console', (m) => consoleText.push(m.text()));
  pub.on('request', (r) =>
    reqs.push({
      method: r.method(),
      url: r.url(),
      headers: JSON.stringify(r.headers()),
      post: r.postData() ?? '',
    }),
  );
  // arrive from another page so a Referer would exist if the policy were wrong
  await pub.goto('/auth/sign-in').catch(() => undefined);
  await openLink(pub, linkUrl(tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  const leaks: string[] = [];
  const check = (where: string, hay: string) => {
    if (hay.includes(tok)) leaks.push(where);
  };
  check('address bar', pub.url());
  for (const r of reqs) {
    check(`request URL ${r.method}`, r.url);
    check('request headers (incl. Referer)', r.headers);
  }
  const rpcReqs = reqs.filter((r) => /\/rest\/v1\/rpc\//.test(r.url));
  const nonPostBody = reqs.filter(
    (r) =>
      r.post.includes(tok) &&
      !(r.method === 'POST' && /get_public_proposal|submit_public_decision/.test(r.url)),
  );
  expect(nonPostBody.length, 'token in a request body other than the two public RPC POSTs').toBe(0);
  expect(
    rpcReqs.some((r) => r.method === 'GET'),
    'RPC must be POST',
  ).toBe(false);
  expect(
    rpcReqs.filter((r) => r.post.includes(tok)).length,
    'token travels in the POST body of the lookup',
  ).toBeGreaterThanOrEqual(1);
  const dump = await pub.evaluate(async () => {
    const ls = JSON.stringify(Object.entries(localStorage));
    const ss = JSON.stringify(Object.entries(sessionStorage));
    let idb = '[]';
    try {
      idb = JSON.stringify((await indexedDB.databases?.()) ?? []);
    } catch {
      /* ignore */
    }
    const cacheEntries: string[] = [];
    try {
      for (const k of await caches.keys())
        for (const req of await (await caches.open(k)).keys()) cacheEntries.push(req.url);
    } catch {
      /* ignore */
    }
    const nav =
      (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
        ?.name ?? '';
    return {
      ls,
      ss,
      idb,
      cacheEntries: JSON.stringify(cacheEntries),
      referrer: document.referrer,
      title: document.title,
      html: document.documentElement.outerHTML,
      href: location.href,
      hash: location.hash,
      resources: JSON.stringify(performance.getEntriesByType('resource').map((e) => e.name)),
      navEntry: nav,
      historyLen: history.length,
      historyState: JSON.stringify(history.state),
    };
  });
  check('localStorage', dump.ls);
  check('sessionStorage', dump.ss);
  check('indexedDB names', dump.idb);
  check('Cache Storage URLs', dump.cacheEntries);
  check('document.referrer', dump.referrer);
  check('document.title', dump.title);
  check('DOM (outerHTML)', dump.html);
  check('history.state', dump.historyState);
  check('resource timing entries', dump.resources);
  check('console', consoleText.join('\n'));
  expect(dump.hash).toBe('');
  const navLeak = dump.navEntry.includes(tok);
  log5('chunkB-token-leak.jsonl', testInfo, 'leak audit', {
    leaks,
    requests: reqs.length,
    rpcPosts: rpcReqs.length,
    referrerEmpty: dump.referrer === '',
    historyLength: dump.historyLen,
    navigationTimingEntryContainsToken: navLeak,
    cacheEntryCount: JSON.parse(dump.cacheEntries).length,
  });
  expect(leaks, 'token found in').toEqual([]);
  // the navigation timing entry is same-origin script readable only; recorded as an observation (see report)
  // After a decision the token is still absent everywhere, incl. the submit request URL
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  const submit = reqs.filter((r) => /submit_public_decision/.test(r.url));
  expect(submit.length).toBeGreaterThanOrEqual(1);
  for (const r of submit) {
    expect(r.method).toBe('POST');
    expect(r.url.includes(tok), 'token in submit URL').toBe(false);
    expect(r.headers.includes(tok), 'token in submit headers').toBe(false);
  }
  expect(consoleText.join('\n').includes(tok), 'token in console after submit').toBe(false);
  // history navigation back does not reveal a fragment
  await pub.goBack().catch(() => undefined);
  expect(pub.url().includes(tok), 'token in URL after back').toBe(false);
  await ctx.close();
});

test('T-04 static response headers and PWA caching config (deployment-level; not served by vite preview)', async ({
  browserName,
}, testInfo) => {
  const headers = readFileSync('public/_headers', 'utf8');
  const dist = readFileSync('dist/_headers', 'utf8');
  expect(dist).toBe(headers);
  expect(headers).toMatch(/Referrer-Policy: no-referrer/);
  expect(headers).toMatch(/Content-Security-Policy:.*default-src 'self'/);
  expect(headers).toMatch(/script-src 'self'(;|$)/);
  expect(headers, 'no third-party script/style hosts').not.toMatch(/script-src[^;]*https?:/);
  expect(headers).toMatch(/frame-ancestors 'none'/);
  const pBlock = headers.split(/\n\s*\n/).find((b) => /^\/p\s*$/m.test(b)) ?? '';
  expect(pBlock, '/p has X-Robots-Tag noindex').toMatch(/X-Robots-Tag:\s*noindex/i);
  expect(pBlock, '/p has Cache-Control no-store').toMatch(/Cache-Control:\s*no-store/i);
  const pStar = headers.split(/\n\s*\n/).find((b) => /^\/p\/\*\s*$/m.test(b)) ?? '';
  expect(pStar, '/p/* has the same headers').toMatch(/no-store/i);
  const hasNoStore = /Cache-Control:.*no-store/i.test(headers);
  const hasRobotsHeader = /X-Robots-Tag/i.test(headers);
  const sw = readFileSync('dist/sw.js', 'utf8');
  expect(sw).toMatch(/NetworkOnly/);
  expect(sw).toMatch(/supabase\.co/);
  log5('chunkB-token-leak.jsonl', testInfo, 'static headers', {
    hasNoStoreForP: hasNoStore,
    hasRobotsHeader,
    referrerPolicyHeader: true,
    csp: true,
    swNetworkOnlySupabase: true,
    browserName,
  });
});

test('AC-12/T-12 PWA: /p never serves a cached decision (service worker active, offline reopen shows a retry page, no Supabase data in Cache Storage)', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const f = await sentWithLink(page, token, uniq4(testInfo, 'p5-pwa'));
  const { ctx, page: pub } = await publicContext(browser, testInfo, { serviceWorkers: 'allow' });
  await openLink(pub, linkUrl(f.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  const swReady = await pub.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 8000)),
    ]);
    return reg ? 'active' : 'timeout';
  });
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  const cached = await pub.evaluate(async () => {
    const urls: string[] = [];
    for (const k of await caches.keys())
      for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  expect(
    cached.filter((u) => /supabase\.co/.test(u)),
    'no Supabase response cached',
  ).toEqual([]);
  expect(cached.some((u) => u.includes(f.tok))).toBe(false);
  await ctx.setOffline(true);
  await openLink(pub, linkUrl(f.tok)).catch(() => undefined);
  const t = (
    await pub
      .locator('body')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ');
  log5('chunkB-public.jsonl', testInfo, 'PWA offline reopen of a decided link', {
    swReady,
    text: t.slice(0, 300),
  });
  expect(t, 'must not show the recorded decision or proposal from cache').not.toMatch(
    /Approved|already recorded|Proposed price impact/,
  );
  await shot5(pub, testInfo, 'public-pwa-offline');
  await ctx.setOffline(false);
  await ctx.close();
});

test('T-08/AC-1/AC-8 owner UI: link shown once (copy, expiry, once-only warning), reissue revokes the old link, revoke, status text', async ({
  page,
  browser,
  sessionA,
  context,
}, testInfo) => {
  const token = tokenOf(sessionA);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP_ORIGIN });
  const { projectId, coId } = await apiSendableCO(page, token, uniq4(testInfo, 'p5-owner'));
  await page.goto(`/projects/${projectId}/changes/${coId}`);
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  // dead-link regression: send through the real UI
  await page.getByRole('button', { name: 'Send version 1…' }).click();
  const confirm = page.getByRole('group', { name: 'Send version 1?' });
  await expect(confirm).toContainText('expires after 30 days');
  await page.getByRole('button', { name: 'Yes, send version 1' }).click();
  await expect(page.getByText('Version 1 sent. Its content is now fixed.')).toBeVisible();
  const box = page.getByRole('group', { name: 'Link for version 1' });
  await expect(box).toBeVisible();
  const url = await box.getByLabel('Share this link with your client').inputValue();
  const m = url.match(/^(https?:\/\/[^/]+)\/p#([A-Za-z0-9_-]{43})$/);
  expect(m, 'link shape origin/p#<43 chars>').not.toBeNull();
  const tok1 = m![2];
  expect(url.includes('?'), 'no query string in the link').toBe(false);
  await expect(box).toContainText('shown only once');
  await expect(box).toContainText(/Expires /);
  await expect(page.getByText(/Client link: Active until/)).toBeVisible();
  // clipboard
  await box.getByRole('button', { name: 'Copy link' }).click();
  await expect(box.getByRole('status')).toContainText('Link copied.');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip === url, 'clipboard equals the displayed link').toBe(true);
  await shot5(page, testInfo, 'owner-link-issued');
  const issuedText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(issuedText).not.toMatch(FORBIDDEN_WORDING);
  expect(issuedText).not.toMatch(MONEY_CLAIMS);
  // refresh: the link is gone for good, only status remains
  await page.reload();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  const afterReload = await page.locator('main').innerText();
  expect(afterReload.includes(tok1), 'raw token visible after reload').toBe(false);
  expect(afterReload).not.toMatch(/\/p#/);
  await expect(page.getByText(/Client link: Active until/)).toBeVisible();
  const history = await rest(
    page,
    token,
    'GET',
    `/rest/v1/activity_events?select=summary,metadata&entity_id=eq.${coId}`,
  );
  expect(JSON.stringify(history.body).includes(tok1), 'token in history events').toBe(false);
  // client can open it
  const a = await publicContext(browser, testInfo);
  await openLink(a.page, `/p#${tok1}`);
  await expect(a.page.getByRole('heading', { name: 'Your response' })).toBeVisible();
  // reissue (confirm step, then old link stops working)
  await page.getByRole('button', { name: 'Issue a new link' }).click();
  await expect(
    page.getByRole('group', { name: /Issue a new link\? The previous link will stop working/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep the current link' }).click();
  await expect(page.getByRole('group', { name: 'Link for version 1' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Issue a new link' }).click();
  await page.getByRole('button', { name: 'Yes, issue a new link' }).click();
  const box2 = page.getByRole('group', { name: 'Link for version 1' });
  await expect(box2).toBeVisible();
  const url2 = await box2.getByLabel('Share this link with your client').inputValue();
  const tok2 = url2.split('#')[1];
  expect(tok2 === tok1).toBe(false);
  await openLink(a.page, `/p#${tok1}`);
  await expect(a.page.getByRole('heading', { name: 'This link was withdrawn' })).toBeVisible();
  await openLink(a.page, `/p#${tok2}`);
  await expect(a.page.getByRole('heading', { name: 'Your response' })).toBeVisible();
  // revoke
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await expect(
    page.getByText('Revoke the link? Your client will no longer be able to open it.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Yes, revoke it' }).click();
  await expect(page.getByText(/Client link: Revoked/)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Link for version 1' })).toHaveCount(0);
  await openLink(a.page, `/p#${tok2}`);
  await expect(a.page.getByRole('heading', { name: 'This link was withdrawn' })).toBeVisible();
  // create again after revoke, then cancel the proposal: link revoked atomically
  // after a revoke the action is labelled "Issue a new link" ("Create a link" is only for a version with no link yet)
  await page.getByRole('button', { name: 'Issue a new link' }).click();
  await page.getByRole('button', { name: 'Yes, issue a new link' }).click();
  const box3 = page.getByRole('group', { name: 'Link for version 1' });
  const tok3 = (await box3.getByLabel('Share this link with your client').inputValue()).split(
    '#',
  )[1];
  await page.getByRole('button', { name: 'Cancel this proposal…' }).click();
  await page.getByRole('button', { name: /^Yes, cancel/ }).click();
  // wait until the cancel has really completed (notice + badge + no link controls) before the client opens the link
  await expect(page.getByText('Version 1 cancelled.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Version 1', exact: true })).toContainText(
    'Cancelled',
  );
  expect(
    (await apiVersions(page, token, coId))[0].status,
    'version is cancelled in the database',
  ).toBe('cancelled');
  await openLink(a.page, `/p#${tok3}`);
  await expect(a.page.getByRole('heading', { name: 'This proposal was cancelled' })).toBeVisible();
  await a.ctx.close();
});

test('T-08 owner UI at a glance: pending card has real link actions only when active; completed project hides issue', async ({
  page,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const f = await sentWithLink(page, token, uniq4(testInfo, 'p5-completed'));
  await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${f.projectId}`, {
    status: 'completed',
  });
  await page.goto(`/projects/${f.projectId}/changes/${f.coId}`);
  await expect(
    page.getByText('New links can only be issued while the project is active.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Issue a new link|Create a link/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Revoke link' })).toBeVisible();
  await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${f.projectId}`, { status: 'active' });
});

test('F-5 AC-4: opening a second link in the same tab (hash-only navigation) shows the NEW proposal and removes its token from the address bar', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const one = await sentWithLink(page, token, uniq4(testInfo, 'p5-hash-one'));
  const two = await sentWithLink(page, token, uniq4(testInfo, 'p5-hash-two'));
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  await pub.goto(linkUrl(one.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  expect(new URL(pub.url()).hash).toBe('');
  // the client pastes the second link into the SAME tab: only the fragment differs, so the browser does not reload
  await pub.goto(linkUrl(two.tok));
  await pub.waitForTimeout(1500);
  const urlHasToken = pub.url().includes(two.tok);
  const text = (await pub.locator('main').innerText()).replace(/\s+/g, ' ');
  const showsSecond = text.includes('p5-hash-two');
  log5('chunkB-public.jsonl', testInfo, 'F-5 same-tab hash navigation', {
    urlHasToken,
    showsSecond,
    showsFirst: text.includes('p5-hash-one'),
  });
  expect(urlHasToken, 'second link token left in the address bar / history').toBe(false);
  expect(showsSecond, 'the page must show the second proposal').toBe(true);
  await ctx.close();
});

test('AC-12/T-12 owner UI a11y and overflow: link just issued, link status, decided version with a long comment', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const { projectId, coId } = await apiSendableCO(page, token, uniq4(testInfo, 'p5-owner-a11y'));
  await page.goto(`/projects/${projectId}/changes/${coId}`);
  await page.getByRole('button', { name: 'Send version 1…' }).click();
  await page.getByRole('button', { name: 'Yes, send version 1' }).click();
  const box = page.getByRole('group', { name: 'Link for version 1' });
  await expect(box).toBeVisible();
  const tok = (await box.getByLabel('Share this link with your client').inputValue()).split('#')[1];
  for (const [name, setup] of [
    ['owner-link-issued', async () => undefined],
    [
      'owner-issue-confirm',
      async () => page.getByRole('button', { name: 'Issue a new link' }).click(),
    ],
  ] as const) {
    await setup();
    await noOverflow5(page);
    const bad = (await axe5(page, testInfo, name)).filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(bad, `axe serious/critical on ${name}`).toEqual([]);
    await shot5(page, testInfo, name);
  }
  await page.getByRole('button', { name: 'Keep the current link' }).click();
  // client answers with a long comment; owner page after
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  await openLink(pub, linkUrl(tok));
  await pub.getByLabel('Comment').fill(('word ' + 'W'.repeat(120) + ' ').repeat(15));
  await pub.getByRole('button', { name: 'I have a question / need clarification' }).click();
  await pub.getByRole('button', { name: 'Yes, send my question' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  await ctx.close();
  await page.reload();
  await expect(page.getByText('Client asked for clarification').first()).toBeVisible();
  await noOverflow5(page);
  const bad2 = (await axe5(page, testInfo, 'owner-decided-clarification')).filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad2).toEqual([]);
});

test('F-5 retest AC-4: stale-then-valid in the same tab, and hash change while a decision is shown', async ({
  page,
  browser,
  sessionA,
}, testInfo) => {
  const token = tokenOf(sessionA);
  const good = await sentWithLink(page, token, uniq4(testInfo, 'p5-hash-good'));
  const other = await sentWithLink(page, token, uniq4(testInfo, 'p5-hash-other'));
  const { ctx, page: pub } = await publicContext(browser, testInfo);
  // 1. stale/invalid link first, then the real one pasted into the same tab
  await pub.goto('/p#' + 'Z'.repeat(43));
  await expect(pub.getByRole('heading', { name: "This link isn't available" })).toBeVisible();
  await pub.goto(linkUrl(good.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  await expect(pub.getByRole('heading', { name: "This link isn't available" })).toHaveCount(0);
  expect(pub.url().includes(good.tok), 'token removed from the address bar').toBe(false);
  expect(new URL(pub.url()).hash).toBe('');
  expect((await pub.locator('main').innerText()).includes('p5-hash-good')).toBe(true);
  // 2. a decision is on screen, then another link replaces it: old state (confirmation / decision) is dropped
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  await pub.goto(linkUrl(other.tok));
  await expect(pub.getByRole('heading', { name: 'Your response' })).toBeVisible();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toHaveCount(
    0,
  );
  const t = (await pub.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(
    t.includes('p5-hash-other') && !t.includes('p5-hash-good'),
    'old proposal dropped, new one shown',
  ).toBe(true);
  expect(pub.url().includes(other.tok)).toBe(false);
  // no token anywhere after the second capture
  const dump = await pub.evaluate(() =>
    JSON.stringify([
      location.href,
      history.state,
      document.referrer,
      document.title,
      Object.entries(localStorage),
      Object.entries(sessionStorage),
    ]),
  );
  expect(dump.includes(other.tok) || dump.includes(good.tok), 'token present in page state').toBe(
    false,
  );
  // the first link's decision is untouched, the second link still undecided
  const rows = await rest(
    page,
    token,
    'GET',
    `/rest/v1/client_decisions?select=version_id&version_id=in.(${good.v1Id},${other.v1Id})`,
  );
  expect((rows.body as { version_id: string }[]).map((r) => r.version_id)).toEqual([good.v1Id]);
  await ctx.close();
});
