import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5174', reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
})
