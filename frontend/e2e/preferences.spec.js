import { test, expect } from './test.js';

test('the active mode and the BTC/Sats unit survive a reload', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Switch to Sats' }).click();
  await expect(page.getByLabel('Enter SATS Amount')).toBeVisible();
  await page.getByRole('tab', { name: 'Fiat' }).click();
  await expect(page.getByRole('tab', { name: 'Fiat' })).toHaveAttribute('aria-selected', 'true');

  await page.reload();

  await expect(page.getByRole('tab', { name: 'Fiat' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'BTC' }).click();
  await expect(page.getByLabel('Enter SATS Amount')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to BTC' })).toBeVisible();
});
