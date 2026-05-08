import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests-d4',
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'tests-d4/report.json' }]],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'on',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
