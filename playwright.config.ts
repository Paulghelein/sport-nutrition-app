import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}/sport-nutrition-app/`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'iPhone 13', use: { ...devices['iPhone 13'] }, testIgnore: /offline\.spec\.ts/ },
    {
      name: 'chromium-offline',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
      testMatch: /offline\.spec\.ts/,
    },
  ],
  webServer: {
    command: `VITE_DEV_UI=1 npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/sport-nutrition-app/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
