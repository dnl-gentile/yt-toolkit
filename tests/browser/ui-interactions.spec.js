const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

async function installChromeStub(page, initial = {}) {
  await page.evaluate((seed) => {
    window.__qtStorage = { ...seed };
    window.__qtMessages = [];
    window.__qtStorageListeners = [];
    const read = (keys) => {
      if (Array.isArray(keys))
        return Object.fromEntries(keys.map((key) => [key, window.__qtStorage[key]]));
      return { ...window.__qtStorage };
    };
    const area = {
      get(keys, cb) {
        cb(read(keys));
      },
      set(values, cb) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: window.__qtStorage[key], newValue: value };
          window.__qtStorage[key] = value;
        }
        window.__qtStorageListeners.forEach((fn) => fn(changes, "sync"));
        if (cb) cb();
      },
    };
    window.chrome = {
      storage: {
        sync: area,
        local: area,
        onChanged: {
          addListener(fn) {
            window.__qtStorageListeners.push(fn);
          },
        },
      },
      runtime: {
        id: "fixture",
        lastError: null,
        sendMessage(payload, cb) {
          window.__qtMessages.push(payload);
          if (typeof window.__qtMessageHandler === "function") {
            window.__qtMessageHandler(payload, cb || (() => {}));
            return;
          }
          if (cb) cb(null);
        },
      },
    };
  }, initial);
}

const MENU_FIXTURE = `
  <style>
    .ytp-settings-menu { display:block; visibility:visible; width:235px; }
    .ytp-panel-menu { width:235px; }
    .ytp-menuitem { width:235px; height:48px; display:grid;
      grid-template-columns:minmax(0, 1fr) auto; align-items:center; }
    .ytp-menuitem-label { grid-column:1; padding-left:35px; }
    .ytp-menuitem-content { grid-column:2; padding-right:15px; }
    .ytp-menuitem-toggle-checkbox { width:40px; height:24px; display:block; }
    .ytp-menuitem[aria-checked="true"] .ytp-menuitem-label {
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M1 6.5 4.5 10 11 2' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='square' stroke-linejoin='miter'/%3E%3C/svg%3E");
      background-size:12px 12px;
      background-position:10px center; background-repeat:no-repeat;
    }
  </style>
  <div id="movie_player">
    <button class="ytp-subtitles-button" aria-pressed="false">CC</button>
    <button class="ytp-settings-button">Settings</button>
    <div class="ytp-popup ytp-settings-menu">
      <div class="ytp-panel" data-panel="captions">
        <div class="ytp-panel-title">Subtitles/CC</div>
        <div class="ytp-panel-menu">
          <div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="false" data-row="off"><div class="ytp-menuitem-label">Off</div></div>
          <div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="true" data-row="en"><div class="ytp-menuitem-label">English</div></div>
          <div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="false" data-row="auto"><div class="ytp-menuitem-label">Auto-translate</div></div>
        </div>
      </div>
      <div class="ytp-panel" data-panel="auto">
        <div class="ytp-panel-title">Auto-translate</div>
        <div class="ytp-panel-menu">
          <div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="false" data-row="ar"><div class="ytp-menuitem-label">Arabic</div></div>
          <div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="false" data-row="ab"><div class="ytp-menuitem-label">Abkhazian</div></div>
        </div>
      </div>
    </div>
  </div>`;

async function readDualCheck(row) {
  const check = row.locator(".qt-dual-check");
  await expect(check).toHaveCount(1);
  return check.evaluate((el) => {
    const cs = getComputedStyle(el);
    const label = el.closest(".ytp-menuitem-label");
    const owner = el.closest("[data-qt-native-check-source]");
    const root = el.closest(".ytp-settings-menu");
    return {
      text: el.textContent || "",
      labelBeforeContent: label ? getComputedStyle(label, "::before").content : "none",
      source:
        owner?.getAttribute("data-qt-native-check-source") ||
        root?.getAttribute("data-qt-native-check-source") ||
        "",
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      maskImage: cs.maskImage || cs.webkitMaskImage || "none",
      width: Math.round(parseFloat(cs.width)),
      height: Math.round(parseFloat(cs.height)),
    };
  });
}

async function expectDualCheck(row, slot, color) {
  await expect(row).toHaveAttribute("data-qt-slot", String(slot));
  const paint = await readDualCheck(row);
  expect(paint.text).not.toContain("\u2713");
  expect(paint.labelBeforeContent).not.toContain("\u2713");
  expect(paint.source).not.toBe("");
  expect(paint.maskImage).not.toBe("none");
  expect(paint.width).toBe(12);
  expect(paint.height).toBe(12);
  expect([paint.backgroundColor, paint.color]).toContain(color);
}

test("Dual Subtitles owns click/keyboard without corrupting native rows", async ({ page }) => {
  await page.setContent(MENU_FIXTURE);
  await installChromeStub(page, {
    qt_dualCaptions: false,
    qt_wordHighlight: false,
    qt_centerWord: false,
    qt_captionLangs: [],
  });
  await page.evaluate(() => {
    window.QuietTube = {
      originalLang: "en",
      tracks: [{ languageCode: "en", name: "English", kind: "asr" }],
      translationLanguages: [
        { languageCode: "ar", name: "Arabic" },
        { languageCode: "ab", name: "Abkhazian" },
      ],
    };
    window.__nativeClicks = 0;
    document.querySelectorAll("[data-panel='auto'] .ytp-menuitem").forEach((row) => {
      row.addEventListener("click", () => {
        window.__nativeClicks++;
        document.querySelector(".ytp-settings-menu").style.display = "none";
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") row.click();
      });
    });
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles-toggles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });

  const dual = page.locator("[data-qt-cap='qt_dualCaptions']");
  await expect(dual).toBeVisible();
  const checkbox = dual.locator(".ytp-menuitem-toggle-checkbox");
  await expect(checkbox.locator("xpath=..")).toHaveClass(/ytp-menuitem-content/);
  expect(await dual.locator(".ytp-menuitem-label .ytp-menuitem-toggle-checkbox").count()).toBe(0);
  const geometry = await dual.evaluate((row) => {
    const rr = row.getBoundingClientRect();
    const tr = row.querySelector(".ytp-menuitem-toggle-checkbox").getBoundingClientRect();
    return { width: rr.width, rightInset: rr.right - tr.right };
  });
  expect(geometry.width).toBe(235);
  expect(geometry.rightInset).toBeGreaterThanOrEqual(8);
  expect(geometry.rightInset).toBeLessThanOrEqual(20);

  await dual.click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual(["en"]);
  const english = page.locator("[data-row='en']");
  await expectDualCheck(english, 0, "rgb(255, 204, 0)");

  const arabic = page.locator("[data-row='ar']");
  await arabic.click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "en",
    "tlang:ar",
  ]);
  await expectDualCheck(arabic, 1, "rgb(62, 166, 255)");
  expect(await page.evaluate(() => window.__nativeClicks)).toBe(0);
  await expect(page.locator(".ytp-settings-menu")).toBeVisible();

  /* A full pair is stable. Picking a third language must not silently replace
     the secondary slot; the user first deselects the slot they want to free. */
  const abkhazian = page.locator("[data-row='ab']");
  await abkhazian.focus();
  await abkhazian.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "en",
    "tlang:ar",
  ]);
  await expect(abkhazian.locator(".qt-dual-check")).toHaveCount(0);
  await expectDualCheck(english, 0, "rgb(255, 204, 0)");
  await expectDualCheck(arabic, 1, "rgb(62, 166, 255)");
  expect(await page.evaluate(() => window.__nativeClicks)).toBe(0);
  await expect(page.locator(".ytp-settings-menu")).toBeVisible();

  /* Removing the primary leaves a real vacancy. Slot 2 keeps both its identity
     and blue paint while it is the only selected language. */
  await english.click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "",
    "tlang:ar",
  ]);
  await expect(english).not.toHaveAttribute("data-qt-slot", /.+/);
  await expect(english.locator(".qt-dual-check")).toHaveCount(0);
  await expectDualCheck(arabic, 1, "rgb(62, 166, 255)");

  /* The next language fills that exact primary vacancy; it does not reorder
     or recolor the secondary selection. */
  await abkhazian.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "tlang:ab",
    "tlang:ar",
  ]);
  await expectDualCheck(abkhazian, 0, "rgb(255, 204, 0)");
  await expectDualCheck(arabic, 1, "rgb(62, 166, 255)");

  const chosen = await page.evaluate(() => window.__qtStorage.qt_captionLangs.slice());
  await page.locator("[data-row='off']:not([data-qt-cap])").click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual(chosen);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionsEnabled)).toBe(false);

  await dual.click();
  await expect(english).toHaveAttribute("aria-checked", "true");
  await expect(arabic).toHaveAttribute("aria-checked", "false");
  await expect(abkhazian).toHaveAttribute("aria-checked", "false");
  await expect(english).not.toHaveClass(/qt-dual-lang/);
  await expect(english).not.toHaveAttribute("data-qt-slot", /.+/);

  await arabic.click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "tlang:ar",
  ]);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionsEnabled)).toBe(true);
  expect(await page.evaluate(() => window.__nativeClicks)).toBe(1);
});

test("explicit CC state is restored without coupling it to timedtext acquisition", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" class="captions-enabled">
        <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=A");
  await installChromeStub(page, {
    qt_captionsEnabled: false,
    qt_dualCaptions: false,
    qt_captionLangs: ["tlang:pt"],
  });
  await page.evaluate(() => {
    window.__bindCc = (player) => {
      const button = player.querySelector(".ytp-subtitles-button");
      button.addEventListener("click", () => {
        const next = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(next));
        player.classList.toggle("captions-enabled", next);
      });
    };
    window.__bindCc(document.querySelector("#movie_player"));
  });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });

  const cc = page.locator(".ytp-subtitles-button");
  await expect(cc).toHaveAttribute("aria-pressed", "false");
  await cc.click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionsEnabled)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "tlang:pt",
  ]);

  await page.evaluate(() => {
    const old = document.querySelector("#movie_player");
    const player = document.createElement("div");
    player.id = "movie_player";
    player.innerHTML = '<button class="ytp-subtitles-button" aria-pressed="false">CC</button>';
    old.replaceWith(player);
    window.__bindCc(player);
    history.replaceState({}, "", "/watch?v=B");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect(page.locator(".ytp-subtitles-button")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "tlang:pt",
  ]);
});

test("delayed native settings render still hides Playback speed", async ({ page }) => {
  await page.setContent(`
    <style>.ytp-settings-menu{display:none}.ytp-menuitem{height:48px}</style>
    <div id="movie_player"><button class="ytp-settings-button">Settings</button>
      <div class="ytp-popup ytp-settings-menu"><div class="ytp-panel"><div class="ytp-panel-menu">
        <div class="ytp-menuitem"><div class="ytp-menuitem-label">Stable Volume</div></div>
        <div class="ytp-menuitem" data-speed><div class="ytp-menuitem-label">Playback speed</div><div class="ytp-menuitem-content">Normal</div></div>
        <div class="ytp-menuitem"><div class="ytp-menuitem-label">Quality</div></div>
      </div></div></div></div>`);
  await installChromeStub(page, {});
  await page.evaluate(() => {
    document.querySelector(".ytp-settings-button").addEventListener("click", () => {
      setTimeout(() => {
        document.querySelector(".ytp-settings-menu").style.display = "block";
      }, 140);
    });
  });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });
  await page.locator(".ytp-settings-button").click();
  await expect(page.locator(".ytp-settings-menu")).toBeVisible();
  await expect(page.locator("[data-speed]")).toBeHidden();
  await expect(page.locator("[data-speed]")).toHaveAttribute("data-qt-hidden-speed", "1");
});

