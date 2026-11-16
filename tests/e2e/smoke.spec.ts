import { expect, test } from '@playwright/test';

test('public link placeholder renders without horizontal overflow', async ({ page }) => {
  await page.goto('/p');
  await expect(
    page.getByRole('heading', { level: 1, name: "This link isn't available" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
