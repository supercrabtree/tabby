import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  use: {
    baseURL: 'http://localhost:5173',
    colorScheme: 'light',
  },
  webServer: {
    command: 'npx vite --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
