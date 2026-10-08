import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { RELAY_PORT } from './e2e/preview-headers.js';

const CI = Boolean(process.env.CI);
const APP_PORT = 4173;
const PRODUCTION_API_URL = 'https://vexlconverter-api.onrender.com/api';

process.env.VEXL_E2E_RELAY_DIR ??= mkdtempSync(join(tmpdir(), 'vexl-relay-'));

const relayCommand = CI
  ? `docker run --rm --init -p ${RELAY_PORT}:4000 docker.io/evoluhq/relay:4`
  : 'npx --yes @evolu/relay@4';

const desktop = (device) => ({ ...devices[device], grepInvert: /@mobile/ });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: desktop('Desktop Chrome') },
    { name: 'firefox', use: desktop('Desktop Firefox') },
    { name: 'webkit', use: desktop('Desktop Safari') },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      name: 'relay',
      command: relayCommand,
      cwd: process.env.VEXL_E2E_RELAY_DIR,
      port: RELAY_PORT,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      name: 'app',
      command: `npm run build && npx vite preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      env: { VITE_API_URL: PRODUCTION_API_URL, VEXL_E2E: '1' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
