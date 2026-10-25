import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { productionPreviewHeaders } from './e2e/preview-headers.js';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
    open: false,
  },
  preview: {
    headers: process.env.VEXL_E2E ? productionPreviewHeaders() : undefined,
  },
  build: {
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: false,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
