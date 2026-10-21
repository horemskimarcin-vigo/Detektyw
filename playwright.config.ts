import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    locale: 'pl-PL',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run build -w @detektyw/client && npx tsx apps/server/src/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      DATABASE_URL: 'pglite:memory',
      APP_URL: `http://localhost:${PORT}`,
      CLIENT_DIST: 'apps/client/dist',
      LOG_LEVEL: 'warn',
    },
  },
});
