const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "output/playwright",
  use: {
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testDir: "tests/live",
    },
    {
      name: "visual",
      testDir: "tests/visual",
    },
  ],
});
