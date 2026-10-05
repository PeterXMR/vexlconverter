import { test, expect, waitForPicksStored } from './test.js';

test('the Crypto tab coin pair survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Crypto' }).click();

  await page.getByRole('combobox', { name: 'From', exact: true }).selectOption('ethereum');
  await page.getByRole('combobox', { name: 'To', exact: true }).selectOption('bitcoin');
  await waitForPicksStored(page);

  await page.reload();

  await expect(page.getByRole('tab', { name: 'Crypto' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('ethereum');
  await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveValue('bitcoin');
});