test("Toolkit and native speed menus close each other without closing both", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>#movie_player{position:relative;width:960px;height:540px}.ytp-settings-button{position:absolute;right:12px;bottom:12px;z-index:100}.ytp-settings-menu{display:block;width:250px;height:220px}</style>
        <div id="movie_player"><video class="html5-main-video"></video>
          <button class="ytp-settings-button">Settings</button>
          <div class="ytp-popup ytp-settings-menu">Native settings</div>
          <div class="ytp-left-controls"></div></div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=fixture");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 180,
    qt_playbackRate: 1,
    qt_wordHighlight: false,
    qt_centerWord: false,
  });
  await page.evaluate(() => {
    const gear = document.querySelector(".ytp-settings-button");
    gear.addEventListener("click", () => {
      const menu = document.querySelector(".ytp-settings-menu");
      const wasOpen = getComputedStyle(menu).display !== "none";
      setTimeout(() => {
        menu.style.display = wasOpen ? "none" : "block";
      }, 650);
    });
  });
  for (const file of ["styles.css", "styles-overlay.css", "styles-toggles.css"])
    await page.addStyleTag({ path: path.join(ROOT, file) });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  const ownButton = page.locator("#qt-cluster .qt-chrome-btn");
  const ownMenu = page.locator("#qt-speed-menu");
  const nativeMenu = page.locator(".ytp-settings-menu");
  await expect(ownButton).toBeVisible();
  await ownButton.click();
  await expect(nativeMenu).toBeHidden({ timeout: 1500 });
  await expect(ownMenu).toBeVisible({ timeout: 1500 });

  await ownMenu.locator("[data-rate='3']").click();
  await expect
    .poll(() => page.locator("video").evaluate((v) => v.playbackRate))
    .toBe(3);
  await expect(page.locator("#qt-cluster .qt-cluster-label")).toContainText("3x");
  await expect(ownMenu.locator(".qt-menu-sub")).toContainText("3x");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(3);

  await page.locator(".ytp-settings-button").click();
  await expect(ownMenu).toBeHidden();
  await expect(nativeMenu).toBeVisible({ timeout: 1500 });
});

test("speed menu copies the active native YouTube popup surface before closing it", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>
          #movie_player{position:relative;width:960px;height:540px}
          .ytp-settings-menu{
            display:block;width:250px;height:220px;
            background-color:rgba(9,17,25,.42);
            background-image:linear-gradient(rgba(255,255,255,.04),rgba(0,0,0,.03));
            background-blend-mode:luminosity;
            border:1px solid rgba(255,255,255,.14);
            border-radius:19px;
            box-shadow:0 7px 24px rgba(0,0,0,.28);
            -webkit-backdrop-filter:blur(7px);
            backdrop-filter:blur(7px);
            text-shadow:none;
          }
        </style>
        <div id="movie_player" class="html5-video-player ytp-delhi-modern">
          <video class="html5-main-video"></video>
          <button class="ytp-settings-button">Settings</button>
          <div class="ytp-popup ytp-settings-menu stale-settings-menu"
            style="display:none;background:rgba(255,0,0,.9)">Stale settings</div>
          <div class="ytp-popup ytp-settings-menu active-settings-menu">Native settings</div>
          <div class="ytp-left-controls"></div>
        </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=menu-paint");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 180,
    qt_playbackRate: 1,
  });
  await page.evaluate(() => {
    const read = (el) => {
      const style = getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backgroundBlendMode: style.backgroundBlendMode,
        borderRadius: style.borderRadius,
        borderTop: style.borderTop,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
        textShadow: style.textShadow,
      };
    };
    window.__nativeMenuPaint = read(document.querySelector(".active-settings-menu"));
    document.querySelector(".ytp-settings-button").addEventListener("click", () => {
      document.querySelector(".active-settings-menu")?.remove();
    });
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await expect(page.locator("#qt-speed-menu")).toBeVisible();
  const paint = await page.evaluate(() => {
    const read = (el) => {
      const style = getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backgroundBlendMode: style.backgroundBlendMode,
        borderRadius: style.borderRadius,
        borderTop: style.borderTop,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
        textShadow: style.textShadow,
      };
    };
    return {
      native: window.__nativeMenuPaint,
      toolkit: read(document.getElementById("qt-speed-menu")),
      vars: document.getElementById("movie_player").style.cssText,
    };
  });
  expect(paint.toolkit).toEqual(paint.native);
  expect(paint.vars).toContain("--qt-native-menu-background-color");

  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await page.evaluate(() => {
    document.getElementById("movie_player").style.cssText = "";
  });
  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await expect(page.locator("#qt-speed-menu")).toBeVisible();
  const restored = await page.locator("#qt-speed-menu").evaluate((menu) => {
    const style = getComputedStyle(menu);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backgroundBlendMode: style.backgroundBlendMode,
      borderRadius: style.borderRadius,
      borderTop: style.borderTop,
      boxShadow: style.boxShadow,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
      textShadow: style.textShadow,
    };
  });
  expect(restored).toEqual(paint.native);
});

test("modern speed menu follows YouTube surface tokens before the native popup exists", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" class="html5-video-player ytp-delhi-modern"
          style="position:relative;width:960px;height:540px;--yt-sys-color-baseline--overlay-background-medium:rgba(4,18,32,.58);--yt-frosted-glass-backdrop-filter-override:blur(9px)">
          <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
        </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=menu-token-fallback");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 180,
    qt_playbackRate: 1,
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await expect(page.locator("#qt-speed-menu")).toBeVisible();
  const paint = await page.locator("#qt-speed-menu").evaluate((menu) => {
    const style = getComputedStyle(menu);
    return {
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
      borderRadius: style.borderRadius,
    };
  });
  expect(paint).toEqual({
    backgroundColor: "rgba(4, 18, 32, 0.58)",
    backdropFilter: "blur(9px)",
    borderRadius: "12px",
  });
});

test("manual speed and settings survive an A to B SPA video replacement", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=A");
  const settings = {
    qt_playbackRate: 1.75,
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 250,
    qt_wordHighlight: true,
    qt_centerWord: true,
    qt_dualCaptions: true,
    qt_captionLangs: ["en", "tlang:pt"],
    qt_captionsEnabled: false,
  };
  await installChromeStub(page, settings);
  await page.evaluate(() => {
    window.__bindRate = (video) => {
      let rate = 1;
      Object.defineProperties(video, {
        duration: { configurable: true, get: () => 60 },
        currentTime: { configurable: true, get: () => 5 },
        paused: { configurable: true, get: () => true },
        ended: { configurable: true, get: () => false },
        playbackRate: {
          configurable: true,
          get: () => rate,
          set: (value) => {
            rate = Number(value);
            video.dispatchEvent(new Event("ratechange"));
            if (
              video.dataset.resetOnce === "1" &&
              rate === 1.5 &&
              (video.__qtHostResetCount || 0) < 2
            ) {
              video.__qtHostResetCount = (video.__qtHostResetCount || 0) + 1;
              setTimeout(() => {
                rate = 1;
                video.dispatchEvent(new Event("ratechange"));
              }, 20);
            }
          },
        },
      });
    };
    window.__bindRate(document.querySelector("video"));
  });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.75);
  await page.evaluate(() => {
    const old = document.querySelector("video");
    const next = document.createElement("video");
    next.className = "html5-main-video";
    old.replaceWith(next);
    window.__bindRate(next);
    history.replaceState({}, "", "/watch?v=B");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.75);
  expect(await page.evaluate(() => ({ ...window.__qtStorage }))).toMatchObject(settings);
});

test("a new video clears persisted caption bottom offsets", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=POS-A");
  await installChromeStub(page, {
    qt_playbackRate: 1,
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_captionPos: {
      p: { x: 0, bottom: 222 },
      s: { x: 0, bottom: 333 },
    },
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => 5 },
      paused: { configurable: true, get: () => true },
      ended: { configurable: true, get: () => false },
    });
  });
  for (const file of ["lib/prefs.js", "lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await page.evaluate(() => {
    history.replaceState({}, "", "/watch?v=POS-B");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_captionPos)).toEqual({
    p: { x: 0, bottom: null },
    s: { x: 0, bottom: null },
  });
});

test("automatic rate control yields during ads and restores after the ad", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" class="html5-video-player ad-showing" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=AD-RATE");
  await installChromeStub(page, {
    qt_playbackRate: 1.75,
    qt_paceLock: false,
    qt_trimSilence: false,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    let rate = 1;
    window.__qtRateWrites = 0;
    window.__hostRate = (value) => {
      rate = Number(value);
      video.dispatchEvent(new Event("ratechange"));
    };
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => 5 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => {
          window.__qtRateWrites++;
          rate = Number(value);
          video.dispatchEvent(new Event("ratechange"));
        },
      },
    });
  });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => ({
      rate: document.querySelector("video").playbackRate,
      writes: window.__qtRateWrites,
    })),
  ).toEqual({ rate: 1, writes: 0 });

  await page.locator("#movie_player").evaluate((player) => player.classList.remove("ad-showing"));
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.75);
  expect(await page.evaluate(() => window.__qtRateWrites)).toBe(1);

  await page.locator("#movie_player").evaluate((player) => player.classList.add("ad-showing"));
  await page.evaluate(() => window.__hostRate(1));
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => ({
      rate: document.querySelector("video").playbackRate,
      writes: window.__qtRateWrites,
    })),
  ).toEqual({ rate: 1, writes: 1 });

  await page.locator("#movie_player").evaluate((player) => player.classList.remove("ad-showing"));
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.75);
  expect(await page.evaluate(() => window.__qtRateWrites)).toBe(2);
});

