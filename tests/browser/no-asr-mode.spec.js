/* W-011 — videos with no original-language ASR.
 *
 * Contract (HANDOFF 2026-08-20 §2, SPEC supersession): manual speed and every
 * stored preference survive, but Pace Lock, Trim silence, Color highlight and
 * Center word may not be derived from uploaded / cue-level captions. The
 * controls read as unavailable, refuse activation, keep their saved value,
 * and re-arm by themselves when an ASR track arrives late.
 */
const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

const PLAYER = `<style>
  #movie_player { position:relative; width:960px; height:540px; background:#000; }
  .html5-video-player .ytp-caption-segment { font-size:24px; }
  [hidden] { display:none !important; }
</style>
<div id="movie_player" class="html5-video-player">
  <video class="html5-main-video"></video>
  <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
  <div class="ytp-left-controls"></div>
  <div class="ytp-right-controls"></div>
</div>`;

/* Uploaded captions: cue-level times only, no per-word onsets. */
const UPLOADED_CUES = [
  { start: 0, end: 4, text: "one two three four" },
  { start: 5, end: 9, text: "five six seven eight" },
];

/*
 * The pace pill is painted by a 280 ms interval in content/pace.js, so its
 * label lands some time AFTER boot() returns — boot ends on a fixed 400 ms
 * sleep, which usually covers a tick and sometimes does not. Reading the label
 * with a one-shot page.evaluate is therefore a race, and it is the whole
 * reason two tests in this file failed intermittently on unchanged code
 * (no-asr-mode:296 and :309, once each across three clean full-suite runs,
 * while passing 3/3 in isolation).
 *
 * Wait for the label to actually say what this test is about, then assert the
 * rest against that settled value.
 */
async function pillLabel(page, contains) {
  /* Capture the value that satisfied the poll and return THAT. Reading again
     afterwards re-opens the same race the poll just closed: the 280 ms tick can
     repaint between the check and the second read, so the caller would assert
     against a different string than the one that passed. */
  let settled = "";
  await expect
    .poll(
      async () => {
        settled = await page.evaluate(
          () => document.querySelector("#qt-cluster .qt-cluster-label")?.textContent || "",
        );
        return settled;
      },
      { message: `pace pill never showed "${contains}"` },
    )
    .toContain(contains);
  return settled;
}

async function boot(page, { prefs = {}, cues = UPLOADED_CUES, asr = false } = {}) {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER }),
  );
  await page.goto("http://yt.test/watch?v=NOASR");
  await page.evaluate((seed) => {
    window.__qtStorage = {
      qt_paceLock: true,
      qt_trimSilence: true,
      qt_wordHighlight: true,
      qt_centerWord: true,
      qt_playbackRate: 1.75,
      qt_targetWpm: 400,
      ...seed,
    };
    window.__qtStorageListeners = [];
    const area = {
      get(keys, cb) {
        cb(
          Array.isArray(keys)
            ? Object.fromEntries(keys.map((k) => [k, window.__qtStorage[k]]))
            : { ...window.__qtStorage },
        );
      },
      set(values, cb) {
        const changes = {};
        for (const [k, v] of Object.entries(values)) {
          changes[k] = { oldValue: window.__qtStorage[k], newValue: v };
          window.__qtStorage[k] = v;
        }
        window.__qtStorageListeners.forEach((fn) => fn(changes, "sync"));
        if (cb) cb();
      },
    };
    window.chrome = {
      storage: {
        sync: area,
        local: area,
        onChanged: { addListener: (fn) => window.__qtStorageListeners.push(fn) },
      },
      runtime: { id: "fixture", lastError: null, sendMessage: (p, cb) => cb && cb(null) },
    };
  }, prefs);
  for (const file of ["lib/timedtext.js", "lib/wpm.js", "lib/clock.js", "content/pace.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(
    ({ cues, asr }) => {
      const QT = window.QuietTube;
      QT.cues = cues;
      QT.cuesByLang = { en: cues };
      QT.cueProvenance = { en: { asr, original: true, translation: false } };
      QT.originalLang = "en";
      QT.videoId = "NOASR";
      QT._cuesAreAsr = asr;
      QT.tracks = [
        {
          languageCode: "en",
          name: "English",
          baseUrl: "https://www.youtube.com/api/timedtext?v=NOASR&lang=en",
        },
      ];
      const v = document.querySelector("video");
      v.play = () => {};
      Object.defineProperty(v, "paused", { value: false, configurable: true });
      Object.defineProperty(v, "duration", { value: 60, configurable: true });
    },
    { cues, asr },
  );
  await page.waitForTimeout(400);
}

