const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

async function boot(page, { invalidated = false } = {}) {
  await page.setContent("<main id='app'>Search app</main>");
  await page.evaluate((invalidated) => {
    window.__messages = [];
    const get = (_keys, callback) => {
      if (invalidated) throw new Error("Extension context invalidated.");
      callback({ noDistractionsEnabled: true });
    };
    window.chrome = {
      storage: { sync: { get } },
      runtime: {
        id: "fixture",
        lastError: null,
        getURL: (file) => "http://search.test/" + file,
        sendMessage: (message, callback) => {
          window.__messages.push(message);
          if (callback) callback(null);
        },
        onMessage: { addListener() {} },
      },
    };
  }, invalidated);
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/ext.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content_script_searchapp.js") });
}

test("the search app keeps the No Distractions exit button after an app remount", async ({ page }) => {
  await boot(page);
  const button = page.locator("#quiet-mode-toggle-button");
  await expect(button).toBeVisible();

  await page.evaluate(() => {
    document.body.innerHTML = "<main id='app'>Remounted search app</main>";
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__messages)).toEqual([
    { action: "toggleNoDistractions" },
  ]);
});

test("the search app button survives an invalidated initial storage read", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await boot(page, { invalidated: true });
  await expect(page.locator("#quiet-mode-toggle-button")).toBeVisible();
  expect(errors).toEqual([]);
});
