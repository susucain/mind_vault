import { expect, test } from '@playwright/test';

for (const width of [1280, 980, 390]) {
  test(`authenticated overview does not overflow horizontally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'mind-vault.auth',
        JSON.stringify({ token: 'e2e-token', user: { id: 'e2e-user' } }),
      );
    });

    await page.goto('/app/overview');
    await expect(page.getByRole('heading', { exact: true, name: 'Overview' })).toBeVisible();

    const widths = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(widths.scrollWidth).toBe(widths.clientWidth);
  });
}
