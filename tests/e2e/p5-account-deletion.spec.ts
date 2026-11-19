import { mkdirSync, appendFileSync } from 'node:fs';
import {
  test,
  expect,
  isMobile,
  signInViaUi,
  APP_ORIGIN,
  SUPABASE_KEY,
  SUPABASE_URL,
} from './helpers';
import { rest } from './p2-helpers';
import { apiSendableCO, rpc } from './p4-helpers';

/**
 * Phase 5 Tester, final retest: AC-13 / T-13 account deletion through the UI for an account that owns Phase 5 data
 * (sent version with a link, a client decision WITH a comment, a second pending link, throttle rows from the same
 * browser). Uses a THROWAWAY confirmed user created by SQL before the run (never a@ / b@), exactly as Phase 2 did.
 * Credentials come only from the shell: P5_THROWAWAY_EMAIL / P5_THROWAWAY_PW. Raw link tokens stay in memory.
 * Row counts after deletion are checked separately with SQL (docs/testing/phase5/final-retest-deletion.txt).
 */
const email = process.env.P5_THROWAWAY_EMAIL ?? '';
const password = process.env.P5_THROWAWAY_PW ?? '';
const OUT = 'docs/testing/phase5';

test('AC-13 delete an account that owns Phase 5 data through the UI; links, decisions and comments are gone', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'one throwaway account; desktop only');
  test.skip(!email || !password, 'P5_THROWAWAY_EMAIL / P5_THROWAWAY_PW not set');
  test.setTimeout(120_000);

  await page.goto('/sign-in');
  await signInViaUi(page, { email, password });
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  const { token, uid } = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    return { token: s.access_token as string, uid: s.user.id as string };
  });
  expect(
    (
      await rest(page, token, 'PATCH', `/rest/v1/profiles?id=eq.${uid}`, {
        display_name: 'Throwaway P5',
      })
    ).status,
  ).toBe(200);

  // proposal 1: sent, link issued, client decides WITH a comment
  const one = await apiSendableCO(page, token, 'P5T deletion decided');
  expect(
    (await rpc(page, token, 'send_change_order_version', { p_version_id: one.v1Id })).status,
  ).toBe(200);
  const i1 = await rpc(page, token, 'issue_approval_link', { p_version_id: one.v1Id });
  const tok1 = (i1.body as { token: string }).token;
  // proposal 2: sent, link issued, still pending
  const two = await apiSendableCO(page, token, 'P5T deletion pending');
  expect(
    (await rpc(page, token, 'send_change_order_version', { p_version_id: two.v1Id })).status,
  ).toBe(200);
  const i2 = await rpc(page, token, 'issue_approval_link', { p_version_id: two.v1Id });
  const tok2 = (i2.body as { token: string }).token;

  // client side, no session: decide with a comment, and produce throttle rows with a few failed lookups
  const ctx = await browser.newContext({
    baseURL: APP_ORIGIN,
    storageState: { cookies: [], origins: [] },
  });
  const pub = await ctx.newPage();
  await pub.goto(`/p#${tok1}`);
  await pub.getByLabel('Comment').fill('Deletion check comment: please remove me with the account');
  await pub.getByRole('button', { name: 'Approve' }).click();
  await pub.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(pub.getByRole('heading', { name: 'Your response has been recorded' })).toBeVisible();
  const fails = await pub.evaluate(
    async ({ url, key }) => {
      const out: string[] = [];
      for (let i = 0; i < 3; i++) {
        const t = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
          .replace(/=+$/, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
        const r = await fetch(`${url}/rest/v1/rpc/get_public_proposal`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_token: t }),
        });
        out.push(((await r.json()) as { state: string }).state);
      }
      return out;
    },
    { url: SUPABASE_URL, key: SUPABASE_KEY },
  );
  expect(fails.every((s) => s === 'invalid' || s === 'rate_limited')).toBe(true);

  // owner sees the decision and the comment before deletion
  const dec = await rest(
    page,
    token,
    'GET',
    `/rest/v1/client_decisions?select=decision,comment&version_id=eq.${one.v1Id}`,
  );
  expect(dec.body).toEqual([
    { decision: 'approved', comment: 'Deletion check comment: please remove me with the account' },
  ]);
  const links = await rest(
    page,
    token,
    'GET',
    `/rest/v1/approval_links?select=id&version_id=in.(${one.v1Id},${two.v1Id})`,
  );
  expect((links.body as unknown[]).length).toBe(2);
  mkdirSync(OUT, { recursive: true });
  appendFileSync(
    `${OUT}/final-retest-deletion.txt`,
    `${JSON.stringify({ uid, projects: [one.projectId, two.projectId], cos: [one.coId, two.coId], versions: [one.v1Id, two.v1Id], throttleCalls: fails })}\n`,
  );

  // delete through the UI
  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'Delete account' });
  await section.getByRole('button', { name: 'Delete my account…' }).click();
  await section.getByLabel('Your password').fill(password);
  await section.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText('Your account and all its data have been deleted.')).toBeVisible();

  // the old access token reads nothing any more
  for (const path of [
    '/rest/v1/client_decisions?select=id',
    '/rest/v1/approval_links?select=id',
    '/rest/v1/projects?select=id',
  ]) {
    const r = await rest(page, token, 'GET', path);
    expect(
      r.status === 401 || r.status === 403 || (Array.isArray(r.body) && r.body.length === 0),
      `old token ${path}`,
    ).toBe(true);
  }
  // both client links are now unknown
  for (const t of [tok1, tok2]) {
    await pub.goto('about:blank');
    await pub.goto(`/p#${t}`);
    await expect(pub.getByRole('heading', { name: "This link isn't available" })).toBeVisible();
  }
  await ctx.close();
});