async function openMenu(page) {
  await page.evaluate(() => {
    const btn = document.querySelector(
      "#qt-cluster .qt-chrome-btn, #qt-speed-btn, [data-act='menu'], #qt-cluster button",
    );
    if (btn) btn.click();
  });
  await page.waitForTimeout(150);
}

test("manual speed still applies without ASR", async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => document.querySelector("video").playbackRate)).toBeCloseTo(
    1.75,
    2,
  );
  await page.evaluate(() => chrome.storage.sync.set({ qt_playbackRate: 2 }));
  await expect
    .poll(() => page.evaluate(() => document.querySelector("video").playbackRate))
    .toBe(2);
  await openMenu(page);
  await expect(page.locator("#qt-speed-menu [data-act='rate-range']")).toHaveValue("2");
  await expect(page.locator("#qt-speed-menu [data-act='rate-range']")).toHaveAttribute(
    "aria-valuetext",
    "2x",
  );
});

test("Pace Lock and Trim do not drive the player without ASR", async ({ page }) => {
  await boot(page);
  /* Lock is saved ON with target 400 and the cues would read far below it,
     so an ungated lock would push the rate well away from the manual 1.75x. */
  await page.evaluate(() => {
    const v = document.querySelector("video");
    for (let i = 0; i < 30; i++) {
      Object.defineProperty(v, "currentTime", { value: i * 0.2, configurable: true });
      document.dispatchEvent(new Event("qt-toolkit-frame"));
    }
  });
  await page.waitForTimeout(400);
  const rate = await page.evaluate(() => document.querySelector("video").playbackRate);
  expect(rate, "no rhythm source may move the rate off the manual speed").toBeCloseTo(1.75, 2);
  expect(
    await page.evaluate(() => ({
      lock: window.QuietTube.lockOn(),
      trim: window.QuietTube.trimOn(),
      savedLock: window.QuietTube.state.paceLock,
      savedTrim: window.QuietTube.state.trimSilence,
    })),
  ).toEqual({ lock: false, trim: false, savedLock: true, savedTrim: true });
});

test("the saved Lock and Trim preferences are not erased", async ({ page }) => {
  await boot(page);
  expect(
    await page.evaluate(() => ({
      lock: window.__qtStorage.qt_paceLock,
      trim: window.__qtStorage.qt_trimSilence,
      hi: window.__qtStorage.qt_wordHighlight,
      center: window.__qtStorage.qt_centerWord,
      wpm: window.__qtStorage.qt_targetWpm,
      rate: window.__qtStorage.qt_playbackRate,
    })),
  ).toEqual({ lock: true, trim: true, hi: true, center: true, wpm: 400, rate: 1.75 });
});

test("disabled rows explain the requirement and refuse activation", async ({ page }) => {
  await boot(page, { prefs: { qt_paceLock: false, qt_trimSilence: false } });
  await openMenu(page);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#qt-speed-menu [data-toggle]")).map((r) => ({
      key: r.getAttribute("data-toggle"),
      disabled: r.getAttribute("aria-disabled"),
      title: r.getAttribute("title") || "",
    })),
  );
  expect(rows.length, "pace menu must render its toggle rows").toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.disabled, `${row.key} must be disabled without ASR`).toBe("true");
    expect(row.title.toLowerCase()).toContain("auto-generated");
  }
  /* Clicking must not turn the preference on. */
  await page.evaluate(() => {
    document
      .querySelectorAll("#qt-speed-menu [data-toggle]")
      .forEach((r) => r.click());
  });
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => ({
      lock: window.__qtStorage.qt_paceLock,
      trim: window.__qtStorage.qt_trimSilence,
    })),
  ).toEqual({ lock: false, trim: false });
});

