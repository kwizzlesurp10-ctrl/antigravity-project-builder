import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const E2E_ADMIN_SECRET = process.env.API_ADMIN_SECRET || 'antigravity-e2e-admin-secret';
const E2E_STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_orbital_e2e_secret';

// Ensure the test worker signs Stripe payloads with the same secret the server verifies.
process.env.API_ADMIN_SECRET ??= E2E_ADMIN_SECRET;
process.env.NEXT_PUBLIC_API_ADMIN_SECRET ??= E2E_ADMIN_SECRET;
process.env.STRIPE_WEBHOOK_SECRET ??= E2E_STRIPE_SECRET;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'x-admin-secret': E2E_ADMIN_SECRET,
    },
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build here so NEXT_PUBLIC_API_ADMIN_SECRET is inlined into the client bundle.
    command: 'rm -rf .next && npx next build && npx next start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      API_ADMIN_SECRET: E2E_ADMIN_SECRET,
      NEXT_PUBLIC_API_ADMIN_SECRET: E2E_ADMIN_SECRET,
      STRIPE_WEBHOOK_SECRET: E2E_STRIPE_SECRET,
      // Modest RPM: high enough for UI flows, low enough for the stream throttle test.
      RATE_LIMIT_RPM: '8',
    },
  },
});
