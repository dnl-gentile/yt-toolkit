const { test, expect, chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const EXT_PATH = process.env.YT_TOOLKIT_EXT || REPO_ROOT;
const REQUIRE_WPM = process.env.REQUIRE_WPM === "1";
const SELECTORS = require("../host/selectors.json");
const VIDEOS = require("./videos.json");
/* Spoken fixture whose current player response exposes English ASR and whose
   More menu therefore contains the native Captions entry. A music-only Short
   legitimately omits that surface and cannot validate our two injected rows. */
const SHORTS_URL = "https://www.youtube.com/shorts/uBG36zi1RPo";
const SHORTS_CHROME_SELECTORS = Object.freeze({
  controls: SELECTORS.shortsControls,
  left: SELECTORS.shortsLeftControls,
  right: SELECTORS.shortsRightControls,
  volume: SELECTORS.shortsVolumeControls,
});

const BLOCK_URL =
  /consent\.(youtube|google)\.com|accounts\.google\.com|sorry\/index/i;
const BLOCK_TEXT =
  /before you continue to youtube|sign in to confirm (you('re| are) not a bot)|confirm you.?re not a bot|unusual traffic/i;

function videoList() {
  return Array.isArray(VIDEOS) ? VIDEOS : VIDEOS.videos || [];
}

function pickVideo() {
  const list = videoList();
  /* The watch probe takes long enough to exercise menus, responsiveness and
     captions. A ~20 s fixture can finish during setup and let autoplay swap in
     a different player, turning a shortcut assertion into a host/navigation
     flake. Keep the acceptance on one long spoken video. */
  return list.find((v) => v.hasAsr && !v.short) || list[0];
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

async function waitForWatchContent(page, timeout = 45_000) {
  const player = page.locator(SELECTORS.moviePlayer).first();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const adActive = await player
      .evaluate(
        (root) =>
          root.classList.contains("ad-showing") ||
          root.classList.contains("ad-interrupting"),
      )
      .catch(() => false);
    if (!adActive) return;
    const skip = player
      .locator(
        "button.ytp-skip-ad-button, button.ytp-skip-ad-button-modern, " +
          "button[aria-label*='Skip ad' i], button[aria-label*='Pular anúncio' i]",
      )
      .last();
    if (await skip.isVisible().catch(() => false))
      await skip.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  throw new Error("YouTube ad did not yield to watch content within 45s");
}

async function revealWatchChrome(page, player) {
  const box = await player.boundingBox();
  if (!box) throw new Error("watch player has no rendered box");
  const y = box.y + box.height / 2;
  const center = box.x + box.width / 2;
  /* Generate movement even when navigation reused the same player rectangle.
     A locator hover at an unchanged coordinate is a no-op for autohide. */
  await page.mouse.move(center - Math.min(16, box.width / 8), y);
  await page.mouse.move(center + Math.min(16, box.width / 8), y, { steps: 2 });
}

const SHORTS_CAPTION_LABEL =
  /captions|subtitles|closed captions|legendas|subt[ií]tulos/i;

async function revealShortsChrome(page, player) {
  const box = await player.boundingBox();
  if (!box) throw new Error("active Shorts player has no rendered box");
  /* Move the real pointer into the video. The current COW controls overlay
     intentionally intercepts pointer events, so Locator.hover() on the video
     itself never becomes actionable even though this is the user's gesture. */
  /* Enter from outside as a real hover transition. ArrowDown keeps the next
     Short at exactly the same screen coordinates, and a no-op mouse.move at
     the old coordinate does not wake YouTube's newly mounted COW controls.
     Stay vertically below the volume row so an expanded slider can collapse. */
  await page.mouse.move(box.x >= 8 ? box.x - 4 : box.x + box.width + 4, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 2,
  });
}

async function openShortsCaptionMenu(page, reel) {
  const videoSurface = reel
    .locator("#shorts-player.html5-video-player, #shorts-player")
    .first();
  await revealShortsChrome(page, videoSurface);
  await page.waitForTimeout(250);
  /* The COW experiment may portal/re-parent its action buttons one level away
     from the visual right-control container. Keep the lookup bounded to this
     active reel and exact native accessible names, while avoiding a brittle
     ancestry assumption that has already changed on the public host. */
  const more = reel
    .getByRole("button", {
      name: /^(?:More actions|More|Mais ações|Ações)$/i,
    })
    .last();
  const hasMore = await more
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (hasMore) {
    await more.click();
    const nativeMoreMenu = page.getByRole("menu").last();
    await nativeMoreMenu.waitFor({ state: "visible", timeout: 4000 });
    const entry = nativeMoreMenu
      .locator(
        "[role='menuitem'], [role='button'], [role='listitem'], " +
          "tp-yt-paper-item, yt-list-item-view-model",
      )
      .filter({ hasText: SHORTS_CAPTION_LABEL })
      .last();
    await entry.waitFor({ state: "visible", timeout: 4000 });
    await entry.click();
  } else {
    /* Some Shorts layouts expose a separate sheet opener. Never use a native
       CC toggle here: aria-pressed identifies the control that changes CC. */
    const opener = reel
      .locator(
        "button:not([aria-pressed])[aria-label*='Captions' i], " +
          "button:not([aria-pressed])[aria-label*='Subtitles' i], " +
          "button:not([aria-pressed])[aria-label*='Legendas' i]",
      )
      .first();
    await opener.waitFor({ state: "visible", timeout: 4000 });
    await opener.click();
  }

  const row = page.locator("[role='menu'] > [data-qt-shorts-cap]").first();
  await row.waitFor({ state: "visible", timeout: 5000 });
  return row.locator("xpath=..");
}

test.describe("live YouTube probe", () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;
  /** @type {import('@playwright/test').Worker|null} */
  let worker;

  test.beforeAll(async () => {
    if (!fs.existsSync(path.join(EXT_PATH, "manifest.json"))) {
      throw new Error(`extension path has no manifest.json: ${EXT_PATH}`);
    }
    context = await chromium.launchPersistentContext("", launchOptions());
    worker = context.serviceWorkers()[0];
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
    if (worker) {
      await worker.evaluate(() => {
        const values = {
          qt_paceLock: false,
          qt_trimSilence: false,
          qt_playbackRate: 1,
          qt_fixed1x: false,
          qt_wordHighlight: false,
          qt_centerWord: false,
          qt_dualCaptions: false,
          qt_captionLangs: [],
          qt_captionsEnabled: null,
          noDistractionsEnabled: false,
        };
        const write = () =>
          Promise.all(
            [chrome.storage.sync, chrome.storage.local].map(
              (area) => new Promise((resolve) => area.set(values, resolve)),
            ),
          );
        /* onInstalled seeds defaults asynchronously in a fresh profile. Write
           again after that callback so local-first preference reads are stable. */
        return write()
          .then(() => new Promise((resolve) => setTimeout(resolve, 500)))
          .then(write);
      });
    }
  });

  test.afterAll(async () => {
    if (context) await context.close();
  });

  test("loads unpacked extension and #qt-cluster on a watch URL", async () => {
    test.setTimeout(180_000);
    const video = pickVideo();
    test.info().annotations.push({
      type: "video",
      description: `${video.id} ${video.title || ""}`.trim(),
    });
    const page = context.pages()[0] || (await context.newPage());
    const url = watchUrl(video);
    const timedtext = [];
    page.on("response", async (response) => {
      if (!response.url().includes(SELECTORS.timedtextPath)) return;
      const body = await response.text().catch(() => "");
      timedtext.push({ status: response.status(), bytes: body.length });
    });

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
    await waitForWatchContent(page);

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

    /* Real-host shortcut acceptance. The fixture suite proves Lock/Trim are
       effectively off without erasing their saved values; this proves that
       YouTube itself does not swallow either keyboard chord. */
    if (!worker) {
      worker = context.serviceWorkers()[0];
      if (!worker) {
        worker = await Promise.race([
          context.waitForEvent("serviceworker"),
          new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
      }
    }
    expect(
      worker,
      "real-host shortcut acceptance requires the extension service worker",
    ).toBeTruthy();
    await worker.evaluate(() => {
      const values = {
        qt_paceLock: false,
        qt_trimSilence: false,
        qt_playbackRate: 1.5,
        qt_fixed1x: false,
      };
      return Promise.all(
        [chrome.storage.sync, chrome.storage.local].map(
          (area) => new Promise((resolve) => area.set(values, resolve)),
        ),
      );
    });
    const liveVideo = page.locator(`${SELECTORS.moviePlayer} video`).first();
    await expect
      .poll(() => liveVideo.evaluate((element) => element.playbackRate), {
        timeout: 5000,
      })
      .toBeCloseTo(1.5, 1);
    const shortcutTarget = page
      .locator(`${SELECTORS.moviePlayer} .ytp-play-button`)
      .first();
    await expect(shortcutTarget).toBeAttached();
    await shortcutTarget.focus();
    await expect
      .poll(() =>
        shortcutTarget.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.press("a");
    await expect
      .poll(() => liveVideo.evaluate((element) => element.playbackRate), {
        timeout: 5000,
      })
      .toBe(1);

    const fixedProfile = await worker.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.get(
            ["qt_fixed1x", "qt_playbackRate", "qt_paceLock", "qt_trimSilence"],
            resolve,
          ),
        ),
    );
    expect(fixedProfile).toEqual({
      qt_fixed1x: true,
      qt_playbackRate: 1.5,
      qt_paceLock: false,
      qt_trimSilence: false,
    });

    /* Fixed 1x is a persisted state, not a one-player hold. Cross a real
       document/video boundary before restoring the saved custom profile. */
    /* Use the tiny first-YouTube-video fixture for the cross-document leg.
       It still exercises a distinct /watch player and avoids making this
       shortcut invariant depend on a heavily monetized second fixture. */
    const nextVideo =
      videoList().find(
        (candidate) => candidate.short && candidate.id !== video.id,
      ) ||
      videoList().find(
        (candidate) => !candidate.short && candidate.id !== video.id,
      );
    expect(nextVideo, "live fixed-1x navigation needs a second watch video").toBeTruthy();
    await page.goto(watchUrl(nextVideo), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.locator(SELECTORS.moviePlayer).waitFor({
      state: "attached",
      timeout: 30_000,
    });
    await waitForWatchContent(page);
    await cluster.waitFor({ state: "attached", timeout: 20_000 });
    await liveVideo.evaluate((element) => {
      element.loop = true;
      if (element.ended) element.currentTime = 0;
    });
    await expect
      .poll(() => liveVideo.evaluate((element) => element.playbackRate), {
        timeout: 5000,
      })
      .toBe(1);
    await shortcutTarget.focus();
    await expect
      .poll(() =>
        shortcutTarget.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.evaluate(() => {
      window.__qtLiveKeyProbe = [];
      const capture = (event) => {
        window.__qtLiveKeyProbe.push({
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          defaultPrevented: event.defaultPrevented,
        });
      };
      document.addEventListener("keydown", capture, true);
      setTimeout(() => document.removeEventListener("keydown", capture, true), 10_000);
    });
    await page.keyboard.press("Shift+Backquote");
    try {
      await expect
        .poll(() => liveVideo.evaluate((element) => element.playbackRate), {
          timeout: 5000,
        })
        .toBeCloseTo(1.5, 1);
    } catch (error) {
      const persisted = await worker.evaluate(
        () =>
          new Promise((resolve) =>
            chrome.storage.local.get(
              ["qt_fixed1x", "qt_playbackRate", "qt_paceLock", "qt_trimSilence"],
              resolve,
            ),
          ),
      );
      console.log(
        "[probe] fixed-1x exit diagnostic",
        JSON.stringify({
          persisted,
          page: await page.evaluate(() => ({
            keyProbe: window.__qtLiveKeyProbe,
            active: {
              tag: document.activeElement?.tagName || "",
              id: document.activeElement?.id || "",
              className:
                typeof document.activeElement?.className === "string"
                  ? document.activeElement.className
                  : "",
              role: document.activeElement?.getAttribute?.("role") || "",
            },
            dialogs: Array.from(
              document.querySelectorAll(
                "yt-hotkey-dialog-renderer, ytd-popup-container [role='dialog'], " +
                  "tp-yt-paper-dialog[opened], ytd-modal-with-title-and-button-renderer",
              ),
            ).map((dialog) => {
              const style = getComputedStyle(dialog);
              const rect = dialog.getBoundingClientRect();
              return {
                tag: dialog.tagName,
                hidden: dialog.hidden,
                ariaHidden: dialog.getAttribute("aria-hidden"),
                display: style.display,
                visibility: style.visibility,
                size: [rect.width, rect.height],
              };
            }),
            videos: Array.from(document.querySelectorAll("video")).map((video) => {
              const rect = video.getBoundingClientRect();
              const player = video.closest("#movie_player, .html5-video-player");
              let videoId = "";
              try {
                videoId = player?.getPlayerResponse?.()?.videoDetails?.videoId || "";
              } catch {}
              return {
                rate: video.playbackRate,
                connected: video.isConnected,
                visibleArea: Math.max(0, rect.width) * Math.max(0, rect.height),
                playerId: player?.id || "",
                playerClass: player?.className || "",
                videoId,
              };
            }),
          })),
        }, null, 2),
      );
      throw error;
    }
    const savedRate = await worker.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.storage.local.get(["qt_playbackRate", "qt_fixed1x"], (state) =>
            resolve(state),
          ),
        ),
    );
    expect(savedRate).toEqual({ qt_playbackRate: 1.5, qt_fixed1x: false });

    /* Pace Lock is explicitly off in the real host above. The connected menu
       must therefore expose one coherent multiplier UI, not a stale WPM body
       with an off toggle. Keep a rendered artifact for the user-visible gate. */
    const watchPlayer = page.locator(SELECTORS.moviePlayer).first();
    await revealWatchChrome(page, watchPlayer);
    const paceButton = cluster.locator(".qt-chrome-btn");
    await expect
      .poll(() =>
        cluster.evaluate((wrap) => ({
          opacity: Number(getComputedStyle(wrap).opacity),
          inert: wrap.inert,
          tabIndex: wrap.querySelector(".qt-chrome-btn")?.tabIndex,
          pointerEvents: getComputedStyle(
            wrap.querySelector(".qt-chrome-cluster"),
          ).pointerEvents,
        })),
      )
      .toEqual({
        opacity: 1,
        inert: false,
        tabIndex: 0,
        pointerEvents: "auto",
      });
    await paceButton.click({ timeout: 5000 });
    const paceMenu = watchPlayer.locator(":scope > #qt-speed-menu");
    await expect(paceMenu).toBeVisible();
    await expect(paceMenu.locator(".qt-menu-head span")).toHaveText("Playback speed");
    await expect(paceMenu.locator("[data-act='wpm-range']")).toHaveCount(0);
    await expect(paceMenu.locator("[data-act='rate-range']")).toHaveAttribute(
      "aria-valuetext",
      "1.5x",
    );
    expect(await paceMenu.locator("[data-rate]").allTextContents()).toEqual([
      "1x",
      "1.25x",
      "1.5x",
      "2x",
      "3x",
    ]);
    await test.info().attach("manual-pace-x", {
      body: await paceMenu.screenshot(),
      contentType: "image/png",
    });
    await paceButton.click();
    await expect(paceMenu).toBeHidden();

    const cc = page.locator("button.ytp-subtitles-button").first();
    if (await cc.isVisible().catch(() => false)) {
      if ((await cc.getAttribute("aria-pressed")) === "true") await cc.click();
      await expect(cc).toHaveAttribute("aria-pressed", "false", { timeout: 3000 });
      await page.waitForTimeout(5500);
      await expect(cc).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(SELECTORS.moviePlayer)).not.toHaveClass(/qt-ours-on/);
      for (const id of ["#qt-cap-p", "#qt-cap-s"]) {
        const line = page.locator(id);
        if (await line.count()) await expect(line).toBeHidden();
      }
    }

    expect(
      timedtext.length,
      `timedtext request storm: ${timedtext.length} requests`,
    ).toBeLessThanOrEqual(12);

    /* Responsiveness. A request-count budget and a visible #qt-cluster both
       pass happily while the extension pins the main thread — which is what a
       self-feeding MutationObserver does, with a clean console. Measure the
       real page: how long a zero-delay task waits, and how many mutations the
       extension causes on an idle masthead. */
    const health = await page.evaluate(async () => {
      const lags = [];
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, 0));
        lags.push(performance.now() - t0);
      }
      lags.sort((a, b) => a - b);
      const masthead = document.querySelector("ytd-masthead");
      let mutations = 0;
      if (masthead) {
        const obs = new MutationObserver((list) => {
          mutations += list.length;
        });
        obs.observe(masthead, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        await new Promise((r) => setTimeout(r, 2000));
        obs.disconnect();
      }
      return {
        p95: lags[Math.floor(lags.length * 0.95)],
        max: lags[lags.length - 1],
        mutations,
        hadMasthead: !!masthead,
      };
    });
    console.log(
      `[probe] main-thread lag p95=${health.p95.toFixed(1)}ms max=${health.max.toFixed(1)}ms; masthead mutations in 2s=${health.mutations}`,
    );
    expect(
      health.p95,
      `event loop saturated: zero-delay task p95=${health.p95.toFixed(1)}ms`,
    ).toBeLessThan(200);
    if (health.hadMasthead) {
      /* YouTube itself mutates the masthead, so this is a storm ceiling, not
         a zero. The regression it guards produced ~120 per second. */
      expect(
        health.mutations,
        `masthead mutation storm: ${health.mutations} records in 2s`,
      ).toBeLessThan(120);
    }
    const label = (await cluster.textContent()) || "";
    const wpm = Number((label.match(/(\d+)\s*WPM/i) || [])[1] || 0);
    console.log(`[probe] cluster after hidden ASR acquisition: ${label.trim()}`);
    if (timedtext.some((item) => item.bytes > 0)) {
      expect(wpm, `non-empty timedtext but cluster stayed ${label}`).toBeGreaterThan(0);
    } else if (REQUIRE_WPM) {
      expect(
        wpm,
        "strict live acceptance requires non-zero WPM even when the host returned empty timedtext",
      ).toBeGreaterThan(0);
    } else {
      /* Do NOT pass here. An all-empty response set is indistinguishable from
         the very bug this assertion guards (the hidden pull never gets a body
         because no pot was ever harvested), so a green result would be
         evidence of nothing. Skipping keeps it out of any "N/N passed" count. */
      test.info().annotations.push({
        type: "unproven",
        description: `host returned only empty timedtext bodies over ${timedtext.length} requests; WPM acquisition is NOT proven by this run. Re-run with REQUIRE_WPM=1 in a signed-in Chrome to make it a hard gate.`,
      });
      test.skip(
        true,
        "WPM acquisition unproven: every timedtext body was empty (see the unproven annotation)",
      );
    }

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
      await page.waitForTimeout(500);
      const visibleRows = await items.evaluateAll((rows) =>
        rows.map((row) => ({
          label: (row.textContent || "").replace(/\s+/g, " ").trim(),
          display: getComputedStyle(row).display,
        })),
      );
      const labels = visibleRows
        .filter((row) => row.display !== "none")
        .map((row) => row.label);
      console.log("[probe] settings-menu labels:", JSON.stringify(labels));
      expect(labels.some((text) => /^Playback speed\b/i.test(text))).toBe(false);

      const captionsRoot = page
        .locator(".ytp-settings-menu .ytp-menuitem")
        .filter({ has: page.locator(".ytp-menuitem-label", { hasText: /Subtitles|Captions/i }) })
        .first();
      await captionsRoot.click();
      const dual = page.locator("[data-qt-cap='qt_dualCaptions']");
      await dual.waitFor({ state: "visible", timeout: 4000 });
      await expect(
        dual.locator(".ytp-menuitem-toggle-checkbox").locator("xpath=.."),
      ).toHaveClass(/ytp-menuitem-content/);
      await dual.click();

      const english = page
        .locator(".ytp-settings-menu .ytp-menuitem")
        .filter({ has: page.locator(".ytp-menuitem-label", { hasText: /^English$/ }) })
        .first();
      if ((await english.getAttribute("data-qt-slot")) !== "0") await english.click();
      await expect(english).toHaveAttribute("data-qt-slot", "0");
      const auto = page
        .locator(".ytp-settings-menu .ytp-menuitem")
        .filter({ has: page.locator(".ytp-menuitem-label", { hasText: /^Auto-translate$/i }) })
        .first();
      let second = null;
      if (await auto.isVisible({ timeout: 750 }).catch(() => false)) {
        await auto.click();
        const arabic = page
          .locator(".ytp-settings-menu .ytp-menuitem")
          .filter({ has: page.locator(".ytp-menuitem-label", { hasText: /^Arabic$/i }) })
          .first();
        if (await arabic.isVisible({ timeout: 1200 }).catch(() => false)) {
          second = arabic;
        } else {
          const firstTranslation = page
            .locator(".ytp-settings-menu .ytp-menuitem:not([data-qt-cap])")
            .first();
          if (await firstTranslation.isVisible({ timeout: 1200 }).catch(() => false))
            second = firstTranslation;
        }
      } else {
        const candidates = page.locator(
          ".ytp-settings-menu .ytp-menuitem:not([data-qt-cap])",
        );
        const index = await candidates.evaluateAll((rows) =>
          rows.findIndex((row) => {
            const label = (row.querySelector(".ytp-menuitem-label")?.textContent || "")
              .replace(/\s+/g, " ")
              .trim();
            const style = getComputedStyle(row);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              !/^(Off|English|Auto-translate)$/i.test(label)
            );
          }),
        );
        if (index >= 0) second = candidates.nth(index);
      }
      if (second) {
        await second.click();
        await expect(second).toHaveAttribute("data-qt-slot", "1");
        const candidates = page.locator(
          ".ytp-settings-menu .ytp-menuitem:not([data-qt-cap])",
        );
        const thirdIndex = await candidates.evaluateAll((rows) =>
          rows.findIndex((row) => {
            const label = (
              row.querySelector(".ytp-menuitem-label")?.textContent || ""
            )
              .replace(/\s+/g, " ")
              .trim();
            const style = getComputedStyle(row);
            return (
              !row.hasAttribute("data-qt-slot") &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              !/^(Off|English|Auto-translate)$/i.test(label)
            );
          }),
        );
        if (thirdIndex >= 0) {
          const third = candidates.nth(thirdIndex);
          const beforeThird = worker
            ? await worker.evaluate(
                () =>
                  new Promise((resolve) =>
                    chrome.storage.sync.get(["qt_captionLangs"], (s) =>
                      resolve(s.qt_captionLangs || []),
                    ),
                  ),
              )
            : null;
          /* Both vacancies are occupied: a third click must be inert. */
          await third.click();
          await expect(third).not.toHaveAttribute("data-qt-slot", /.+/);
          if (worker) {
            const blocked = await worker.evaluate(
              () =>
                new Promise((resolve) =>
                  chrome.storage.sync.get(["qt_captionLangs"], (s) =>
                    resolve(s.qt_captionLangs || []),
                  ),
                ),
            );
            expect(blocked).toEqual(beforeThird);
          }
          /* Explicitly clear slot 2, then the same third language fills it. */
          await second.click();
          await expect(second).not.toHaveAttribute("data-qt-slot", /.+/);
          await third.click();
          await expect(third).toHaveAttribute("data-qt-slot", "1");
          second = third;
        }
        const checkColors = await Promise.all(
          [english, second].map((row) =>
            row.locator(".qt-dual-check").evaluate((el) => getComputedStyle(el).color),
          ),
        );
        expect(checkColors).toEqual([
          "rgb(255, 204, 0)",
          "rgb(62, 166, 255)",
        ]);
      } else {
        console.log("[probe] host exposed only one caption language; second-slot live assertion unavailable");
      }
      await expect(page.locator(".ytp-settings-menu")).toBeVisible();
      if (worker) {
        const langs = await worker.evaluate(
          () =>
            new Promise((resolve) =>
              chrome.storage.sync.get(["qt_captionLangs"], (s) =>
                resolve(s.qt_captionLangs || []),
              ),
            ),
        );
        expect(langs).toHaveLength(second ? 2 : 1);
        expect(langs[0]).toBe("en");
        if (second) expect(langs[1]).not.toBe("en");
      }
      if (await cc.isVisible().catch(() => false))
        await expect(cc).toHaveAttribute("aria-pressed", "false");
    } catch (err) {
      throw new Error(`settings/captions live probe failed: ${err.message}`);
    }
  });

  test("pins the Toolkit cluster in the active Shorts top-center lane", async () => {
    if (worker) {
      await worker.evaluate(() => {
        const values = {
          qt_paceLock: false,
          qt_trimSilence: false,
          qt_playbackRate: 1,
          qt_fixed1x: false,
          qt_wordHighlight: false,
          qt_centerWord: false,
          qt_dualCaptions: false,
          qt_captionLangs: [],
          qt_captionsEnabled: null,
          noDistractionsEnabled: false,
        };
        const write = () =>
          Promise.all(
            [chrome.storage.sync, chrome.storage.local].map(
              (area) => new Promise((resolve) => area.set(values, resolve)),
            ),
          );
        return write()
          .then(() => new Promise((resolve) => setTimeout(resolve, 500)))
          .then(write);
      });
    }

    const page = context.pages()[0] || (await context.newPage());
    const pageErrors = [];
    const timedtext = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", async (response) => {
      if (!response.url().includes(SELECTORS.timedtextPath)) return;
      const body = await response.text().catch(() => "");
      timedtext.push({ status: response.status(), bytes: body.length });
    });

    try {
      await page.goto(SHORTS_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (err) {
      test.skip(true, `YouTube Shorts navigation failed (network/block): ${err.message}`);
      return;
    }
    const blocked = await youtubeBlockReason(page);
    if (blocked) {
      test.skip(true, `YouTube blocked the Shorts probe: ${blocked}`);
      return;
    }

    const renderedPlayer = page.locator("#shorts-player.html5-video-player").first();
    try {
      await renderedPlayer.waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      const extra = (await youtubeBlockReason(page)) || page.url();
      test.skip(true, `YouTube did not render the Shorts player: ${extra}`);
      return;
    }
    /* Keep the caption-capable fixture from auto-advancing to an unrelated
       next Short while the probe exercises fade, geometry and the menu. */
    await renderedPlayer.locator("video").first().evaluate((video) => {
      video.loop = true;
      if (video.ended) video.currentTime = 0;
    });

    await revealShortsChrome(page, renderedPlayer);
    await page.waitForTimeout(300);
    await expect(page.locator("#qt-cluster")).toHaveCount(1);
    const cluster = page.locator("#qt-cluster");
    const player = cluster.locator("xpath=..");
    await expect(player).toBeVisible({ timeout: 20_000 });
    await expect(cluster.locator(".qt-cluster-label-full")).toHaveText(
      /^\d+(?:\.\d+)?x$/,
    );
    await expect(page.locator("#qt-time-pill")).toHaveCount(0);

    const ccBefore = await player.evaluate((root) =>
      typeof root.isSubtitlesOn === "function" ? root.isSubtitlesOn() : null,
    );
    expect(typeof ccBefore).toBe("boolean");

    await page.mouse.move(4, 4);
    await page.waitForTimeout(3000);
    await expect
      .poll(() =>
        player.evaluate((root) =>
          typeof root.isSubtitlesOn === "function" ? root.isSubtitlesOn() : null,
        ),
      )
      .toBe(ccBefore);
    await expect(player).not.toHaveClass(/qt-ours-on/);
    for (const id of ["#qt-cap-p", "#qt-cap-s"]) {
      const line = page.locator(id);
      if (await line.count()) await expect(line).toBeHidden();
    }

    /* The Toolkit surface follows effective native opacity, not the permanent
       ytp-autohide class carried by Shorts. Check parity in whatever state the
       real host reached, then re-expose native chrome before geometry. */
    const visibilityParity = await player.evaluate((root, selectors) => {
      const reel = root.closest("ytd-reel-video-renderer");
      const controls = reel?.querySelector(selectors.controls);
      const wrap = root.querySelector("#qt-cluster");
      const effectiveOpacity = (node, boundary) => {
        let opacity = 1;
        for (let cur = node; cur && cur.nodeType === 1; cur = cur.parentElement) {
          const style = getComputedStyle(cur);
          if (style.display === "none" || style.visibility === "hidden") return 0;
          opacity *= Number(style.opacity) || 0;
          if (cur === boundary) break;
        }
        return opacity;
      };
      return {
        native: controls ? effectiveOpacity(controls, reel) : -1,
        toolkit: wrap ? Number(getComputedStyle(wrap).opacity) : -1,
        inert: !!wrap?.inert,
      };
    }, SHORTS_CHROME_SELECTORS);
    expect(visibilityParity.native).toBeGreaterThanOrEqual(0);
    expect(Math.abs(visibilityParity.native - visibilityParity.toolkit)).toBeLessThanOrEqual(0.08);
    if (visibilityParity.native <= 0.02) expect(visibilityParity.inert).toBe(true);

    await revealShortsChrome(page, player);
    await page.waitForTimeout(300);
    await expect.poll(() => cluster.evaluate((wrap) => ({
      opacity: Number(getComputedStyle(wrap).opacity),
      inert: wrap.inert,
    }))).toEqual({ opacity: 1, inert: false });

    const geometry = await player.evaluate((root, selectors) => {
      const playerRect = root.getBoundingClientRect();
      const pill = root.querySelector("#qt-cluster .qt-chrome-cluster");
      const pillRect = pill.getBoundingClientRect();
      const reel = root.closest("ytd-reel-video-renderer");
      const chrome = reel && reel.querySelector(selectors.controls);
      const left = chrome && chrome.querySelector(selectors.left);
      const right = chrome && chrome.querySelector(selectors.right);
      if (!chrome || !left || !right) return { missingNativeChrome: true };
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const overlapArea = (a, b) =>
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const laneLeft = leftRect.right;
      const laneRight = rightRect.left;
      return {
        missingNativeChrome: false,
        laneCenterDelta: Math.abs(
          pillRect.left + pillRect.width / 2 - (laneLeft + laneRight) / 2,
        ),
        topDelta: Math.abs(pillRect.top - rightRect.top),
        heightDelta: Math.abs(pillRect.height - rightRect.height),
        laneWidth: laneRight - laneLeft,
        pillWidth: pillRect.width,
        leftWidth: leftRect.width,
        inside:
          pillRect.left >= playerRect.left &&
          pillRect.right <= playerRect.right &&
          pillRect.top >= playerRect.top &&
          pillRect.bottom <= playerRect.bottom,
        controlOverlaps: [
          overlapArea(pillRect, leftRect),
          overlapArea(pillRect, rightRect),
        ],
        wrapperPointerEvents: getComputedStyle(root.querySelector("#qt-cluster")).pointerEvents,
        pillPointerEvents: getComputedStyle(pill).pointerEvents,
      };
    }, SHORTS_CHROME_SELECTORS);
    expect(geometry.missingNativeChrome).toBe(false);
    expect(geometry.laneCenterDelta).toBeLessThanOrEqual(2);
    expect(geometry.topDelta).toBeLessThanOrEqual(1.5);
    expect(geometry.heightDelta).toBeLessThanOrEqual(1.5);
    expect(geometry.pillWidth).toBeLessThanOrEqual(geometry.laneWidth + 1);
    expect(geometry.inside).toBe(true);
    expect(geometry.controlOverlaps.every((area) => area === 0)).toBe(true);
    expect(geometry.wrapperPointerEvents).toBe("none");
    expect(geometry.pillPointerEvents).toBe("auto");

    /* Real-host proof for the distinct Shorts caption sheet. It must contain
       exactly the two word-paint controls, keep Dual out, retain native radio
       rows, and inherit their rendered row geometry. */
    const reel = player.locator("xpath=ancestor::ytd-reel-video-renderer[1]");
    const shortsCaptionMenu = await openShortsCaptionMenu(page, reel);
    const toolkitCaptionRows = shortsCaptionMenu.locator(
      ":scope > [data-qt-shorts-cap]",
    );
    await expect(toolkitCaptionRows).toHaveCount(2);
    expect(
      (await toolkitCaptionRows.allTextContents()).map((text) =>
        text.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(["Color highlight", "Center word"]);
    await expect(
      shortsCaptionMenu.locator("[data-qt-cap='qt_dualCaptions']"),
    ).toHaveCount(0);
    const shortsNativeRows = shortsCaptionMenu.locator(
      ":scope > [role='menuitemradio']:not([data-qt-cap])",
    );
    expect(await shortsNativeRows.count()).toBeGreaterThan(0);
    const rowParity = await shortsCaptionMenu.evaluate((root) => {
      const native = root.querySelector(
        ":scope > [role='menuitemradio']:not([data-qt-cap])",
      );
      const custom = Array.from(
        root.querySelectorAll(":scope > [data-qt-shorts-cap]"),
      );
      if (!native || custom.length !== 2) return { missing: true };
      const nativeStyle = getComputedStyle(native);
      const nativeRect = native.getBoundingClientRect();
      return {
        missing: false,
        heights: custom.map((row) => row.getBoundingClientRect().height),
        nativeHeight: nativeRect.height,
        fonts: custom.map((row) => getComputedStyle(row).font),
        nativeFont: nativeStyle.font,
        backgrounds: custom.map((row) => getComputedStyle(row).backgroundColor),
        nativeBackground: nativeStyle.backgroundColor,
      };
    });
    expect(rowParity.missing).toBe(false);
    expect(
      rowParity.heights.every(
        (height) => Math.abs(height - rowParity.nativeHeight) <= 1.5,
      ),
    ).toBe(true);
    expect(rowParity.fonts.every((font) => font === rowParity.nativeFont)).toBe(
      true,
    );
    expect(
      rowParity.backgrounds.every(
        (background) => background === rowParity.nativeBackground,
      ),
    ).toBe(true);
    await test.info().attach("shorts-caption-menu", {
      body: await shortsCaptionMenu.screenshot(),
      contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    await expect(toolkitCaptionRows.first()).toBeHidden({ timeout: 4000 });
    await expect
      .poll(() =>
        player.evaluate((root) =>
          typeof root.isSubtitlesOn === "function" ? root.isSubtitlesOn() : null,
        ),
      )
      .toBe(ccBefore);

    const volumeSurface = reel.locator(SHORTS_CHROME_SELECTORS.volume).first();
    expect(await volumeSurface.count(), "Shorts native volume surface is missing").toBe(1);
    await volumeSurface.hover({ force: true });
    await page.waitForTimeout(350);
    const expandedGeometry = await player.evaluate((root, selectors) => {
      const reelRoot = root.closest("ytd-reel-video-renderer");
      const controls = reelRoot?.querySelector(selectors.controls);
      const left = controls?.querySelector(selectors.left);
      const right = controls?.querySelector(selectors.right);
      const wrap = root.querySelector("#qt-cluster");
      const pill = wrap?.querySelector(".qt-chrome-cluster");
      if (!left || !right || !wrap || !pill) return { missing: true };
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const pillRect = pill.getBoundingClientRect();
      const overlapArea = (a, b) =>
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return {
        missing: false,
        leftWidth: leftRect.width,
        rawLaneWidth: rightRect.left - leftRect.right,
        pillWidth: pillRect.width,
        pillHeight: pillRect.height,
        opacity: Number(getComputedStyle(wrap).opacity),
        inert: wrap.inert,
        tight: wrap.classList.contains("qt-short-lane-tight"),
        overlaps: [overlapArea(pillRect, leftRect), overlapArea(pillRect, rightRect)],
      };
    }, SHORTS_CHROME_SELECTORS);
    expect(expandedGeometry.missing).toBe(false);
    expect(expandedGeometry.leftWidth).toBeGreaterThan(geometry.leftWidth + 2);
    if (!expandedGeometry.overlaps.every((area) => area === 0))
      console.log("[probe] Shorts expanded-lane diagnostic", {
        collapsed: geometry,
        expanded: expandedGeometry,
      });
    expect(expandedGeometry.overlaps.every((area) => area === 0)).toBe(true);
    if (expandedGeometry.rawLaneWidth >= 48) {
      expect(expandedGeometry.opacity).toBeGreaterThan(0.02);
      expect(expandedGeometry.pillWidth).toBeLessThanOrEqual(expandedGeometry.rawLaneWidth + 1);
      if (expandedGeometry.tight)
        expect(Math.abs(expandedGeometry.pillWidth - expandedGeometry.pillHeight)).toBeLessThanOrEqual(1);
    } else {
      expect(expandedGeometry.opacity).toBeLessThanOrEqual(0.02);
      expect(expandedGeometry.inert).toBe(true);
    }

    await revealShortsChrome(page, player);
    await page.waitForTimeout(350);
    await expect.poll(() => cluster.evaluate((wrap) => ({
      opacity: Number(getComputedStyle(wrap).opacity),
      inert: wrap.inert,
    }))).toEqual({ opacity: 1, inert: false });

    await cluster.locator(".qt-chrome-btn").click();
    const menu = player.locator(":scope > #qt-speed-menu");
    await expect(menu).toBeVisible();
    const menuGeometry = await player.evaluate((root) => {
      const playerRect = root.getBoundingClientRect();
      const pillRect = root
        .querySelector("#qt-cluster .qt-chrome-cluster")
        .getBoundingClientRect();
      const menuRect = root.querySelector("#qt-speed-menu").getBoundingClientRect();
      return {
        player: {
          left: playerRect.left,
          top: playerRect.top,
          right: playerRect.right,
          bottom: playerRect.bottom,
          width: playerRect.width,
          height: playerRect.height,
        },
        menu: {
          left: menuRect.left,
          top: menuRect.top,
          right: menuRect.right,
          bottom: menuRect.bottom,
          width: menuRect.width,
          height: menuRect.height,
        },
        centerDelta: Math.abs(
          menuRect.left + menuRect.width / 2 - (playerRect.left + playerRect.width / 2),
        ),
        belowPill: menuRect.top >= pillRect.bottom,
        inside:
          menuRect.left >= playerRect.left &&
          menuRect.right <= playerRect.right &&
          menuRect.bottom <= playerRect.bottom,
      };
    });
    expect(menuGeometry.centerDelta).toBeLessThanOrEqual(2);
    expect(menuGeometry.belowPill).toBe(true);
    if (!menuGeometry.inside)
      console.log("[probe] Shorts menu geometry diagnostic", menuGeometry);
    expect(menuGeometry.inside).toBe(true);

    expect(timedtext.length, `Shorts timedtext request storm: ${timedtext.length} requests`).toBeLessThanOrEqual(12);
    const label = (await cluster.textContent()) || "";
    const wpm = Number((label.match(/(\d+)\s*WPM/i) || [])[1] || 0);
    if (timedtext.some((item) => item.bytes > 0) || REQUIRE_WPM) {
      expect(wpm, `Shorts cluster stayed ${label}`).toBeGreaterThan(0);
    } else {
      /* Geometry, CC invariance and the request budget above are proven; the
         WPM claim is not. Record that rather than letting the run read green
         on a claim it did not test. */
      test.info().annotations.push({
        type: "unproven",
        description: `Shorts: geometry, CC invariance and request budget passed, but every timedtext body was empty over ${timedtext.length} requests, so WPM acquisition is NOT proven.`,
      });
    }

    const firstPath = new URL(page.url()).pathname;
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
      .not.toBe(firstPath);
    await expect(page.locator("#qt-cluster")).toHaveCount(1);
    const nextPlayer = page.locator("#qt-cluster").locator("xpath=..");
    await expect(nextPlayer).toBeVisible();
    await revealShortsChrome(page, nextPlayer);
    await expect
      .poll(() =>
        nextPlayer.locator(":scope > #qt-cluster").evaluate((wrap) => ({
          opacity: Number(getComputedStyle(wrap).opacity),
          inert: wrap.inert,
        })),
      )
      .toEqual({ opacity: 1, inert: false });
    await expect(nextPlayer.locator(":scope > #qt-speed-menu")).toBeHidden();
    await expect(page.locator("#qt-time-pill")).toHaveCount(0);
    const readNextGeometry = () => nextPlayer.evaluate((root, selectors) => {
      const pillRect = root
        .querySelector("#qt-cluster .qt-chrome-cluster")
        .getBoundingClientRect();
      const chrome = root
        .closest("ytd-reel-video-renderer")
        ?.querySelector(selectors.controls);
      const leftRect = chrome?.querySelector(selectors.left)?.getBoundingClientRect();
      const rightRect = chrome?.querySelector(selectors.right)?.getBoundingClientRect();
      if (!leftRect || !rightRect) return { missingNativeChrome: true };
      return {
        missingNativeChrome: false,
        laneCenterDelta: Math.abs(
          pillRect.left + pillRect.width / 2 -
            (leftRect.right + 4 + rightRect.left - 4) / 2,
        ),
        topDelta: Math.abs(pillRect.top - rightRect.top),
        heightDelta: Math.abs(pillRect.height - rightRect.height),
      };
    }, SHORTS_CHROME_SELECTORS);
    await expect
      .poll(async () => {
        const value = await readNextGeometry();
        return (
          !value.missingNativeChrome &&
          value.laneCenterDelta <= 2 &&
          value.topDelta <= 1.5 &&
          value.heightDelta <= 1.5
        );
      })
      .toBe(true);
    const nextGeometry = await readNextGeometry();
    expect(nextGeometry.missingNativeChrome).toBe(false);
    expect(nextGeometry.laneCenterDelta).toBeLessThanOrEqual(2);
    expect(nextGeometry.topDelta).toBeLessThanOrEqual(1.5);
    expect(nextGeometry.heightDelta).toBeLessThanOrEqual(1.5);
    expect(pageErrors).toEqual([]);
  });
});
