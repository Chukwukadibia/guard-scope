import { test, expect, isMobile, signInViaUi, GENERIC_CREDENTIALS } from './helpers';
import { apiAddItem, apiCreateProject, apiDraftId, rest, shot } from './p2-helpers';

/**
 * Phase 2 Tester — T-10 / AC-10 account deletion. Uses a THROWAWAY confirmed user created by SQL before
 * the run (never a@ / b@). Credentials come only from the shell: P2_THROWAWAY_EMAIL / P2_THROWAWAY_PW.
 * Row counts after deletion are checked separately with SQL (see ACCEPTANCE_REPORT).
 */
const email = process.env.P2_THROWAWAY_EMAIL ?? '';
const password = process.env.P2_THROWAWAY_PW ?? '';

test('T-10 delete account: empty and wrong password blocked; correct deletes, signs out, cannot sign in', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'one throwaway account; desktop only');
  test.skip(!email || !password, 'P2_THROWAWAY_EMAIL / P2_THROWAWAY_PW not set');
  test.setTimeout(90_000);

  await page.goto('/sign-in');
  await signInViaUi(page, { email, password });
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // seed data: one project with confirmed baseline + a second project
  const token = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'))!;
    return JSON.parse(localStorage.getItem(k)!).access_token as string;
  });
  const pid = await apiCreateProject(page, token, { title: 'P2T deletion project', client_name: 'C', currency: 'EUR', agreed_price: 99 });
  const v1 = await apiDraftId(page, token, pid);
  await apiAddItem(page, token, v1, 'deliverable', 'To be deleted');
  await apiAddItem(page, token, v1, 'exclusion', 'Also deleted');
  expect((await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status).toBe(200);
  await apiCreateProject(page, token, { title: 'P2T deletion project 2', client_name: 'C', currency: 'USD' });
  const uid = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'))!;
    return JSON.parse(localStorage.getItem(k)!).user.id as string;
  });
  expect((await rest(page, token, 'PATCH', `/rest/v1/profiles?id=eq.${uid}`, { display_name: 'Throwaway', default_currency: 'EUR' })).status).toBe(200);
  console.log(`throwaway user id: ${uid}, project: ${pid}`);

  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'Delete account' });
  await expect(section.getByText(/permanently deletes your account, profile, projects and recorded scope/)).toBeVisible();
  await expect(section.getByText(/can't\s+be undone/)).toBeVisible();
  await section.getByRole('button', { name: 'Delete my account…' }).click();

  // empty password
  await section.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'Enter your password to confirm.' })).toBeVisible();

  // wrong password: blocked, nothing deleted, user still signed in
  let rpcCalls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/rpc/delete_my_account')) rpcCalls++;
  });
  await section.getByLabel('Your password').fill(`${password}-wrong`);
  await section.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(section.getByText('That password is incorrect.')).toBeVisible();
  expect(rpcCalls).toBe(0);
  await shot(page, testInfo, 'T10-wrong-password');
  const still = await rest(page, token, 'GET', `/rest/v1/projects?select=id`);
  expect((still.body as unknown[]).length).toBe(2);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible(); // still signed in

  // correct password
  const sec2 = page.getByRole('region', { name: 'Delete account' });
  await sec2.getByRole('button', { name: 'Delete my account…' }).click();
  await sec2.getByLabel('Your password').fill(password);
  await sec2.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText('Your account and all its data have been deleted.')).toBeVisible();
  expect(rpcCalls).toBe(1);
  await shot(page, testInfo, 'T10-deleted');

  // signed out: protected page redirects
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/sign-in\?next=/);

  // cannot sign in again
  await signInViaUi(page, { email, password });
  await expect(page.getByText(GENERIC_CREDENTIALS)).toBeVisible();
  await shot(page, testInfo, 'T10-cannot-sign-in');

  // old token no longer reads anything
  const after = await rest(page, token, 'GET', `/rest/v1/projects?select=id`);
  console.log(`old token after deletion: HTTP ${after.status} ${JSON.stringify(after.body).slice(0, 120)}`);
  expect(after.status === 401 || (Array.isArray(after.body) && after.body.length === 0)).toBe(true);
});
