import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { stubApi } from './fixtures/api.js';

export const test = base.extend({
  page: async ({ page, browserName, playwright, baseURL, viewport, userAgent, hasTouch }, use) => {
    if (browserName !== 'webkit') {
      await stubApi(page);
      await use(page);
      return;
    }
    const userDataDir = mkdtempSync(join(tmpdir(), 'vexl-webkit-'));
    const context = await playwright.webkit.launchPersistentContext(userDataDir, {
      baseURL,
      viewport,
      userAgent,
      hasTouch,
    });
    const persistentPage = context.pages()[0] ?? (await context.newPage());
    await stubApi(persistentPage);
    await use(persistentPage);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },
});

export const waitForPicksStored = (page) =>
  page.waitForFunction(() => globalThis.__vexlE2E?.pendingWrites === 0);

export { expect };