test("turning Pace Lock off restores and presents the saved manual speed in x", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=LOCK");
  await installChromeStub(page, {
    qt_playbackRate: 1.5,
    qt_paceLock: true,
    qt_trimSilence: false,
    qt_targetWpm: 180,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    let rate = 1.5;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => 4.05 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => {
          rate = Number(value);
          video.dispatchEvent(new Event("ratechange"));
        },
      },
    });
  });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  const body = JSON.stringify({
    events: Array.from({ length: 10 }, (_, i) => ({
      tStartMs: i * 1000,
      dDurationMs: 900,
      segs: [{ utf8: "slow" + i }],
    })),
  });
  await page.evaluate((text) => window.postMessage({
    source: "quiettube", type: "QT_TIMEDTEXT", videoId: "LOCK",
    url: "https://www.youtube.com/api/timedtext?v=LOCK&lang=en&kind=asr",
    lang: "en", original: true, text,
  }, "*"), body);

  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).not.toBe(1.5);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.5);
  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await page.locator("#qt-speed-menu [data-toggle='paceLock']").click();
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.5);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.5);

  const menu = page.locator("#qt-speed-menu");
  await expect(menu.locator(".qt-menu-head span")).toHaveText("Playback speed");
  await expect(menu.locator("[data-act='wpm-range']")).toHaveCount(0);
  await expect(menu.locator("#qt-big")).toHaveText("1.5x");
  const rateRange = menu.locator("[data-act='rate-range']");
  await expect(rateRange).toHaveValue("1.5");
  await expect(rateRange).toHaveAttribute("aria-valuetext", "1.5x");
  expect(await menu.locator("[data-rate]").allTextContents()).toEqual([
    "1x",
    "1.25x",
    "1.5x",
    "2x",
    "3x",
  ]);

  await rateRange.evaluate((range) => {
    range.value = "1.75";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(menu.locator("#qt-big")).toHaveText("1.75x");
  await expect(rateRange).toHaveAttribute("aria-valuetext", "1.75x");
  await rateRange.evaluate((range) =>
    range.dispatchEvent(new Event("change", { bubbles: true })),
  );
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.75);

  /* A storage/ASR transition can land while a range owns the pointer. The
     connected popup must still swap its complete unit system, and the removed
     range must not leave the module permanently in a dragging state. */
  await page.evaluate(() => chrome.storage.sync.set({ qt_paceLock: true }));
  await expect(menu.locator("[data-act='wpm-range']")).toHaveCount(1);
  await menu.locator("[data-act='wpm-range']").evaluate((range) =>
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
  );
  expect(await page.evaluate(() => window.QuietTube._dragging)).toBe(true);
  await page.evaluate(() => chrome.storage.sync.set({ qt_paceLock: false }));
  await expect(menu.locator(".qt-menu-head span")).toHaveText("Playback speed");
  await expect(menu.locator("[data-act='wpm-range']")).toHaveCount(0);
  await expect(menu.locator("[data-act='rate-range']")).toHaveValue("1.75");
  expect(await page.evaluate(() => window.QuietTube._dragging)).toBe(false);

  await page.evaluate(() => {
    window.__qtRateWrites = 0;
    const originalSet = chrome.storage.sync.set.bind(chrome.storage.sync);
    chrome.storage.sync.set = (values, callback) => {
      if (Object.prototype.hasOwnProperty.call(values, "qt_playbackRate"))
        window.__qtRateWrites++;
      return originalSet(values, callback);
    };
  });
  await menu.locator("[data-act='rate-range']").evaluate((range) => {
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    range.value = "2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(2);
  expect(await page.evaluate(() => window.__qtRateWrites)).toBe(1);

  const cancelledRange = menu.locator("[data-act='rate-range']");
  await cancelledRange.evaluate((range) => {
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    range.value = "2.5";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => chrome.storage.sync.set({ qt_trimSilence: true }));
  await expect(
    menu.locator("[data-toggle='trimSilence'] [role='switch']"),
  ).toHaveAttribute("aria-checked", "true");
  await cancelledRange.evaluate((range) => {
    range.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    /* Chromium may deliver this after cancellation even though renderMenu
       detached the old range. It must not promote the cancelled preview. */
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2);
  expect(
    await page.evaluate(() => ({
      dragging: window.QuietTube._dragging,
      manual: window.QuietTube._userRate,
      saved: window.__qtStorage.qt_playbackRate,
      trim: window.QuietTube.state.trimSilence,
      writes: window.__qtRateWrites,
    })),
  ).toEqual({ dragging: false, manual: 2, saved: 2, trim: true, writes: 1 });

  await menu.locator("[data-act='rate-range']").evaluate((range) => {
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    range.value = "2.5";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => document.dispatchEvent(new Event("yt-navigate-finish")));
  await expect(menu).toBeHidden();
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2);
  expect(
    await page.evaluate(() => ({
      dragging: window.QuietTube._dragging,
      manual: window.QuietTube._userRate,
      saved: window.__qtStorage.qt_playbackRate,
      writes: window.__qtRateWrites,
    })),
  ).toEqual({ dragging: false, manual: 2, saved: 2, writes: 1 });

  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await expect(menu).toBeVisible();

  await page.evaluate(() => chrome.storage.sync.set({ qt_paceLock: true }));
  await expect(menu.locator("[data-act='wpm-range']")).toHaveCount(1);
  const steadyMutations = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const target = document.getElementById("qt-speed-menu");
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.length;
    });
    observer.observe(target, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    observer.disconnect();
    return count;
  });
  expect(steadyMutations, "an unchanged open WPM menu must be mutation-free").toBe(0);
});

test("A and Shift+Backquote toggle neutral 1x without overwriting custom Lock or Trim", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=NEUTRAL");
  const settings = {
    qt_playbackRate: 1.5,
    qt_fixed1x: false,
    qt_paceLock: true,
    qt_trimSilence: true,
    qt_targetWpm: 120,
  };
  await installChromeStub(page, settings);
  await page.evaluate(() => {
    const video = document.querySelector("video");
    window.__qtCurrentTime = 4.05;
    window.__qtPaused = true;
    let rate = 1;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => window.__qtCurrentTime },
      paused: { configurable: true, get: () => window.__qtPaused },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => {
          rate = Number(value);
          video.dispatchEvent(new Event("ratechange"));
        },
      },
    });
  });
  for (const file of [
    "lib/prefs.js",
    "lib/timedtext.js",
    "lib/wpm.js",
    "lib/clock.js",
    "content/pace.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  const body = JSON.stringify({
    events: Array.from({ length: 12 }, (_, i) => ({
      tStartMs: i * 500,
      dDurationMs: 450,
      segs: [{ utf8: "word" + i }],
    })),
  });
  await page.evaluate(
    (text) =>
      window.postMessage(
        {
          source: "quiettube",
          type: "QT_TIMEDTEXT",
          videoId: "NEUTRAL",
          url: "https://www.youtube.com/api/timedtext?v=NEUTRAL&lang=en&kind=asr",
          lang: "en",
          original: true,
          asr: true,
          text,
        },
        "*",
      ),
    body,
  );
  await expect.poll(() => page.evaluate(() => window.QuietTube.asrRhythm())).toBe(true);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  const customWatchSeconds = await page.evaluate(() => window.QuietTube.watchSecs(0, 60));
  expect(customWatchSeconds, "the armed custom Trim profile must affect the adjusted clock").toBeLessThan(
    10,
  );

  const effectiveState = () =>
    page.evaluate(() => ({
      neutral: window.QuietTube._hold1x,
      lock: window.QuietTube.lockOn(),
      trim: window.QuietTube.trimOn(),
      savedLock: window.QuietTube.state.paceLock,
      savedTrim: window.QuietTube.state.trimSilence,
    }));
  const menuState = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll("#qt-speed-menu [data-toggle]")).map((row) => [
          row.getAttribute("data-toggle"),
          {
            checked: row.querySelector("[role='switch']")?.getAttribute("aria-checked"),
            disabled: row.getAttribute("aria-disabled"),
          },
        ]),
      ),
    );

  /* YouTube uses web components around editable controls. The document-level
     shortcut must inspect the composed path, not only the retargeted host. */
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "shortcut-shadow-host";
    host.attachShadow({ mode: "open" }).innerHTML = '<input aria-label="Search fixture">';
    document.body.appendChild(host);
  });
  const shadowInput = page.locator("#shortcut-shadow-host input");
  await shadowInput.focus();
  await page.keyboard.press("a");
  expect(await page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await shadowInput.evaluate((input) => input.blur());

  /* A closed shadow root retargets the key event to its host. */
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "closed-search-host";
    const root = host.attachShadow({ mode: "closed" });
    const input = document.createElement("input");
    root.appendChild(input);
    document.body.appendChild(host);
    window.__qtClosedInput = input;
    input.focus();
  });
  await page.keyboard.press("a");
  expect(await page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await page.evaluate(() => window.__qtClosedInput.blur());

  /* Native dialogs own the keyboard while open; video shortcuts stay inert. */
  await page.evaluate(() => {
    const dialog = document.createElement("yt-hotkey-dialog-renderer");
    dialog.id = "shortcut-dialog";
    dialog.style.cssText = "display:block;width:320px;height:240px";
    dialog.innerHTML = "<button>Close</button>";
    document.body.appendChild(dialog);
    dialog.querySelector("button").focus();
  });
  await page.keyboard.press("a");
  await page.keyboard.press("d");
  expect(await page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  expect(await page.evaluate(() => window.__qtStorage.qt_targetWpm)).toBe(120);
  await page.evaluate(() => document.getElementById("shortcut-dialog").remove());

  /* YouTube retains popup dialogs under transparent/inert ancestors after
     closing them. Their own box can remain non-zero, but they must not keep
     blocking playback shortcuts once the complete rendered chain is hidden. */
  await page.evaluate(() => {
    const popup = document.createElement("ytd-popup-container");
    popup.id = "closed-popup-fixture";
    popup.style.cssText = "display:block;opacity:0;pointer-events:none";
    popup.innerHTML =
      '<div role="dialog" style="display:block;width:320px;height:240px"></div>';
    document.body.appendChild(popup);
  });

  /* The custom configuration already happens to produce 1x. The shortcut
     must still enter neutral mode and turn both pace features effectively off. */
  await page.keyboard.press("a");
  await expect.poll(effectiveState).toEqual({
    neutral: true,
    lock: false,
    trim: false,
    savedLock: true,
    savedTrim: true,
  });
  await page.evaluate(() => document.getElementById("closed-popup-fixture").remove());
  expect(await page.evaluate(() => window.QuietTube.watchSecs(0, 60))).toBe(60);
  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await expect.poll(menuState).toEqual({
    paceLock: { checked: "false", disabled: "true" },
    trimSilence: { checked: "false", disabled: "true" },
  });
  const neutralRateControls = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "#qt-speed-menu [data-rate], #qt-speed-menu [data-act='rate-'], " +
          "#qt-speed-menu [data-act='rate+'], #qt-speed-menu [data-act='rate-range']",
      ),
    ).map((control) => ({
      disabled: control.disabled,
      ariaDisabled: control.getAttribute("aria-disabled"),
    })),
  );
  expect(neutralRateControls.length).toBeGreaterThan(0);
  for (const control of neutralRateControls) {
    expect(control.disabled).toBe(false);
    expect(control.ariaDisabled).not.toBe("true");
  }
  /* Merely opening the editable controls is still reversible. */
  expect(await page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  expect(await page.evaluate(() => ({ ...window.__qtStorage }))).toMatchObject({
    ...settings,
    qt_fixed1x: true,
  });

  await page.keyboard.press("Shift+Backquote");
  await expect.poll(effectiveState).toEqual({
    neutral: false,
    lock: true,
    trim: true,
    savedLock: true,
    savedTrim: true,
  });
  expect(await page.evaluate(() => window.QuietTube.watchSecs(0, 60))).toBeCloseTo(
    customWatchSeconds,
    5,
  );
  await expect.poll(menuState).toEqual({
    paceLock: { checked: "true", disabled: "false" },
    trimSilence: { checked: "true", disabled: "false" },
  });
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);

  /* D leaves neutral mode and increases the active Lock target; S reverses it. */
  await page.keyboard.press("Shift+Backquote");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await page.keyboard.press("d");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_targetWpm)).toBe(130);
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await page.keyboard.press("s");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_targetWpm)).toBe(120);

  /* Both neutral shortcuts still work in both directions. */
  await page.keyboard.press("Shift+Backquote");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await page.keyboard.press("a");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  expect(await page.evaluate(() => ({ ...window.__qtStorage }))).toMatchObject(settings);

  /* An explicit multiplier edit leaves neutral at the value shown (1x),
     switches to manual mode, and survives subsequent watchdog ticks. */
  await page.keyboard.press("a");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await expect(page.locator("#qt-speed-menu [data-act='rate-range']")).toHaveValue("1");
  await page.locator("#qt-speed-menu [data-act='rate+']").click();
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_paceLock)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.25);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.25);
  await page.waitForTimeout(420);
  expect(await page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.25);

  await page.keyboard.press("a");
  await page.locator("#qt-speed-menu [data-act='rate-']").click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(0.75);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(0.75);

  await page.keyboard.press("a");
  await page.locator("#qt-speed-menu [data-rate='3']").click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(3);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(3);

  await page.keyboard.press("a");
  await page.locator("#qt-speed-menu [data-act='rate-range']").evaluate((range) => {
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    range.value = "1.8";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    range.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.8);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.8);
  expect(await page.evaluate(() => window.__qtStorage.qt_trimSilence)).toBe(true);

  /* With Lock off, D/S apply the documented 0.25x manual-speed step. */
  await page.keyboard.press("d");
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(
    2.05,
  );
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(2.05);
  await page.keyboard.press("s");
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.8);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.8);

  /* Trim must recover to the saved manual rate on the first spoken word. */
  await page.evaluate(() => {
    window.__qtPaused = false;
    window.__qtCurrentTime = 10;
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(8);
  await expect.poll(() => page.evaluate(() => window.QuietTube._trimBoost)).toBe(true);
  await page.evaluate(() => {
    window.__qtCurrentTime = 5.5;
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.8);
  await expect.poll(() => page.evaluate(() => window.QuietTube._trimBoost)).toBe(false);
  expect(await page.evaluate(() => window.QuietTube.watchSecs(0, 1))).toBeCloseTo(1 / 1.8, 5);
});

test("persisted fixed 1x survives boot and SPA video replacement and syncs across tabs", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=FIXED-A");
  await installChromeStub(page, {
    qt_playbackRate: 1.75,
    qt_fixed1x: true,
    qt_paceLock: false,
    qt_trimSilence: true,
    qt_targetWpm: 250,
  });
  await page.evaluate(() => {
    window.__qtBindFixedVideo = (video) => {
      let rate = 1;
      Object.defineProperties(video, {
        duration: { configurable: true, get: () => 60 },
        currentTime: { configurable: true, get: () => 5 },
        paused: { configurable: true, get: () => true },
        ended: { configurable: true, get: () => false },
        playbackRate: {
          configurable: true,
          get: () => rate,
          set: (value) => {
            rate = Number(value);
            video.dispatchEvent(new Event("ratechange"));
          },
        },
      });
    };
    window.__qtBindFixedVideo(document.querySelector("video"));
  });
  for (const file of [
    "lib/prefs.js",
    "lib/timedtext.js",
    "lib/wpm.js",
    "lib/clock.js",
    "content/pace.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  expect(await page.evaluate(() => ({ ...window.__qtStorage }))).toMatchObject({
    qt_playbackRate: 1.75,
    qt_fixed1x: true,
    qt_paceLock: false,
    qt_trimSilence: true,
    qt_targetWpm: 250,
  });

  await page.evaluate(() => {
    const old = document.querySelector("video");
    const next = document.createElement("video");
    next.className = "html5-main-video";
    old.replaceWith(next);
    window.__qtBindFixedVideo(next);
    history.replaceState({}, "", "/watch?v=FIXED-B");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(true);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.75);

  /* An update from another extension tab must apply immediately. */
  await page.evaluate(() => chrome.storage.sync.set({ qt_fixed1x: false }));
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.75);
  await page.evaluate(() => chrome.storage.sync.set({ qt_fixed1x: true }));
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);

  await page.keyboard.press("d");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(2);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2);
  expect(await page.evaluate(() => window.__qtStorage.qt_trimSilence)).toBe(true);
});

