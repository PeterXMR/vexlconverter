import { test, expect } from './test.js';

test('converting 1 BTC in the BTC tab shows its USD and EUR value', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tab', { name: 'BTC' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Enter BTC Amount').fill('1');

  await expect(page.getByRole('textbox', { name: 'USD Value' })).toHaveValue('65000.00');
  await expect(page.getByRole('textbox', { name: 'EUR Value' })).toHaveValue('60000.00');
});
