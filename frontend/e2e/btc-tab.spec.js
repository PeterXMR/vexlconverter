import { test, expect } from './test.js';

test('converting 1 BTC in the BTC tab shows its USD and EUR value', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tab', { name: 'BTC' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Enter BTC Amount').fill('1');

  await expect(page.getByRole('textbox', { name: 'USD Value' })).toHaveValue('65000.00');
  await expect(page.getByRole('textbox', { name: 'EUR Value' })).toHaveValue('60000.00');
});

test('every BTC tab currency row is priced from the fiat rates, with no convert call', async ({ page }) => {
  const convertCalls = [];
  await page.route('**/api/convert', async (route) => {
    convertCalls.push(route.request().url());
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' });
  });
  await page.goto('/');

  await page.getByLabel('Enter BTC Amount').fill('1');
  await expect(page.getByRole('textbox', { name: 'USD Value' })).toHaveValue('65000.00');
  await expect(page.getByRole('textbox', { name: 'EUR Value' })).toHaveValue('60000.00');

  await page.getByRole('button', { name: '+ Add Currency' }).click();
  await page.getByRole('button', { name: /CZK/ }).click();
  await expect(page.getByRole('textbox', { name: 'CZK Value' })).toHaveValue('1495000.00');

  expect(convertCalls).toEqual([]);
});