test("leaving persisted fixed 1x restores the active watch player, not a stale miniplayer", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<ytd-miniplayer active style="display:none">
          <div id="movie_player" class="html5-video-player stale-player">
            <video class="html5-main-video" data-video="stale"></video>
          </div>
        </ytd-miniplayer>
        <ytd-watch-flexy>
          <ytd-player>
            <div class="html5-video-player active-watch-player">
              <video class="html5-main-video" data-video="active-a"></video>
              <div class="ytp-left-controls"></div>
            </div>
          </ytd-player>
        </ytd-watch-flexy>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=FIXED-ACTIVE-A");
  await installChromeStub(page, {
    qt_playbackRate: 1.5,
    qt_fixed1x: true,
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 250,
  });
  await page.evaluate(() => {
    window.__qtBindWatchPlayer = (player, videoId) => {
      player.getPlayerResponse = () => ({ videoDetails: { videoId } });
      const video = player.querySelector("video");
      let rate = 1;
      Object.defineProperties(video, {
        duration: { configurable: true, get: () => 60 },
        currentTime: { configurable: true, get: () => 5 },
        paused: { configurable: true, get: () => true },
        ended: { configurable: true, get: () => false },
        playbackRate: {
          configurable: true,
          get: () => rate,
          set: (value) => {
            rate = Number(value);
            video.dispatchEvent(new Event("ratechange"));
            if (
              video.dataset.resetBurst === "1" &&
              rate === 1.5 &&
              (video.__qtHostResetCount || 0) < 2
            ) {
              video.__qtHostResetCount = (video.__qtHostResetCount || 0) + 1;
              setTimeout(() => {
                rate = 1;
                video.dispatchEvent(new Event("ratechange"));
              }, 20);
            }
          },
        },
      });
    };
    window.__qtBindWatchPlayer(
      document.querySelector(".stale-player"),
      "FIXED-ACTIVE-A",
    );
    window.__qtBindWatchPlayer(
      document.querySelector(".active-watch-player"),
      "FIXED-ACTIVE-A",
    );
  });
  for (const file of [
    "lib/prefs.js",
    "lib/timedtext.js",
    "lib/wpm.js",
    "lib/clock.js",
    "content/pace.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await page.evaluate(() => {
    const old = document.querySelector(".active-watch-player");
    const next = document.createElement("div");
    next.className = "html5-video-player active-watch-player";
    next.innerHTML =
      '<video class="html5-main-video" data-video="active-b"></video>' +
      '<div class="ytp-left-controls"></div>';
    old.replaceWith(next);
    window.__qtBindWatchPlayer(next, "FIXED-ACTIVE-B");
    history.replaceState({}, "", "/watch?v=FIXED-ACTIVE-B");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await expect
    .poll(() =>
      page.locator('[data-video="active-b"]').evaluate((video) => video.playbackRate),
    )
    .toBe(1);

  await page.keyboard.press("Shift+Backquote");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect
    .poll(() =>
      page.locator('[data-video="active-b"]').evaluate((video) => video.playbackRate),
    )
    .toBe(1.5);
  expect(
    await page.locator('[data-video="stale"]').evaluate((video) => video.playbackRate),
  ).toBe(1);
  await expect(
    page.locator(".active-watch-player #qt-cluster .qt-cluster-label"),
  ).toContainText("1.5x");

  /* YouTube can replace the watch player without changing the video id
     (quality/ad/player recreation). The navigation event must invalidate the
     resolved node before its same-video fast path returns. */
  await page.keyboard.press("Shift+Backquote");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await page.evaluate(() => {
    const old = document.querySelector(".active-watch-player");
    const next = document.createElement("div");
    next.className = "html5-video-player active-watch-player";
    next.innerHTML =
      '<video class="html5-main-video" data-video="active-b-replacement" data-reset-burst="1"></video>' +
      '<div class="ytp-left-controls"></div>';
    old.replaceWith(next);
    window.__qtDetachedActiveWatch = old;
    window.__qtBindWatchPlayer(next, "FIXED-ACTIVE-B");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await page.keyboard.press("Shift+Backquote");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(false);
  await page.waitForTimeout(300);
  await expect
    .poll(() =>
      page
        .locator('[data-video="active-b-replacement"]')
        .evaluate((video) => video.playbackRate),
    )
    .toBe(1.5);
  expect(
    await page.evaluate(
      () => window.__qtDetachedActiveWatch.querySelector("video").playbackRate,
    ),
  ).toBe(1);
});

test("trim boost is visible on the pace pill and never feeds the clock", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=TRIM-PILL");
  await installChromeStub(page, {
    qt_playbackRate: 1.8,
    qt_paceLock: false,
    qt_trimSilence: true,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    window.__qtCurrentTime = 4.05;
    window.__qtPaused = false;
    let rate = 1.8;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => window.__qtCurrentTime },
      paused: { configurable: true, get: () => window.__qtPaused },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => {
          rate = Number(value);
          video.dispatchEvent(new Event("ratechange"));
        },
      },
    });
  });
  for (const file of [
    "lib/prefs.js",
    "lib/timedtext.js",
    "lib/wpm.js",
    "lib/clock.js",
    "content/pace.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  const body = JSON.stringify({
    events: Array.from({ length: 12 }, (_, i) => ({
      tStartMs: i * 500,
      dDurationMs: 450,
      segs: [{ utf8: "word" + i }],
    })),
  });
  await page.evaluate(
    (text) =>
      window.postMessage(
        {
          source: "quiettube",
          type: "QT_TIMEDTEXT",
          videoId: "TRIM-PILL",
          url: "https://www.youtube.com/api/timedtext?v=TRIM-PILL&lang=en&kind=asr",
          lang: "en",
          original: true,
          asr: true,
          text,
        },
        "*",
      ),
    body,
  );
  await expect.poll(() => page.evaluate(() => window.QuietTube.asrRhythm())).toBe(true);

  const pill = () =>
    page.evaluate(() => ({
      full: document.querySelector("#qt-cluster .qt-cluster-label-full")?.textContent || "",
      compact:
        document.querySelector("#qt-cluster .qt-cluster-label-compact")?.textContent || "",
      rate: document.querySelector("video")?.playbackRate,
      boost: window.QuietTube._trimBoost,
      clock: window.QuietTube.watchSecs(0, 1),
    }));

  /* Known trailing silence after the last word at 5.5s: 8× boost. */
  await page.evaluate(() => {
    window.__qtCurrentTime = 10;
  });
  await expect.poll(pill).toEqual({
    full: "0 WPM  ·  8x",
    compact: "8x",
    rate: 8,
    boost: true,
    clock: expect.closeTo(1 / 1.8, 5),
  });

  /* First spoken word restores the saved manual speed; clock stays on 1.8. */
  await page.evaluate(() => {
    window.__qtCurrentTime = 5.5;
  });
  await expect.poll(pill).toMatchObject({
    compact: "1.8x",
    rate: 1.8,
    boost: false,
    clock: expect.closeTo(1 / 1.8, 5),
  });
  await expect(page.locator("#qt-cluster .qt-cluster-label-full")).toContainText("1.8x");

  /* Pace Lock: same silence shows 8×, then the live lock rate; clock ignores the boost. */
  await page.evaluate(() => chrome.storage.sync.set({ qt_paceLock: true, qt_targetWpm: 180 }));
  await expect.poll(() => page.evaluate(() => window.QuietTube.lockOn())).toBe(true);
  const lockedClock = await page.evaluate(() => window.QuietTube.watchSecs(0, 1));
  await page.evaluate(() => {
    window.__qtCurrentTime = 10;
  });
  await expect.poll(pill).toEqual({
    full: "180 WPM  ·  8x",
    compact: "8x",
    rate: 8,
    boost: true,
    clock: expect.closeTo(lockedClock, 5),
  });
  await page.evaluate(() => {
    window.__qtCurrentTime = 5.5;
  });
  await expect.poll(pill).toMatchObject({
    boost: false,
    clock: expect.closeTo(lockedClock, 5),
  });
  await expect.poll(async () => (await pill()).compact).not.toBe("8x");
  const recovered = await pill();
  const roundedRate = Math.round(recovered.rate * 100) / 100;
  const rateLabel = `${roundedRate}x`;
  expect(recovered.rate).toBeGreaterThanOrEqual(0.7);
  expect(recovered.rate).toBeLessThanOrEqual(4);
  expect(recovered.compact).toBe(rateLabel);
  expect(recovered.full).toBe(`180 WPM  ·  ${rateLabel}`);
});

test("neutral rate drag cancellation follows the latest external profile", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=NEUTRAL-CANCEL");
  await installChromeStub(page, {
    qt_playbackRate: 1.5,
    qt_paceLock: true,
    qt_trimSilence: true,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    let rate = 1.5;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => 5 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => { rate = Number(value); },
      },
    });
  });
  for (const file of [
    "lib/prefs.js",
    "lib/timedtext.js",
    "lib/wpm.js",
    "lib/clock.js",
    "content/pace.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await page.keyboard.press("a");
  await page.locator("#qt-cluster .qt-chrome-btn").click();
  const range = page.locator("#qt-speed-menu [data-act='rate-range']");
  await range.evaluate((control) => {
    control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    control.value = "2.5";
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() =>
    chrome.storage.sync.set({ qt_paceLock: false, qt_playbackRate: 2 }),
  );
  await range.evaluate((control) =>
    control.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })),
  );

  await expect.poll(() => page.evaluate(() => ({
    neutral: window.QuietTube._hold1x,
    paceLock: window.QuietTube.state.paceLock,
    userRate: window.QuietTube._userRate,
    restoreRate: window.QuietTube._hold1xFrom,
    liveRate: document.querySelector("video").playbackRate,
  }))).toEqual({
    neutral: true,
    paceLock: false,
    userRate: 2,
    restoreRate: 2,
    liveRate: 1,
  });
  await page.keyboard.press("a");
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2);

  /* A synchronized tab may explicitly leave fixed 1x while this tab still
     owns a neutral slider preview. Cancelling that stale preview must not
     resurrect fixed mode against the persisted global value. */
  await page.keyboard.press("a");
  await expect.poll(() => page.evaluate(() => window.QuietTube._hold1x)).toBe(true);
  await range.evaluate((control) => {
    control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    control.value = "2.5";
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => chrome.storage.sync.set({ qt_fixed1x: false }));
  await range.evaluate((control) =>
    control.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })),
  );
  await expect.poll(() => page.evaluate(() => ({
    neutral: window.QuietTube._hold1x,
    stored: window.__qtStorage.qt_fixed1x,
    userRate: window.QuietTube._userRate,
    liveRate: document.querySelector("video").playbackRate,
  }))).toEqual({ neutral: false, stored: false, userRate: 2, liveRate: 2 });
});

