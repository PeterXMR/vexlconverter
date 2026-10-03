import { test as base, expect } from '@playwright/test';
import { stubApi } from './fixtures/api.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    await stubApi(page);
    await use(page);
  },
});

export { expect };
