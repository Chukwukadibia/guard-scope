import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type Browser, type Page, type TestInfo } from '@playwright/test';

/** Reads KEY=VALUE files (git-ignored). Values are never logged. */
function loadEnvFile(file: string): Record<string, string> {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnvFile('.env.local'), ...loadEnvFile('.env.test.local'), ...process.env };

export const SUPABASE_URL = env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
export const USER_A = { email: env.TEST_USER_A_EMAIL as string, password: env.TEST_USER_A_PASSWORD as string };
export const USER_B = { email: env.TEST_USER_B_EMAIL as string, password: env.TEST_USER_B_PASSWORD as string };
export const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
export const APP_ORIGIN = 'http://localhost:4173';

export const SESSION_ENDED = 'Your session has ended. Please sign in again.';
export const GENERIC_CREDENTIALS = 'Email or password is incorrect.';

/**
 * Password grant through the public auth API (same call supabase-js makes). Runs inside the browser
 * because Node's fetch does not use the sandbox's HTTPS proxy.
 */
export async function apiSession(browser: Browser, user: { email: string; password: string }) {
  const page = await browser.newPage();
  try {
    await page.goto(`${APP_ORIGIN}/p`);
    const result = await page.evaluate(
      async ({ url, key, user }) => {
        const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify(user),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      },
      { url: SUPABASE_URL, key: SUPABASE_KEY, user },
    );
    if (result.status !== 200) throw new Error(`fixture sign-in failed: HTTP ${result.status}`);
    return result.body;
  } finally {
    await page.close();
  }
}

type Fixtures = { signedInAs: 'A' | null };
type WorkerFixtures = { sessionA: Record<string, unknown> };

/**
 * `signedInAs: 'A'` pre-loads a real session for user A into localStorage once (storageState),
 * exactly as supabase-js persists it. One password grant per worker keeps us under auth rate limits.
 */
export const test = base.extend<Fixtures, WorkerFixtures>({
  signedInAs: [null, { option: true }],
  sessionA: [
    async ({ browser }, use) => {
      await use(await apiSession(browser, USER_A));
    },
    { scope: 'worker' },
  ],
  storageState: async ({ signedInAs, sessionA }, use) => {
    if (signedInAs === 'A') {
      await use({
        cookies: [],
        origins: [
          {
            origin: APP_ORIGIN,
            localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(sessionA) }],
          },
        ],
      });
    } else {
      await use(undefined);
    }
  },
});
export { expect };

export function isMobile(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile';
}

export async function signInViaUi(page: Page, user: { email: string; password: string }) {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Opens the mobile menu if needed and returns the visible main navigation. */
export async function mainNav(page: Page, mobile: boolean) {
  if (mobile) {
    const toggle = page.getByRole('button', { name: /open menu/i });
    if (await toggle.isVisible()) await toggle.click();
  }
  return page.getByRole('navigation', { name: 'Main' });
}

export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

export async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: `docs/testing/phase1/screenshots/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}