test("only original-language ASR can own WPM cues while CC is off", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video>
        <button class="ytp-subtitles-button" aria-pressed="false">CC</button>
        <div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=AUTH");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_captionLangs: ["tlang:pt"],
  });
  const asrBody = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 4000, segs: [
      { utf8: "original", tOffsetMs: 100 },
      { utf8: " rhythm", tOffsetMs: 2500 },
    ] }],
  });
  const translatedBody = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: "ritmo traduzido errado" }] }],
  });
  const uploadedBody = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: "uploaded wrong" }] }],
  });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(({ asrBody, translatedBody, uploadedBody }) => {
    const post = (url, text, original) => window.postMessage({
      source: "quiettube",
      type: "QT_TIMEDTEXT",
      videoId: "AUTH",
      url,
      lang: /tlang=pt/.test(url) ? "tlang:pt" : "en",
      original,
      text,
    }, "*");
    post("https://www.youtube.com/api/timedtext?v=AUTH&lang=en&kind=asr", asrBody, true);
    post("https://www.youtube.com/api/timedtext?v=AUTH&lang=en&kind=asr&tlang=pt", translatedBody, false);
    post("https://www.youtube.com/api/timedtext?v=AUTH&lang=en", uploadedBody, true);
  }, { asrBody, translatedBody, uploadedBody });
  await expect.poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text)).toBe(
    "original rhythm",
  );
  expect(await page.evaluate(() => ({
    asr: window.QuietTube._cuesAreAsr,
    cc: document.querySelector(".ytp-subtitles-button").getAttribute("aria-pressed"),
  }))).toEqual({ asr: true, cc: "false" });
});

test("an uploaded fallback cannot block a later ASR payload", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video><div class="ytp-left-controls"></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=FALLBACK");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  const fallbackBody = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "uploaded fallback" }] }],
  });
  const asrBody = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "real asr" }] }],
  });
  /* Uploaded arrives first and may drive rhythm while nothing better exists. */
  await page.evaluate((text) => {
    window.postMessage({
      source: "quiettube", type: "QT_TIMEDTEXT", videoId: "FALLBACK",
      url: "https://www.youtube.com/api/timedtext?v=FALLBACK&lang=en",
      lang: "en", original: true, text,
    }, "*");
  }, fallbackBody);
  await expect.poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text)).toBe(
    "uploaded fallback",
  );
  expect(await page.evaluate(() => window.QuietTube._cuesAreAsr)).toBe(false);

  /* The auto-generated track lands late; it must take ownership of rhythm.
     inject.js owns the fetch (see tests/browser/asr-provenance.spec.js); this
     asserts pace.js promotes the payload once it arrives. */
  await page.evaluate((text) => {
    window.postMessage({
      source: "quiettube", type: "QT_TIMEDTEXT", videoId: "FALLBACK",
      url: "https://www.youtube.com/api/timedtext?v=FALLBACK&lang=en&kind=asr",
      lang: "en", original: true, asr: true, text,
    }, "*");
  }, asrBody);
  await expect.poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text)).toBe("real asr");
  expect(await page.evaluate(() => window.QuietTube._cuesAreAsr)).toBe(true);
});

test("lower clock recomputes elapsed time when manual rate changes", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>
        #movie_player{position:relative;width:960px;height:540px}
        .ytp-left-controls{display:flex;align-items:center}
        .ytp-play-button{display:block;width:40px;height:40px}
        .ytp-volume-area{display:block;width:52px;height:44px;background:rgba(9,17,25,.42);
          border:0;border-radius:19px;box-shadow:none;backdrop-filter:none}
        .ytp-chapter-title{display:block;height:42px;background:rgba(70,80,90,.5);
          border:0;border-radius:17px;box-shadow:none;backdrop-filter:none}
      </style>
        <div id="movie_player"><video class="html5-main-video"></video>
          <div class="ytp-left-controls"><button class="ytp-play-button"></button>
            <span class="ytp-volume-area"></span>
            <span class="ytp-chapter-title">Chapter</span>
            <span class="ytp-time-display">5:00 / 13:09</span></div></div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=clock");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 180,
    qt_playbackRate: 1.5,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    let rate = 1.5;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 789 },
      currentTime: { configurable: true, get: () => 300 },
      paused: { configurable: true, get: () => true },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => {
          rate = Number(value);
          video.dispatchEvent(new Event("ratechange"));
        },
      },
    });
  });
  for (const file of ["styles.css", "styles-overlay.css", "styles-toggles.css"])
    await page.addStyleTag({ path: path.join(ROOT, file) });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  const clock = page.locator("#qt-time-pill");
  await expect(clock).toContainText("3:20 / 8:46");
  await expect(page.locator("#qt-cluster .qt-chrome-cluster")).toBeVisible();
  const nativeAndToolkitPaint = await page.evaluate(() => {
    const paint = (el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        height: cs.height,
        borderRadius: cs.borderRadius,
        backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
        borderTopWidth: cs.borderTopWidth,
        borderTopStyle: cs.borderTopStyle,
        boxShadow: cs.boxShadow,
      };
    };
    return {
      native: paint(document.querySelector(".ytp-left-controls .ytp-volume-area")),
      time: paint(document.getElementById("qt-time-pill")),
      pace: paint(document.querySelector("#qt-cluster .qt-chrome-cluster")),
    };
  });
  expect(nativeAndToolkitPaint.native).toEqual({
    backgroundColor: "rgba(9, 17, 25, 0.42)",
    height: "44px",
    borderRadius: "19px",
    backdropFilter: "none",
    borderTopWidth: "0px",
    borderTopStyle: "none",
    boxShadow: "none",
  });
  expect(nativeAndToolkitPaint.time).toEqual(nativeAndToolkitPaint.native);
  expect(nativeAndToolkitPaint.pace).toEqual(nativeAndToolkitPaint.native);
  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await page.locator("#qt-speed-menu [data-rate='2']").click();
  await expect.poll(() => page.locator("video").evaluate((v) => v.playbackRate)).toBe(2);
  await expect(clock).toContainText("2:30 / 6:35");
});

test("Toolkit pills use the 0.3/40/28 fallback when native paint is unavailable", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>#movie_player{position:relative;width:960px;height:540px}</style>
        <div id="movie_player"><video class="html5-main-video"></video>
          <div class="ytp-left-controls"><button class="ytp-play-button"></button>
            <span class="ytp-time-display">0:30 / 2:00</span></div></div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=paint-fallback");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 180,
    qt_playbackRate: 1,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    let rate = 1;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 120 },
      currentTime: { configurable: true, get: () => 30 },
      paused: { configurable: true, get: () => true },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => {
          rate = Number(value);
        },
      },
    });
  });
  for (const file of ["styles.css", "styles-overlay.css", "styles-toggles.css"])
    await page.addStyleTag({ path: path.join(ROOT, file) });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect(page.locator("#qt-time-pill")).toBeVisible();
  await expect(page.locator("#qt-cluster .qt-chrome-cluster")).toBeVisible();
  const paints = await page.evaluate(() =>
    [document.getElementById("qt-time-pill"), document.querySelector("#qt-cluster .qt-chrome-cluster")]
      .map((el) => {
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
      }),
  );
  for (const paint of paints) {
    expect(paint).toEqual({
      backgroundColor: "rgba(0, 0, 0, 0.3)",
      height: "40px",
      borderRadius: "28px",
      backdropFilter: "none",
      borderTopWidth: "0px",
      borderTopStyle: "none",
      boxShadow: "none",
      opacity: "1",
    });
  }
});

test("the lower clock does not rewrite hidden native time attributes every UI tick", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>#movie_player{position:relative;width:960px;height:540px}</style>
        <div id="movie_player"><video class="html5-main-video"></video>
          <div class="ytp-left-controls"><button class="ytp-play-button"></button>
            <span class="ytp-time-display"><span class="ytp-time-wrapper">
              <span class="ytp-time-current">0:30</span><span class="ytp-time-separator"> / </span>
              <span class="ytp-time-duration">2:00</span>
            </span></span></div></div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=clock-churn");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_playbackRate: 1,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 120 },
      currentTime: { configurable: true, get: () => 30 },
      paused: { configurable: true, get: () => true },
      ended: { configurable: true, get: () => false },
    });
  });
  for (const file of ["styles.css", "styles-overlay.css", "styles-toggles.css"])
    await page.addStyleTag({ path: path.join(ROOT, file) });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect(page.locator("#qt-time-pill")).toBeVisible();
  await page.waitForTimeout(500);
  const mutations = await page.evaluate(async () => {
    const left = document.querySelector(".ytp-left-controls");
    let attributes = 0;
    const observer = new MutationObserver((records) => {
      attributes += records.filter((record) => record.type === "attributes").length;
    });
    observer.observe(left, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    observer.disconnect();
    return attributes;
  });
  expect(
    mutations,
    `stable native clock attributes were rewritten ${mutations} times in 1s`,
  ).toBe(0);
});

test("miniplayer preserves a clock while Toolkit overlays are hidden", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<ytd-miniplayer active style="display:block;width:420px;height:240px">
        <div id="movie_player" style="position:relative;width:420px;height:240px">
          <video class="html5-main-video"></video>
          <div class="ytp-left-controls"><span class="ytp-time-display">0:30 / 2:00</span></div>
        </div></ytd-miniplayer>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=mini");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 120 },
      currentTime: { configurable: true, get: () => 30 },
      paused: { configurable: true, get: () => true },
      ended: { configurable: true, get: () => false },
    });
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  await page.addStyleTag({ path: path.join(ROOT, "styles-overlay.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect(page.locator("html")).toHaveClass(/qt-miniplayer-active/);
  await expect(page.locator("#qt-cluster")).toBeHidden();
  const clockVisible = await page.evaluate(() => {
    const native = document.querySelector(".ytp-time-display");
    const pill = document.getElementById("qt-time-pill");
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    };
    return visible(native) || visible(pill);
  });
  expect(clockVisible).toBe(true);
});

