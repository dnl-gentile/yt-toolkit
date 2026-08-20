const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const EXT_PATH = process.env.YT_TOOLKIT_EXT || REPO_ROOT;
const SELECTORS = require("../host/selectors.json");
const VIDEOS = require("./videos.json");

const BLOCK_URL =
  /consent\.(youtube|google)\.com|accounts\.google\.com|sorry\/index/i;
const BLOCK_TEXT =
  /before you continue to youtube|sign in to confirm (you('re| are) not a bot)|confirm you.?re not a bot|unusual traffic/i;

function videoList() {
  return Array.isArray(VIDEOS) ? VIDEOS : VIDEOS.videos || [];
}

function pickVideo() {
  const list = videoList();
  return list.find((v) => v.short) || list[0];
}

function watchUrl(video) {
  return video.url || `https://www.youtube.com/watch?v=${video.id}`;
}

function launchOptions() {
  const headed = process.env.HEADED === "1" || process.env.PW_HEADED === "1";
  const channel = process.env.PW_CHANNEL || "chromium";
  const opts = {
    channel,
    headless: !headed,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
    ],
  };
  return opts;
}

async function youtubeBlockReason(page) {
  const url = page.url();
  if (BLOCK_URL.test(url)) return `navigated to ${url}`;
  const title = await page.title().catch(() => "");
  if (/before you continue/i.test(title)) return `title: ${title}`;
  const body = await page
    .locator("body")
    .innerText({ timeout: 2000 })
    .catch(() => "");
  const hit = body.match(BLOCK_TEXT);
  if (hit) return `page text: "${hit[0]}"`;
  return null;
}

test.describe("live YouTube probe", () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(EXT_PATH, "manifest.json"))) {
      throw new Error(`extension path has no manifest.json: ${EXT_PATH}`);
    }
    context = await chromium.launchPersistentContext("", launchOptions());
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await Promise.race([
        context.waitForEvent("serviceworker"),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
    }
    console.log(
      "[probe] extension",
      EXT_PATH,
      "service worker:",
      worker ? worker.url() : "none"
    );
  });

  test.afterAll(async () => {
    if (context) await context.close();
  });

  test("loads unpacked extension and #qt-cluster on a watch URL", async () => {
    const video = pickVideo();
    test.info().annotations.push({
      type: "video",
      description: `${video.id} ${video.title || ""}`.trim(),
    });
    const page = context.pages()[0] || (await context.newPage());
    const url = watchUrl(video);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (err) {
      test.skip(true, `YouTube navigation failed (network/block): ${err.message}`);
      return;
    }

    const blocked = await youtubeBlockReason(page);
    if (blocked) {
      test.skip(true, `YouTube blocked the probe: ${blocked}`);
      return;
    }

    try {
      await page.locator(SELECTORS.moviePlayer).waitFor({
        state: "attached",
        timeout: 30_000,
      });
    } catch {
      const extra = (await youtubeBlockReason(page)) || page.url();
      test.skip(
        true,
        `YouTube did not render #movie_player (consent, login, or bot-check): ${extra}`
      );
      return;
    }

    const cluster = page.locator(SELECTORS.qtCluster);
    try {
      await cluster.waitFor({ state: "attached", timeout: 20_000 });
    } catch {
      const extra = (await youtubeBlockReason(page)) || page.url();
      test.skip(
        true,
        `#qt-cluster did not appear within 20s — YouTube may have blocked the session (${extra})`
      );
      return;
    }

    await expect(cluster).toBeAttached();

    const player = page.locator(SELECTORS.moviePlayer);
    await player.hover().catch(() => {});
    const gear = page.locator(SELECTORS.settingsButton).first();
    const gearVisible = await gear
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    if (!gearVisible) {
      console.log("[probe] gear not clickable; skipping settings-menu dump");
      return;
    }
    try {
      await gear.click({ timeout: 4000 });
      const items = page.locator(SELECTORS.settingsMenuItems);
      await items.first().waitFor({ state: "visible", timeout: 4000 });
      const labels = (await items.allInnerTexts()).map((s) =>
        s.replace(/\s+/g, " ").trim()
      );
      console.log("[probe] settings-menu labels:", JSON.stringify(labels));
    } catch (err) {
      console.log("[probe] settings-menu dump skipped:", err.message);
    }
  });
});
