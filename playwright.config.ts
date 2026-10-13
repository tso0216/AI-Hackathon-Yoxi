import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 900 }, channel: 'chrome', headless: true },
  reporter: 'list',
})