test("entering class-mode miniplayer restores native time without a duplicate pill", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" style="position:relative;width:960px;height:540px">
        <video class="html5-main-video"></video>
        <div class="ytp-left-controls"><span class="ytp-time-display">0:30 / 2:00</span></div>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=mini-transition");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 120 },
      currentTime: { configurable: true, get: () => 30 },
      paused: { configurable: true, get: () => true },
      ended: { configurable: true, get: () => false },
    });
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  await page.addStyleTag({ path: path.join(ROOT, "styles-overlay.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect(page.locator("#qt-time-pill")).toBeVisible();
  await expect(page.locator(".ytp-time-display")).toBeHidden();
  await page.locator("#movie_player").evaluate((player) =>
    player.classList.add("ytp-miniplayer-mode"),
  );
  await expect(page.locator("html")).toHaveClass(/qt-miniplayer-active/);
  await expect(page.locator(".ytp-time-display")).toBeVisible();
  await expect(page.locator("#qt-time-pill")).toBeHidden();
  await expect(page.locator("#qt-cluster")).toBeHidden();
  await page.locator("#movie_player").evaluate((player) =>
    player.classList.remove("ytp-miniplayer-mode"),
  );
  await expect(page.locator("html")).not.toHaveClass(/qt-miniplayer-active/);
  await expect(page.locator("#qt-time-pill")).toBeVisible();
  await expect(page.locator(".ytp-time-display")).toBeHidden();
});

test("caption overlay copies the hidden native caption font size", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" class="captions-enabled" style="position:relative;width:960px;height:640px">
        <video class="html5-main-video"></video>
        <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
        <div class="ytp-caption-window-container" style="opacity:0">
          <span class="ytp-caption-segment" style="font-size:100px">Native caption</span>
        </div></div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=caption-size");
  await installChromeStub(page, {
    qt_dualCaptions: false,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_captionBg: true,
    qt_captionLangs: [],
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    Object.defineProperties(video, {
      currentTime: { configurable: true, get: () => 1 },
      paused: { configurable: true, get: () => true },
    });
    const cue = {
      start: 0,
      end: 5,
      text: "Native caption",
      words: [{ w: "Native", start: 0, end: 2 }, { w: "caption", start: 2, end: 5 }],
    };
    window.QuietTube = {
      cues: [cue],
      cuesByLang: { en: [cue] },
      tracks: [],
      originalLang: "en",
      /* Word-level cues are ASR cues: Color highlight only paints when the
         rhythm source is the original-language auto-generated track. */
      _cuesAreAsr: true,
    };
  });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/timedtext.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/captions.js") });

  const overlay = page.locator("#qt-cap-p");
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.evaluate((el) => getComputedStyle(el).fontSize)).toBe("100px");
  await page.locator(".ytp-caption-segment").evaluate((el) => {
    el.style.fontSize = "260px";
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(() => overlay.evaluate((el) => getComputedStyle(el).fontSize)).toBe("260px");
});

test("translated Highlight and Center timing follows original ASR word onsets", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" class="captions-enabled" style="position:relative;width:960px;height:640px">
        <video class="html5-main-video"></video>
        <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
      </div>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=translated-rhythm");
  await installChromeStub(page, {
    qt_dualCaptions: false,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_captionBg: true,
    qt_captionLangs: ["tlang:pt"],
  });
  await page.evaluate(() => {
    const video = document.querySelector("video");
    Object.defineProperties(video, {
      currentTime: { configurable: true, get: () => 2 },
      paused: { configurable: true, get: () => true },
    });
    const original = [{
      start: 0, end: 3, text: "one two three",
      words: [
        { w: "one", t: 0.1 },
        { w: "two", t: 0.3 },
        { w: "three", t: 2.5 },
      ],
    }];
    const translated = [{
      start: 0, end: 3, text: "um dois três",
      words: [
        { w: "um", t: 0 },
        { w: "dois", t: 1 },
        { w: "três", t: 2 },
      ],
    }];
    window.QuietTube = {
      cues: original,
      _cuesAreAsr: true,
      cuesByLang: { "tlang:pt": translated },
      tracks: [],
      originalLang: "en",
    };
  });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/timedtext.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/captions.js") });

  /* At 2.0s, even splitting would already highlight "três". The source ASR
     remains on its second word until the real 2.5s onset. */
  await expect(page.locator("#qt-cap-p .qt-w-on")).toHaveText("dois");
});

test("No Distractions leaves account clicks alone and opens In this video chips", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<ytd-masthead>
          <div id="start"><button id="guide-button" aria-label="Guide">Guide</button></div>
          <div id="end"><div id="buttons"><button id="avatar-btn">
            <span id="guide-button" data-avatar-target>Account</span>
          </button></div></div>
        </ytd-masthead>
        <ytd-watch-flexy><div id="columns"><div id="primary">
          <yt-chip-cloud-chip-renderer data-in-this-video>In this video</yt-chip-cloud-chip-renderer>
        </div><div id="secondary"><ytd-engagement-panel-section-list-renderer
          visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer>
        </div></div><div id="movie_player"></div></ytd-watch-flexy>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=nd");
  await installChromeStub(page, { noDistractionsEnabled: true });
  await page.evaluate(() => {
    chrome.runtime.getURL = (file) => "chrome-extension://fixture/" + file;
    chrome.runtime.onMessage = { addListener() {} };
  });
  await page.addScriptTag({ path: path.join(ROOT, "content_script_youtube.js") });

  const clicks = await page.evaluate(() => {
    const fire = (el) => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      const dispatched = el.dispatchEvent(event);
      return { dispatched, defaultPrevented: event.defaultPrevented };
    };
    return {
      account: fire(document.querySelector("[data-avatar-target]")),
      guide: fire(document.querySelector("#start #guide-button")),
    };
  });
  expect(clicks.account).toEqual({ dispatched: true, defaultPrevented: false });
  expect(clicks.guide).toEqual({ dispatched: false, defaultPrevented: true });

  await page.locator("#secondary").evaluate((secondary) => {
    secondary.dataset.noDistractionsHidden = "true";
    secondary.dataset.noDistractionsSecondaryCollapse = "true";
    secondary.style.setProperty("display", "none", "important");
    secondary.style.setProperty("visibility", "hidden", "important");
    secondary.style.setProperty("pointer-events", "none", "important");
  });
  await page.locator("[data-in-this-video]").evaluate((chip) => {
    chip.addEventListener("click", () => {
      const secondary = document.querySelector("#secondary");
      window.__secondaryOpenAtNativeClick =
        secondary.dataset.noDistractionsSecondaryCollapse !== "true" &&
        secondary.style.getPropertyValue("display") === "";
      secondary
        .querySelector("ytd-engagement-panel-section-list-renderer")
        .setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    });
  });
  await page.locator("[data-in-this-video]").click({ force: true });
  expect(await page.evaluate(() => window.__secondaryOpenAtNativeClick)).toBe(true);
  await expect.poll(() =>
    page.locator("#secondary").evaluate((secondary) => ({
      collapsed: secondary.dataset.noDistractionsSecondaryCollapse === "true",
      display: secondary.style.getPropertyValue("display"),
      visibility: secondary.style.getPropertyValue("visibility"),
    })),
  ).toEqual({ collapsed: false, display: "", visibility: "" });
});

