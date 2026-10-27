import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, ...devices['Pixel 7'] },
  webServer: [
    { command: `docker compose run --rm php php -r "require 'tests/php/bootstrap.php'; fresh_database();" && docker compose run --rm -p 8080:8080 php php -S 0.0.0.0:8080 -t api api/index.php`, url: 'http://127.0.0.1:8080/api/setup/status', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
});