test("a late ASR track re-arms Lock and Trim without touching CC or language", async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.QuietTube.lockOn())).toBe(false);
  const ccBefore = await page.evaluate(() =>
    document.querySelector(".ytp-subtitles-button").getAttribute("aria-pressed"),
  );

  /* Start, but do not commit, a manual-speed preview. ASR adoption rebuilds
     the connected menu into WPM mode and must cancel this obsolete drag back
     to the persisted 1.75x preference. */
  await openMenu(page);
  await page.locator("#qt-speed-menu [data-act='rate-range']").evaluate((range) => {
    range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    range.value = "2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    await page.evaluate(() => ({
      dragging: window.QuietTube._dragging,
      preview: window.QuietTube._userRate,
      saved: window.__qtStorage.qt_playbackRate,
    })),
  ).toEqual({ dragging: true, preview: 2, saved: 1.75 });

  /* The auto-generated track arrives; nothing else changes. */
  await page.evaluate(() => {
    window.postMessage(
      {
        source: "quiettube",
        type: "QT_TIMEDTEXT",
        videoId: "NOASR",
        url: "https://www.youtube.com/api/timedtext?v=NOASR&lang=en&kind=asr",
        lang: "en",
        original: true,
        asr: true,
        text: JSON.stringify({
          events: [
            { tStartMs: 0, dDurationMs: 4000, segs: [
              { utf8: "one", tOffsetMs: 100 }, { utf8: " two", tOffsetMs: 900 },
              { utf8: " three", tOffsetMs: 1700 }, { utf8: " four", tOffsetMs: 2600 },
            ] },
          ],
        }),
      },
      "*",
    );
  });
  await expect.poll(() => page.evaluate(() => window.QuietTube.lockOn())).toBe(true);
  expect(await page.evaluate(() => window.QuietTube.trimOn())).toBe(true);
  expect(
    await page.evaluate(() => ({
      dragging: window.QuietTube._dragging,
      manual: window.QuietTube._userRate,
      saved: window.__qtStorage.qt_playbackRate,
      hasWpm: !!document.querySelector("#qt-speed-menu [data-act='wpm-range']"),
      hasRate: !!document.querySelector("#qt-speed-menu [data-act='rate-range']"),
    })),
  ).toEqual({ dragging: false, manual: 1.75, saved: 1.75, hasWpm: true, hasRate: false });
  expect(
    await page.evaluate(() =>
      document.querySelector(".ytp-subtitles-button").getAttribute("aria-pressed"),
    ),
    "re-arming must not touch CC",
  ).toBe(ccBefore);

  /* The menu repaints itself: no toggling CC or re-picking the language. */
  await expect(page.locator("#qt-speed-menu")).toBeVisible();
  const stillDisabled = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#qt-speed-menu [data-toggle]")).map((r) =>
      r.getAttribute("aria-disabled"),
    ),
  );
  expect(stillDisabled.every((v) => v === "false")).toBe(true);

  await page.locator("#qt-speed-menu [data-toggle='paceLock']").click();
  await expect(page.locator("#qt-speed-menu [data-act='rate-range']")).toHaveValue("1.75");
  expect(await page.evaluate(() => window.__qtStorage.qt_playbackRate)).toBe(1.75);
});

