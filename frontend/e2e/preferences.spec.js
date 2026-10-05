import { test, expect, waitForPicksStored } from './test.js';

test('the active mode and the BTC/Sats unit survive a reload', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Switch to Sats' }).click();
  await expect(page.getByLabel('Enter SATS Amount')).toBeVisible();
  await page.getByRole('tab', { name: 'Fiat' }).click();
  await expect(page.getByRole('tab', { name: 'Fiat' })).toHaveAttribute('aria-selected', 'true');
  await waitForPicksStored(page);

  await page.reload();

  await expect(page.getByRole('tab', { name: 'Fiat' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'BTC' }).click();
  await expect(page.getByLabel('Enter SATS Amount')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to BTC' })).toBeVisible();
});

test('the BTC tab converts while the Evolu chunk is still loading', async ({ page }) => {
  await page.route('**/assets/evoluStore-*.js', () => {});
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('tablist', { name: 'Conversion mode' })).toHaveAttribute('aria-busy', 'true');
  await page.getByLabel('Enter BTC Amount').fill('1');

  await expect(page.getByRole('textbox', { name: 'USD Value' })).toHaveValue('65000.00');
  await expect(page.getByRole('tablist', { name: 'Conversion mode' })).toHaveAttribute('aria-busy', 'true');
});

test('when Evolu does not start, picks fall back to defaults and work for the session', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__vexlE2E = { evolu: 'hang', startTimeoutMs: 500 };
  });
  await page.goto('/');

  await expect(page.getByRole('tab', { name: 'BTC' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Switch to Sats' }).click();
  await expect(page.getByLabel('Enter SATS Amount')).toBeVisible();
  await page.getByRole('tab', { name: 'Fiat' }).click();
  await expect(page.getByRole('tab', { name: 'Fiat' })).toHaveAttribute('aria-selected', 'true');
});
