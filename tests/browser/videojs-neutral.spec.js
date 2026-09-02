const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

async function bootVideoJs(page, initial) {
  await page.route("http://vjs.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html>
        <html data-qt-videojs-fixture><body>
          <main id="fixture-host">
            <div class="video-js vjs-paused vjs-user-active" style="width:738px;height:415px">
              <video class="vjs-tech"></video>
              <div class="vjs-control-bar" style="height:30px">
                <div class="vjs-volume-panel"></div>
                <div class="vjs-current-time"></div><div class="vjs-time-divider"></div>
                <div class="vjs-duration"></div>
                <app-settings>
                  <button type="button">Settings</button>
                  <button type="button" data-playback-rate="2">2x</button>
                  <button type="button" data-setting="quality">Quality</button>
                </app-settings>
              </div>
            </div>
          </main>
        </body></html>`,
    }),
  );
  await page.goto("http://vjs.test/course");
  await page.evaluate((seed) => {
    window.__qtStorage = { ...seed };
    window.__qtStorageListeners = [];
    window.__qtWrites = [];
    const read = (keys) => {
      if (Array.isArray(keys))
        return Object.fromEntries(keys.map((key) => [key, window.__qtStorage[key]]));
      return { ...window.__qtStorage };
    };
    const area = {
      get(keys, callback) {
        callback(read(keys));
      },
      set(values, callback) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: window.__qtStorage[key], newValue: value };
          window.__qtStorage[key] = value;
        }
        window.__qtWrites.push({ ...values });
        window.__qtStorageListeners.forEach((listener) => listener(changes, "sync"));
        callback?.();
      },
    };
    window.chrome = {
      runtime: { id: "fixture", lastError: null },
      storage: {
        sync: area,
        local: area,
        onChanged: {
          addListener(listener) {
            window.__qtStorageListeners.push(listener);
          },
        },
      },
    };
    if (!crypto.randomUUID) crypto.randomUUID = () => "fixture-channel";
    window.__bindVideoJsMedia = (video) => {
      let rate = 1;
      Object.defineProperties(video, {
        duration: { configurable: true, get: () => 832 },
        currentTime: { configurable: true, get: () => 20 },
        paused: { configurable: true, get: () => true },
        playbackRate: {
          configurable: true,
          get: () => rate,
          set(value) {
            rate = Number(value);
            video.dispatchEvent(new Event("ratechange"));
          },
        },
      });
    };
    window.__bindVideoJsMedia(document.querySelector("video"));
  }, initial);
  for (const file of [
    "lib/prefs.js",
    "lib/clock.js",
    "lib/videojs.js",
    "content/videojs.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await expect(page.locator(".qt-vjs-cluster")).toBeAttached();
}

test("Video.js preserves global fixed 1x across reattach and exits on committed controls", async ({
  page,
}) => {
  await bootVideoJs(page, {
    qt_playbackRate: 1.5,
    qt_fixed1x: true,
    qt_vjs_dualCaptions: false,
    qt_vjs_primaryTrack: "",
    qt_vjs_secondaryTrack: "",
    qt_vjs_slotsChosen: false,
  });

  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  await expect(page.locator(".qt-vjs-cluster")).toHaveClass(/is-neutral/);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.5);
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(true);

  await page.keyboard.press("Shift+Backquote");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1.5);
  await page.keyboard.press("a");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(true);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);

  await page.evaluate(() => {
    const oldRoot = document.querySelector(".video-js");
    const nextRoot = document.createElement("div");
    nextRoot.className = "video-js vjs-paused vjs-user-active";
    nextRoot.style.cssText = "width:471px;height:265px";
    nextRoot.innerHTML = `<video class="vjs-tech"></video>
      <div class="vjs-control-bar" style="height:30px">
        <div class="vjs-volume-panel"></div>
        <div class="vjs-current-time"></div><div class="vjs-time-divider"></div>
        <div class="vjs-duration"></div>
        <app-settings><button type="button">Settings</button></app-settings>
      </div>`;
    oldRoot.replaceWith(nextRoot);
    window.__bindVideoJsMedia(nextRoot.querySelector("video"));
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  await expect(page.locator(".qt-vjs-cluster")).toHaveClass(/is-neutral/);

  await page.locator(".qt-vjs-speed-button").click();
  const range = page.locator("[data-action='rate-range']");
  await range.evaluate((control) => {
    control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    control.value = "2.4";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  });
  await expect(page.locator(".qt-vjs-cluster")).toHaveClass(/is-neutral/);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.5);
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(true);

  await range.evaluate((control) => {
    control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    control.value = "2.25";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(2.25);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2.25);

  /* A storage update represents another Toolkit tab toggling the global state. */
  await page.evaluate(() => chrome.storage.sync.set({ qt_fixed1x: true }));
  await expect(page.locator(".qt-vjs-cluster")).toHaveClass(/is-neutral/);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  await page.keyboard.press("d");
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(2.5);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2.5);
});

test("Video.js rejects unrelated settings/reset events and commits an explicit native speed across replacement", async ({
  page,
}) => {
  await bootVideoJs(page, {
    qt_playbackRate: 1.5,
    qt_fixed1x: true,
    qt_vjs_dualCaptions: false,
    qt_vjs_primaryTrack: "",
    qt_vjs_secondaryTrack: "",
    qt_vjs_slotsChosen: false,
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  await page.waitForTimeout(450);

  await page.locator("video").evaluate((video) => {
    video.playbackRate = 1.75;
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(true);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.5);

  /* Opening generic settings is not a speed choice. A host reset immediately
     afterwards must still be fought back to fixed 1x. */
  await page.locator("app-settings button").first().dispatchEvent("pointerdown");
  await page.locator("video").evaluate((video) => {
    video.playbackRate = 1.75;
  });
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(1);
  expect(await page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(true);
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.5);

  /* A positively identified native rate row is explicit intent. Persist it
     before Angular can replace the player and cancel deferred work. */
  await page.locator("[data-playback-rate='2']").dispatchEvent("pointerdown");
  await page.locator("video").evaluate((video) => {
    video.playbackRate = 2;
  });
  await page.evaluate(() => {
    const oldRoot = document.querySelector(".video-js");
    const nextRoot = document.createElement("div");
    nextRoot.className = "video-js vjs-paused vjs-user-active";
    nextRoot.style.cssText = "width:471px;height:265px";
    nextRoot.innerHTML = `<video class="vjs-tech"></video>
      <div class="vjs-control-bar" style="height:30px">
        <div class="vjs-volume-panel"></div>
        <div class="vjs-current-time"></div><div class="vjs-time-divider"></div>
        <div class="vjs-duration"></div>
        <app-settings><button type="button">Settings</button></app-settings>
      </div>`;
    oldRoot.replaceWith(nextRoot);
    window.__bindVideoJsMedia(nextRoot.querySelector("video"));
  });
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_fixed1x)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(2);
  await expect.poll(() => page.locator("video").evaluate((video) => video.playbackRate)).toBe(2);
});
