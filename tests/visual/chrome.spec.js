const { test, expect } = require("@playwright/test");
const path = require("path");

test("pace menu on-toggle is lighter than off-toggle", async ({ page }) => {
  const file = path.join(__dirname, "fixtures", "chrome.html");
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("file://" + file);
  const onBg = await page.locator(".qt-switch.on").first().evaluate((el) =>
    getComputedStyle(el).backgroundColor,
  );
  const offBg = await page.locator(".qt-switch:not(.on)").first().evaluate((el) =>
    getComputedStyle(el).backgroundColor,
  );
  const parse = (c) => {
    const m = c.match(/[\d.]+/g) || [];
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] == null ? 1 : +m[3] };
  };
  const on = parse(onBg);
  const off = parse(offBg);
  const onLuma = on.a * (on.r + on.g + on.b);
  const offLuma = off.a * (off.r + off.g + off.b);
  expect(onLuma).toBeGreaterThan(offLuma * 1.5);
  await expect(page.locator("#qt-cluster")).toHaveScreenshot("cluster.png", {
    maxDiffPixelRatio: 0.08,
  });
});