test("with ASR present the controls are live", async ({ page }) => {
  await boot(page, {
    asr: true,
    cues: [
      { start: 0, end: 4, text: "one two three four", words: [
        { w: "one", t: 0.1 }, { w: "two", t: 0.9 },
        { w: "three", t: 1.7 }, { w: "four", t: 2.6 },
      ] },
    ],
  });
  expect(
    await page.evaluate(() => ({
      lock: window.QuietTube.lockOn(),
      trim: window.QuietTube.trimOn(),
    })),
  ).toEqual({ lock: true, trim: true });
});

test("the pill marks WPM unavailable instead of inventing a number", async ({ page }) => {
  await boot(page);
  const text = await pillLabel(page, "— WPM");
  /* Not "0 WPM" (that means a real pause) and not the Lock target (that would
     present the goal as a measurement). */
  expect(text).not.toContain("0 WPM");
  expect(text).not.toContain("400 WPM");
  expect(text, "the manual speed is still shown").toContain("1.75x");
});

test("with ASR the pill reports the Lock target again", async ({ page }) => {
  await boot(page, {
    asr: true,
    cues: [
      { start: 0, end: 4, text: "one two three four", words: [
        { w: "one", t: 0.1 }, { w: "two", t: 0.9 },
        { w: "three", t: 1.7 }, { w: "four", t: 2.6 },
      ] },
    ],
  });
  const text = await pillLabel(page, "400 WPM");
  expect(text).not.toContain("— WPM");
});

/* W-011 — navigating from a video WITH ASR to one without must put the
   controls back into their unavailable state. adoptOriginalCues repaints on
   the false->true transition; nothing repainted true->false, so the rows kept
   the previous video's enabled state and a click overwrote the persisted
   preference the contract protects. */
test("an ASR video followed by a no-ASR video re-disables the controls", async ({ page }) => {
  await boot(page, {
    asr: true,
    cues: [
      { start: 0, end: 4, text: "one two three four", words: [
        { w: "one", t: 0.1 }, { w: "two", t: 0.9 },
        { w: "three", t: 1.7 }, { w: "four", t: 2.6 },
      ] },
    ],
  });
  await openMenu(page);
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("#qt-speed-menu [data-toggle]")).map((r) =>
        r.getAttribute("aria-disabled"),
      ),
    ),
  ).toEqual(["false", "false"]);

  /* SPA-navigate to a video with no ASR; the player element survives. */
  await page.evaluate(() => {
    history.replaceState({}, "", "/watch?v=NOASR2");
    document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
  });
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => window.QuietTube.asrRhythm())).toBe(false);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#qt-speed-menu [data-toggle]")).map((r) => ({
      key: r.getAttribute("data-toggle"),
      disabled: r.getAttribute("aria-disabled"),
    })),
  );
  for (const row of rows) {
    expect(row.disabled, `${row.key} must be disabled again after the navigation`).toBe("true");
  }

  /* And a click must not overwrite the saved preference. */
  await page.evaluate(() =>
    document.querySelectorAll("#qt-speed-menu [data-toggle]").forEach((r) => r.click()),
  );
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => ({
      lock: window.__qtStorage.qt_paceLock,
      trim: window.__qtStorage.qt_trimSilence,
    })),
  ).toEqual({ lock: true, trim: true });
});

test("without ASR the menu still offers manual speed control", async ({ page }) => {
  await boot(page);
  await openMenu(page);
  /* Pace lock is saved ON, but with no rhythm source the Lock body would show
     a WPM slider and no speed presets, leaving no way to change speed at all
     while the native Playback speed row stays hidden. */
  const menu = await page.evaluate(() => {
    const m = document.getElementById("qt-speed-menu");
    return {
      presets: m.querySelectorAll("[data-rate]").length,
      hasWpmRange: !!m.querySelector("[data-act='wpm-range']"),
      head: (m.querySelector(".qt-menu-head span") || {}).textContent || "",
    };
  });
  expect(menu.presets, "manual speed presets must be reachable").toBeGreaterThan(0);
  expect(menu.hasWpmRange, "a WPM slider that cannot drive anything must not be shown").toBe(false);
  expect(menu.head).toContain("Playback speed");
});