test("Shorts resolves the current COW control host into the native lane", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>
        body{margin:0}
        ytd-reel-video-renderer{display:block;position:absolute;top:64px;left:386px;width:452px;height:804px}
        #shorts-player{position:relative;width:452px;height:804px;background:#181818}
        .player-controls{position:absolute;inset:0 auto auto 0;width:452px;height:72px}
        .ytdShortsPlayerControlsHost{position:absolute;inset:0;display:flex;height:96px;opacity:1}
        .ytdShortsPlayerControlsLeftControls,
        .ytdShortsPlayerControlsRightControls{position:absolute;top:16px;height:48px;display:flex;align-items:center}
        .ytdShortsPlayerControlsLeftControls{left:16px;width:116px}
        .ytdShortsPlayerControlsRightControls{right:16px;width:96px;background:rgba(0,0,0,.3);border-radius:28px}
        volume-controls{display:flex;width:60px;height:48px}
        .ytdVolumeControlsVolumeControlsContainer{width:100%;height:48px;background:rgba(0,0,0,.3);border-radius:50px}
      </style>
      <ytd-reel-video-renderer id="cow-active">
        <div id="shorts-player" class="html5-video-player ytp-autohide">
          <video class="html5-main-video"></video>
        </div>
        <div class="player-controls">
          <ytd-shorts-player-controls-cow class="ytdShortsPlayerControlsHost">
            <div class="ytdShortsPlayerControlsLeftControls">
              <button aria-label="Pause (k)"></button>
              <volume-controls><div class="ytdVolumeControlsVolumeControlsContainer"><button aria-label="Mute (m)"></button></div></volume-controls>
            </div>
            <div class="ytdShortsPlayerControlsRightControls"><button aria-label="More actions"></button></div>
          </ytd-shorts-player-controls-cow>
        </div>
      </ytd-reel-video-renderer>`,
    }),
  );
  await page.goto("http://yt.test/shorts/cow-active");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_playbackRate: 1,
    qt_targetWpm: 180,
  });
  await page.evaluate(() => {
    const player = document.getElementById("shorts-player");
    player.getPlayerResponse = () => ({ videoDetails: { videoId: "cow-active" } });
    const video = player.querySelector("video");
    let rate = 1;
    Object.defineProperties(video, {
      duration: { configurable: true, get: () => 60 },
      currentTime: { configurable: true, get: () => 10 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get: () => rate,
        set: (value) => { rate = Number(value); },
      },
    });
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  await page.addStyleTag({ path: path.join(ROOT, "styles-overlay.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  const cluster = page.locator("#qt-cluster");
  await expect(cluster).toBeVisible();
  const geometry = await page.evaluate(() => {
    const pill = document.querySelector("#qt-cluster .qt-chrome-cluster").getBoundingClientRect();
    const left = document.querySelector(".ytdShortsPlayerControlsLeftControls").getBoundingClientRect();
    const right = document.querySelector(".ytdShortsPlayerControlsRightControls").getBoundingClientRect();
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      topDelta: Math.abs(pill.top - right.top),
      heightDelta: Math.abs(pill.height - right.height),
      centeredDelta: Math.abs(
        pill.left + pill.width / 2 - (left.right + right.left) / 2,
      ),
      overlap: [overlap(pill, left), overlap(pill, right)],
    };
  });
  expect(geometry.topDelta).toBeLessThanOrEqual(1);
  expect(geometry.heightDelta).toBeLessThanOrEqual(1);
  expect(geometry.centeredDelta).toBeLessThanOrEqual(1);
  expect(geometry.overlap).toEqual([0, 0]);
});

test("Shorts fits one Toolkit cluster into the responsive native control lane", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>
        body{margin:0}.short{display:none;position:absolute;top:64px;left:386px;width:452px;height:804px}
        .short.current{display:block}.html5-video-player{position:relative;width:452px;height:804px;background:#181818}
        .player-controls{position:absolute;inset:0 auto auto 0;width:452px;height:72px}
        ytd-shorts-player-controls{position:absolute;inset:0;display:flex;opacity:1;
          transition:opacity .25s cubic-bezier(0,0,.2,1)}
        ytd-shorts-player-controls.native-hidden{opacity:0}
        .controls-missing ytd-shorts-player-controls{display:none}
        #left-controls,#right-controls{position:absolute;top:16px;height:48px;display:flex;align-items:center}
        #left-controls{left:16px;width:116px;transition:width .2s ease}
        #right-controls{right:16px;width:144px;background:rgba(0,0,0,.3);border-radius:28px}
        .native-play{width:48px;height:48px;background:rgba(0,0,0,.3);border-radius:24px}
        volume-controls{display:flex;width:60px;height:48px;transition:width .2s ease}
        .ytdVolumeControlsVolumeControlsContainer{width:100%;height:48px;background:rgba(0,0,0,.3);border-radius:50px}
        ytd-shorts-player-controls.volume-expanded #left-controls{width:224px}
        ytd-shorts-player-controls.volume-expanded volume-controls{width:168px}
        ytd-shorts-player-controls.volume-mid #left-controls{width:172px}
        ytd-shorts-player-controls.volume-edge #left-controls{width:178px}
        ytd-shorts-player-controls.lane-exhausted #left-controls{width:260px}
        ytd-shorts-player-controls.native-tall #left-controls,
        ytd-shorts-player-controls.native-tall #right-controls{top:8px;height:56px}
        ytd-shorts-player-controls.native-tall volume-controls,
        ytd-shorts-player-controls.native-tall .ytdVolumeControlsVolumeControlsContainer{height:56px}
        ytd-shorts-player-controls.native-tall.volume-expanded #left-controls{width:216px}
      </style>
      <ytd-reel-video-renderer class="short" id="short-a" aria-hidden="false">
        <div id="shorts-player" class="html5-video-player ytp-autohide"><video class="html5-main-video"></video></div>
        <div class="player-controls"><ytd-shorts-player-controls>
          <div id="left-controls"><div class="native-play"></div><volume-controls><div class="ytdVolumeControlsVolumeControlsContainer"></div></volume-controls></div>
          <div id="right-controls">CC · More</div>
        </ytd-shorts-player-controls></div>
      </ytd-reel-video-renderer>
      <ytd-reel-video-renderer class="short current" id="short-b">
        <div id="shorts-player" class="html5-video-player ytp-autohide"><video class="html5-main-video"></video></div>
        <div class="player-controls"><ytd-shorts-player-controls>
          <div id="left-controls"><div class="native-play"></div><volume-controls><div class="ytdVolumeControlsVolumeControlsContainer"></div></volume-controls></div>
          <div id="right-controls">CC · More</div>
        </ytd-shorts-player-controls></div>
      </ytd-reel-video-renderer>`,
    }),
  );
  await page.goto("http://yt.test/shorts/short-b");
  await installChromeStub(page, {
    qt_paceLock: false,
    qt_trimSilence: false,
    qt_targetWpm: 180,
  });
  await page.evaluate(() => {
    document.querySelectorAll("video").forEach((video) => {
      let rate = 1;
      Object.defineProperties(video, {
        duration: { configurable: true, get: () => 60 },
        currentTime: { configurable: true, get: () => 10 },
        paused: { configurable: true, get: () => false },
        ended: { configurable: true, get: () => false },
        playbackRate: {
          configurable: true,
          get: () => rate,
          set: (value) => { rate = Number(value); },
        },
      });
    });
    document.querySelectorAll(".short .html5-video-player").forEach((player) => {
      const videoId = player.closest("ytd-reel-video-renderer").id;
      player.getPlayerResponse = () => ({ videoDetails: { videoId } });
    });
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  await page.addStyleTag({ path: path.join(ROOT, "styles-overlay.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  const cluster = page.locator("#qt-cluster");
  await expect(cluster).toBeVisible();
  await expect(cluster).toHaveCount(1);
  await expect(page.locator("#short-b .html5-video-player > #qt-cluster")).toHaveCount(1);
  await expect(cluster.locator(".qt-cluster-label-full")).toHaveText(
    /^1x$/,
  );
  const geometry = await page.evaluate(() => {
    const player = document.querySelector("#short-b .html5-video-player").getBoundingClientRect();
    const pill = document.querySelector("#qt-cluster .qt-chrome-cluster").getBoundingClientRect();
    const left = document.querySelector("#short-b #left-controls").getBoundingClientRect();
    const right = document.querySelector("#short-b #right-controls").getBoundingClientRect();
    const overlapArea = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const laneLeft = left.right + 4;
    const laneRight = right.left - 4;
    return {
      laneCenterDelta: Math.abs((pill.left + pill.width / 2) - (laneLeft + laneRight) / 2),
      topDelta: Math.abs(pill.top - right.top),
      heightDelta: Math.abs(pill.height - right.height),
      laneWidth: laneRight - laneLeft,
      pillWidth: pill.width,
      inside:
        pill.left >= player.left && pill.right <= player.right &&
        pill.top >= player.top && pill.bottom <= player.bottom,
      controlOverlaps: [overlapArea(pill, left), overlapArea(pill, right)],
      wrapperPointerEvents: getComputedStyle(document.querySelector("#qt-cluster")).pointerEvents,
      pillPointerEvents: getComputedStyle(document.querySelector("#qt-cluster .qt-chrome-cluster")).pointerEvents,
      fullDisplay: getComputedStyle(document.querySelector(".qt-cluster-label-full")).display,
      fullVisibility: getComputedStyle(document.querySelector(".qt-cluster-label-full")).visibility,
      compactDisplay: getComputedStyle(document.querySelector(".qt-cluster-label-compact")).display,
      compactVisibility: getComputedStyle(document.querySelector(".qt-cluster-label-compact")).visibility,
      visibleLabel: getComputedStyle(document.querySelector(".qt-cluster-label-full")).display !== "none" &&
        getComputedStyle(document.querySelector(".qt-cluster-label-full")).visibility !== "hidden"
        ? document.querySelector(".qt-cluster-label-full").textContent
        : document.querySelector(".qt-cluster-label-compact").textContent,
      visibleLabelFits: (() => {
        const full = document.querySelector(".qt-cluster-label-full");
        const compact = document.querySelector(".qt-cluster-label-compact");
        const shown = getComputedStyle(full).visibility !== "hidden" ? full : compact;
        const shownRect = shown.getBoundingClientRect();
        return shownRect.left >= pill.left && shownRect.right <= pill.right;
      })(),
    };
  });
  expect(geometry.laneCenterDelta).toBeLessThanOrEqual(1);
  expect(geometry.topDelta).toBeLessThanOrEqual(1);
  expect(geometry.heightDelta).toBeLessThanOrEqual(1);
  expect(geometry.pillWidth).toBeLessThanOrEqual(geometry.laneWidth + 0.5);
  expect(geometry.inside).toBe(true);
  expect(geometry.controlOverlaps).toEqual([0, 0]);
  expect(geometry.wrapperPointerEvents).toBe("none");
  expect(geometry.pillPointerEvents).toBe("auto");
  expect(geometry.fullDisplay).not.toBe("none");
  expect(geometry.fullVisibility).not.toBe("hidden");
  expect(geometry.compactVisibility).toBe("hidden");
  expect(geometry.visibleLabel).toMatch(/^\d+(?:\.\d+)?x$/);
  expect(geometry.visibleLabelFits).toBe(true);
  await expect(page.locator("#qt-time-pill")).toHaveCount(0);
  await expect(page.locator(".qt-time-native-hide")).toHaveCount(0);

  /* A changing speed string must never swap the stable full WPM label for an
     x-only intermediate state while the native volume is collapsed. */
  await page.evaluate(() => chrome.storage.sync.set({ qt_playbackRate: 0.25 }));
  await page.waitForTimeout(320);
  const stableLabel = await page.evaluate(() => {
    const wrap = document.getElementById("qt-cluster");
    return {
      compact: wrap.classList.contains("qt-short-lane-compact"),
      tight: wrap.classList.contains("qt-short-lane-tight"),
      full: wrap.querySelector(".qt-cluster-label-full").textContent,
      fullVisibility: getComputedStyle(wrap.querySelector(".qt-cluster-label-full")).visibility,
      compactVisibility: getComputedStyle(wrap.querySelector(".qt-cluster-label-compact")).visibility,
    };
  });
  expect(stableLabel).toMatchObject({
    compact: false,
    tight: false,
    fullVisibility: "visible",
    compactVisibility: "hidden",
  });
  expect(stableLabel.full).toBe("0.25x");
  const stableTextMutations = await page.evaluate(() => new Promise((resolve) => {
    const cluster = document.getElementById("qt-cluster");
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.filter((record) => record.type === "childList").length;
    });
    observer.observe(cluster, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(count);
    }, 500);
  }));
  expect(stableTextMutations).toBe(0);
  await page.evaluate(() => chrome.storage.sync.set({ qt_playbackRate: 1 }));
  await page.waitForTimeout(320);

  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    chrome.storage.sync.set({ qt_paceLock: true, qt_targetWpm: 250 });
  });
  await page.waitForTimeout(320);
  await expect(cluster.locator(".qt-cluster-label-full")).toHaveText("250 WPM");
  expect(await cluster.evaluate((wrap) => ({
    compact: wrap.classList.contains("qt-short-lane-compact"),
    tight: wrap.classList.contains("qt-short-lane-tight"),
    fullVisibility: getComputedStyle(wrap.querySelector(".qt-cluster-label-full")).visibility,
  }))).toEqual({ compact: false, tight: false, fullVisibility: "visible" });
  await page.evaluate(() => chrome.storage.sync.set({ qt_paceLock: false }));
  await page.waitForTimeout(320);
  await expect(cluster.locator(".qt-cluster-label-full")).toHaveText("1x");

  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) =>
    controls.classList.add("volume-expanded"),
  );
  const readExpandedGeometry = () => page.evaluate(() => {
    const pill = document.querySelector("#qt-cluster .qt-chrome-cluster").getBoundingClientRect();
    const left = document.querySelector("#short-b #left-controls").getBoundingClientRect();
    const right = document.querySelector("#short-b #right-controls").getBoundingClientRect();
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const expectedGap = Math.max(0, Math.min(4, (right.left - left.right - pill.height) / 2));
    const icon = document.querySelector("#qt-cluster .qt-chrome-btn svg").getBoundingClientRect();
    return {
      width: pill.width,
      height: pill.height,
      laneWidth: right.left - 4 - (left.right + 4),
      overlaps: [overlap(pill, left), overlap(pill, right)],
      tight: document.getElementById("qt-cluster").classList.contains("qt-short-lane-tight"),
      compact: document.getElementById("qt-cluster").classList.contains("qt-short-lane-compact"),
      rightAnchorDelta: Math.abs(pill.right - (right.left - expectedGap)),
      justify: getComputedStyle(document.getElementById("qt-cluster")).justifyContent,
      iconSize: [icon.width, icon.height],
      iconCenterDelta: Math.abs((icon.left + icon.width / 2) - (pill.left + pill.width / 2)),
      labelDisplay: getComputedStyle(document.querySelector("#qt-cluster .qt-cluster-label")).display,
      labelVisibility: getComputedStyle(document.querySelector("#qt-cluster .qt-cluster-label")).visibility,
    };
  });
  /* Native width transitions and the Toolkit's bounded 120ms geometry sample
     are independent clocks. Wait for their shared final state instead of
     sampling a transient frame on a busy full-suite run. */
  await expect
    .poll(async () => {
      const value = await readExpandedGeometry();
      return (
        value.width === 48 &&
        value.height === 48 &&
        value.overlaps.every((area) => area === 0) &&
        value.tight &&
        value.rightAnchorDelta <= 1 &&
        value.iconCenterDelta <= 1
      );
    })
    .toBe(true);
  const expandedGeometry = await readExpandedGeometry();
  expect(expandedGeometry.width).toBeLessThan(geometry.pillWidth);
  expect(expandedGeometry.width).toBe(48);
  expect(expandedGeometry.height).toBe(48);
  expect(expandedGeometry.width).toBe(expandedGeometry.height);
  expect(expandedGeometry.overlaps).toEqual([0, 0]);
  expect(expandedGeometry.tight).toBe(true);
  expect(expandedGeometry.compact).toBe(false);
  expect(expandedGeometry.rightAnchorDelta).toBeLessThanOrEqual(1);
  expect(expandedGeometry.justify).toBe("flex-end");
  expect(expandedGeometry.iconSize).toEqual([24, 24]);
  expect(expandedGeometry.iconCenterDelta).toBeLessThanOrEqual(1);
  expect(expandedGeometry.labelVisibility).toBe("hidden");

  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) =>
    controls.classList.add("native-tall"),
  );
  await page.waitForTimeout(320);
  const tallGeometry = await page.evaluate(() => {
    const pill = document.querySelector("#qt-cluster .qt-chrome-cluster").getBoundingClientRect();
    const right = document.querySelector("#short-b #right-controls").getBoundingClientRect();
    return {
      width: pill.width,
      height: pill.height,
      topDelta: Math.abs(pill.top - right.top),
      heightDelta: Math.abs(pill.height - right.height),
    };
  });
  expect(tallGeometry.width).toBe(56);
  expect(tallGeometry.height).toBe(56);
  expect(tallGeometry.topDelta).toBeLessThanOrEqual(1);
  expect(tallGeometry.heightDelta).toBeLessThanOrEqual(1);
  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) =>
    controls.classList.remove("native-tall", "volume-expanded"),
  );
  await page.waitForTimeout(320);

  await cluster.locator(".qt-chrome-btn").click();
  const menu = page.locator("#qt-speed-menu");
  await expect(menu).toBeVisible();
  const menuGeometry = await page.evaluate(() => {
    const player = document.querySelector("#short-b .html5-video-player").getBoundingClientRect();
    const pill = document.querySelector("#qt-cluster .qt-chrome-cluster").getBoundingClientRect();
    const menu = document.querySelector("#qt-speed-menu").getBoundingClientRect();
    return {
      centerDelta: Math.abs((menu.left + menu.width / 2) - (player.left + player.width / 2)),
      belowPill: menu.top >= pill.bottom,
      inside: menu.left >= player.left && menu.right <= player.right && menu.bottom <= player.bottom,
    };
  });
  expect(menuGeometry.centerDelta).toBeLessThanOrEqual(1);
  expect(menuGeometry.belowPill).toBe(true);
  expect(menuGeometry.inside).toBe(true);

  /* Current desktop Shorts can render a 319px player. The menu must retain a
     real inset instead of overflowing its parent with the watch-page 340px
     width. */
  await page.evaluate(() => {
    document.querySelector("#short-b").style.width = "319px";
    document.querySelector("#short-b .html5-video-player").style.width = "319px";
    document.querySelector("#short-b .player-controls").style.width = "319px";
    document.querySelector("#short-b #right-controls").style.width = "96px";
  });
  await page.waitForTimeout(180);
  const narrowMenuGeometry = await page.evaluate(() => {
    const player = document
      .querySelector("#short-b .html5-video-player")
      .getBoundingClientRect();
    const menu = document.querySelector("#qt-speed-menu").getBoundingClientRect();
    return {
      width: menu.width,
      leftInset: menu.left - player.left,
      rightInset: player.right - menu.right,
      inside: menu.left >= player.left && menu.right <= player.right,
    };
  });
  if (!narrowMenuGeometry.inside)
    console.log("narrow Shorts menu geometry", narrowMenuGeometry);
  expect(narrowMenuGeometry.inside).toBe(true);
  expect(narrowMenuGeometry.width).toBeLessThanOrEqual(303);
  expect(narrowMenuGeometry.leftInset).toBeGreaterThanOrEqual(7.5);
  expect(narrowMenuGeometry.rightInset).toBeGreaterThanOrEqual(7.5);
  await page.evaluate(() => {
    document.querySelector("#short-b").style.removeProperty("width");
    document
      .querySelector("#short-b .html5-video-player")
      .style.removeProperty("width");
    document
      .querySelector("#short-b .player-controls")
      .style.removeProperty("width");
    document
      .querySelector("#short-b #right-controls")
      .style.removeProperty("width");
  });
  await page.waitForTimeout(180);

  await cluster.locator(".qt-chrome-btn").click();
  await expect(menu).toBeHidden();
  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) => {
    controls.classList.remove("volume-expanded");
    controls.classList.add("native-hidden");
  });
  /* The host opacity transition starts on the next 140 ms Toolkit cadence.
     Waiting a fixed 320 ms occasionally samples the final few percent of the
     transition on a busy runner. Assert the actual settled contract. */
  await expect
    .poll(() =>
      cluster.evaluate((wrap) => Number(getComputedStyle(wrap).opacity)),
    )
    .toBeLessThanOrEqual(0.02);
  const hiddenGeometry = await page.evaluate(() => {
    const wrap = document.getElementById("qt-cluster");
    const pill = wrap.querySelector(".qt-chrome-cluster");
    const rect = pill.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      opacity: Number(getComputedStyle(wrap).opacity),
      hiddenClass: wrap.classList.contains("qt-hidden"),
      ariaHidden: wrap.getAttribute("aria-hidden"),
      inert: wrap.inert,
      buttonTabIndex: pill.querySelector(".qt-chrome-btn").tabIndex,
      pillPointerEvents: getComputedStyle(pill).pointerEvents,
      hitToolkit: !!(hit && hit.closest("#qt-cluster")),
    };
  });
  expect(hiddenGeometry.opacity).toBeLessThanOrEqual(0.02);
  expect(hiddenGeometry.hiddenClass).toBe(true);
  expect(hiddenGeometry.ariaHidden).toBe("true");
  expect(hiddenGeometry.inert).toBe(true);
  expect(hiddenGeometry.buttonTabIndex).toBe(-1);
  expect(hiddenGeometry.pillPointerEvents).toBe("none");
  expect(hiddenGeometry.hitToolkit).toBe(false);
  await cluster.locator(".qt-chrome-btn").evaluate((button) => button.focus());
  expect(await page.evaluate(() => document.activeElement?.closest?.("#qt-cluster") !== null)).toBe(false);
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) =>
    controls.classList.remove("native-hidden"),
  );
  await expect(cluster).toBeVisible();

  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) =>
    controls.classList.add("lane-exhausted"),
  );
  await page.waitForTimeout(120);
  await expect.poll(() => cluster.evaluate((wrap) => ({
    hidden: wrap.classList.contains("qt-hidden"),
    opacity: Number(getComputedStyle(wrap).opacity),
    inert: wrap.inert,
  }))).toEqual({ hidden: true, opacity: 0, inert: true });
  const exhaustedGeometry = await page.evaluate(() => {
    const pill = document
      .querySelector("#qt-cluster .qt-chrome-cluster")
      .getBoundingClientRect();
    const left = document
      .querySelector("#short-b #left-controls")
      .getBoundingClientRect();
    const right = document
      .querySelector("#short-b #right-controls")
      .getBoundingClientRect();
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      display: getComputedStyle(
        document.querySelector("#qt-cluster .qt-chrome-cluster"),
      ).display,
      size: [pill.width, pill.height],
      overlaps: [overlap(pill, left), overlap(pill, right)],
    };
  });
  expect(exhaustedGeometry).toEqual({
    display: "none",
    size: [0, 0],
    overlaps: [0, 0],
  });
  await page.locator("#short-b ytd-shorts-player-controls").evaluate((controls) =>
    controls.classList.remove("lane-exhausted"),
  );
  await expect(cluster).toBeVisible();

  await cluster.locator(".qt-chrome-btn").click();
  await expect(menu).toBeVisible();
  await page.locator("#short-b .player-controls").evaluate((controls) =>
    controls.classList.add("controls-missing"),
  );
  await page.waitForTimeout(120);
  await expect.poll(() => cluster.evaluate((wrap) => ({
    hidden: wrap.classList.contains("qt-hidden"),
    opacity: Number(getComputedStyle(wrap).opacity),
    inert: wrap.inert,
  }))).toEqual({ hidden: true, opacity: 0, inert: true });
  await expect(menu).toBeHidden();
  await page.locator("#short-b .player-controls").evaluate((controls) =>
    controls.classList.remove("controls-missing"),
  );
  await expect(cluster).toBeVisible();

  await page.evaluate(() => {
    document.querySelector("#short-b").classList.remove("current");
    document.querySelector("#short-b").setAttribute("aria-hidden", "false");
    document.querySelector("#short-a").classList.add("current");
    document.querySelector("#short-a").removeAttribute("aria-hidden");
    history.replaceState({}, "", "/shorts/short-a");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect(page.locator("#short-a .html5-video-player > #qt-cluster")).toHaveCount(1);
  await expect(cluster).toHaveCount(1);
  await expect(menu).toBeHidden();

  const cueBody = JSON.stringify({
    events: [
      {
        tStartMs: 0,
        dDurationMs: 1500,
        segs: [{ utf8: "one" }, { utf8: " two", tOffsetMs: 700 }],
      },
    ],
  });
  await page.evaluate((text) => {
    window.postMessage(
      {
        source: "quiettube",
        type: "QT_TRACKS",
        videoId: "short-b",
        tracks: [{ languageCode: "en", kind: "asr", baseUrl: "?v=short-b" }],
      },
      "*",
    );
    window.postMessage(
      {
        source: "quiettube",
        type: "QT_TIMEDTEXT",
        videoId: "short-b",
        url: "https://www.youtube.com/api/timedtext?v=short-b&lang=en&kind=asr",
        lang: "en",
        original: true,
        text,
      },
      "*",
    );
  }, cueBody);
  await page.waitForTimeout(50);
  expect(
    await page.evaluate(() => ({
      cues: window.QuietTube.cues.length,
      tracks: window.QuietTube.tracks.length,
    })),
  ).toEqual({ cues: 0, tracks: 0 });

  await page.evaluate((text) => {
    window.postMessage(
      {
        source: "quiettube",
        type: "QT_TIMEDTEXT",
        videoId: "short-a",
        url: "https://www.youtube.com/api/timedtext?v=short-a&lang=en&kind=asr",
        lang: "en",
        original: true,
        text,
      },
      "*",
    );
  }, cueBody);
  await expect.poll(() => page.evaluate(() => window.QuietTube.cues.length)).toBeGreaterThan(0);
});

