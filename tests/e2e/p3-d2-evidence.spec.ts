import { test, expect } from './helpers';
import { shot3 } from './p3-helpers';

/** D-2 evidence only: renders the request whose history was produced by concurrent classification. */
test.use({ signedInAs: 'A' });
test('D-2 evidence screenshot', async ({ page }, testInfo) => {
  test.skip(
    !process.env.P3_D2_REQUEST || !process.env.P3_D2_PROJECT,
    'set P3_D2_PROJECT and P3_D2_REQUEST',
  );
  await page.goto(`/projects/${process.env.P3_D2_PROJECT}/requests/${process.env.P3_D2_REQUEST}`);
  const items = page.getByRole('region', { name: 'History' }).getByRole('listitem');
  await expect(items).toHaveCount(11);
  await shot3(page, testInfo, 'D2-history-vs-badge');
  console.log('LAST ENTRY:', await items.last().innerText());
  console.log('BADGE AREA:', await page.locator('h1').locator('..').locator('..').innerText());
});
