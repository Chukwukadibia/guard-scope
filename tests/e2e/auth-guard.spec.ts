import {
  test,
  expect,
  USER_A,
  STORAGE_KEY,
  SESSION_ENDED,
  signInViaUi,
  mainNav,
  isMobile,
  screenshot,
} from './helpers';

/** Records whether any protected UI ever entered the DOM (AC-3: no flash of protected content). */
const watchProtectedDom = () => {
  (window as unknown as { __protectedSeen: string[] }).__protectedSeen = [];
  const check = () => {
    const seen = (window as unknown as { __protectedSeen: string[] }).__protectedSeen;
    if (document.querySelector('nav[aria-label="Main"]')) seen.push('nav');
    for (const h of Array.from(document.querySelectorAll('h1'))) {
      if (['Dashboard', 'Projects', 'Settings'].includes(h.textContent ?? '')) seen.push(h.textContent!);
    }
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
};

test.describe('T-04 / AC-3 route guard', () => {
  for (const path of ['/', '/projects', '/settings']) {
    test(`signed out, ${path} redirects to /sign-in?next=… with no protected DOM`, async ({ page }) => {
      await page.addInitScript(watchProtectedDom);
      await page.goto(path);
      await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(path)}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      const seen = await page.evaluate(() => (window as unknown as { __protectedSeen: string[] }).__protectedSeen);
      expect(seen).toEqual([]);
    });
  }

  test('T-04: after sign-in the user reaches next=/projects', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'one real sign-in is enough; keeps auth rate limits low');
    await page.goto('/projects');
    await expect(page).toHaveURL('/sign-in?next=%2Fprojects');
    await signInViaUi(page, USER_A);
    await expect(page).toHaveURL('/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  });

  test('AC-3: off-site next (//evil.example) is ignored after sign-in', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'desktop only; keeps auth rate limits low');
    await page.goto('/sign-in?next=%2F%2Fevil.example%2Fsteal');
    await signInViaUi(page, USER_A);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    expect(new URL(page.url()).origin).toBe('http://localhost:4173');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});

test.describe('T-03 / AC-2 sign out', () => {
  test('sign out, then /settings redirects to /sign-in', async ({ page }, testInfo) => {
    await page.goto('/sign-in');
    await signInViaUi(page, USER_A);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const nav = await mainNav(page, isMobile(testInfo));
    await nav.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText("You've signed out.")).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    await screenshot(page, testInfo, 'T03-signed-out');
    await page.goto('/settings');
    await expect(page).toHaveURL('/sign-in?next=%2Fsettings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toHaveCount(0);
  });
});

test.describe('T-06 / AC-4 invalid or expired session', () => {
  test.use({ signedInAs: 'A' });

  test('tampered access token → sign-in with "session has ended"', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k)!);
      const [h, p, sig] = s.access_token.split('.');
      s.access_token = `${h}.${p}.${sig.slice(0, -6)}AAAAAA`;
      localStorage.setItem(k, JSON.stringify(s));
    }, STORAGE_KEY);
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
    await expect(page.getByText(SESSION_ENDED)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toHaveCount(0);
    await screenshot(page, testInfo, 'T06-session-ended');
  });

  test('expired access token with invalid refresh token → "session has ended"', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k)!);
      s.expires_at = Math.floor(Date.now() / 1000) - 3600;
      s.refresh_token = 'invalidrefreshtoken';
      localStorage.setItem(k, JSON.stringify(s));
    }, STORAGE_KEY);
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fprojects$/);
    await expect(page.getByText(SESSION_ENDED)).toBeVisible();
  });

  test('stored token removed, then reload → sign-in with "session has ended" (AC-4 wording)', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
    await expect(page.getByText(SESSION_ENDED)).toBeVisible();
  });
});