/*
 * The Toolkit pace menu must be painted from the surface it actually sits on.
 *
 * On /watch that surface is `.ytp-settings-menu`, and the test above proves we
 * copy it exactly. On /shorts there is no `.ytp-settings-menu` at all — the
 * native surface is a document-level `yt-sheet-view-model`, which is a
 * different, less transparent paint. nativeSettingsMenuForPlayer only searches
 * `player.querySelectorAll(".ytp-popup.ytp-settings-menu, .ytp-settings-menu")`,
 * so on a Short it finds nothing, nativeMenuSkin stays null, and our menu
 * silently falls back to the /watch-shaped default in styles.css
 * (rgba(28,28,28,0.9), no backdrop filter).
 *
 * That mismatch is user-visible: the Toolkit menu looks see-through against a
 * sheet that is not.
 */
test("the Shorts pace menu is painted from the Shorts sheet, not the watch default", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>
        body{margin:0;background:#000}
        .html5-video-player{position:relative;width:452px;height:804px;background:#181818}
        ytd-shorts-player-controls{position:absolute;inset:0;display:flex}
        #left-controls,#right-controls{position:absolute;top:16px;height:48px;display:flex}
        #left-controls{left:16px;width:116px}
        #right-controls{right:16px;width:144px}
        /* A deliberately distinctive sheet: opaque, rounded, blurred — none of
           it matching the styles.css fallback. */
        #shorts-sheet{
          position:fixed;left:0;bottom:0;width:452px;height:300px;
          background-color:rgb(40,40,40);border-radius:12px;
          backdrop-filter:blur(6px);
        }
      </style>
      <ytd-reel-video-renderer is-active aria-hidden="false">
        <div id="shorts-player" class="html5-video-player">
          <video class="html5-main-video"></video>
          <ytd-shorts-player-controls>
            <div id="left-controls"></div><div id="right-controls"></div>
          </ytd-shorts-player-controls>
        </div>
      </ytd-reel-video-renderer>
      <yt-sheet-view-model id="shorts-sheet"><h2>Captions</h2></yt-sheet-view-model>`,
    }),
  );
  await page.goto("http://yt.test/shorts/PAINT1");
  await installChromeStub(page, { qt_playbackRate: 1, qt_paceLock: false });
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await page.locator("#qt-cluster .qt-chrome-btn").click();
  await expect(page.locator("#qt-speed-menu")).toBeVisible();

  const paint = await page.evaluate(() => {
    const read = (el) => {
      const style = getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
      };
    };
    return {
      sheet: read(document.getElementById("shorts-sheet")),
      toolkit: read(document.getElementById("qt-speed-menu")),
    };
  });

  expect(
    paint.toolkit.backgroundColor,
    "the Shorts menu is still wearing the watch-menu fallback",
  ).toBe(paint.sheet.backgroundColor);
  expect(paint.toolkit.backdropFilter).toBe(paint.sheet.backdropFilter);
});
