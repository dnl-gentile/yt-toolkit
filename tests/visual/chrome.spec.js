const { test, expect } = require("@playwright/test");
const path = require("path");

const fixture = path.join(__dirname, "fixtures", "chrome.html");

async function readPillPaint(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      height: cs.height,
      borderRadius: cs.borderRadius,
      backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
      borderTopWidth: cs.borderTopWidth,
      borderTopStyle: cs.borderTopStyle,
      boxShadow: cs.boxShadow,
      opacity: cs.opacity,
    };
  });
}

function expectNativePillFallback(paint) {
  expect(paint.backgroundColor).toBe("rgba(0, 0, 0, 0.3)");
  expect(paint.height).toBe("40px");
  expect(paint.borderRadius).toBe("28px");
  expect(paint.backdropFilter).toBe("none");
  expect(paint.borderTopWidth).toBe("0px");
  expect(paint.borderTopStyle).toBe("none");
  expect(paint.boxShadow).toBe("none");
  expect(paint.opacity).toBe("1");
}

test("pace menu on-toggle is lighter than off-toggle", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("file://" + fixture);
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
  await expect(page.locator("#qt-cluster .qt-chrome-cluster")).toHaveScreenshot("cluster.png", {
    maxDiffPixelRatio: 0.08,
  });
  await expect(page.locator("#qt-time-pill")).toHaveScreenshot("time-pill.png", {
    maxDiffPixelRatio: 0.08,
  });
});

test("Toolkit pills use the native fallback paint on light and dark video", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("file://" + fixture);

  const targets = [
    page.locator("#qt-cluster .qt-chrome-cluster"),
    page.locator("#qt-time-pill"),
    page.locator("[data-surface='light'] .qt-paint-probe"),
    page.locator("[data-surface='dark'] .qt-paint-probe"),
  ];
  for (const target of targets) expectNativePillFallback(await readPillPaint(target));

  const surfaces = await page.locator(".paint-surface").evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: node.dataset.surface,
      backgroundColor: getComputedStyle(node).backgroundColor,
      pillBackgroundColor: getComputedStyle(node.querySelector(".qt-paint-probe")).backgroundColor,
    })),
  );
  expect(surfaces).toEqual([
    {
      name: "light",
      backgroundColor: "rgb(240, 240, 240)",
      pillBackgroundColor: "rgba(0, 0, 0, 0.3)",
    },
    {
      name: "dark",
      backgroundColor: "rgb(24, 32, 40)",
      pillBackgroundColor: "rgba(0, 0, 0, 0.3)",
    },
  ]);
});
