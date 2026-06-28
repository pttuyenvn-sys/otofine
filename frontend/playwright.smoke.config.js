/** Minimal Playwright config for focused smoke tests. */
module.exports = {
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["dot"]],
  use: {
    headless: true,
    baseURL: process.env.SMOKE_BASE_URL || "http://localhost:3001",
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    browserName: "chromium",
  },
  projects: [
    {
      name: "chromium",
      use: {},
    },
  ],
};

