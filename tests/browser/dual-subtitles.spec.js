/* W-011 — Dual Subtitles must render two stacked lines, not just two checks.
 *
 * The user reports the Subtitles/CC menu marking two languages while the
 * player never shows two caption lines, in normal / Color highlight /
 * Center word. These tests drive content/captions.js with two usable cue
 * sources and assert real geometry: both lines connected, visible, carrying
 * different text, and not overlapping.
 */
const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

const PLAYER = `<style>
  #movie_player { position:relative; width:960px; height:540px; background:#000; }
  .html5-video-player .ytp-caption-segment { font-size:24px; }
  .qt-cap-line { position:absolute; }
  [hidden] { display:none !important; }
</style>
<div id="movie_player" class="html5-video-player">
  <video class="html5-main-video"></video>
  <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
  <div class="ytp-caption-window-container">
    <span class="ytp-caption-segment">native</span>
  </div>
</div>`;

const PREVIEW_BEFORE_PLAYER = `<style>
  .html5-video-player { position:relative; width:960px; height:540px; background:#000; }
  .html5-video-player .ytp-caption-segment { font-size:24px; }
  .qt-cap-line { position:absolute; }
  [hidden] { display:none !important; }
</style>
<div id="preview" class="html5-video-player">
  <video class="html5-main-video"></video>
  <button class="ytp-subtitles-button" aria-pressed="false">Preview CC</button>
</div>
<div id="movie_player" data-fixture-player="initial" class="html5-video-player captions-enabled">
  <video class="html5-main-video"></video>
  <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
  <div class="ytp-caption-window-container">
    <span class="ytp-caption-segment">native</span>
  </div>
</div>`;

const SHORTS_PLAYERS = `<style>
  body { margin:0; }
  ytd-reel-video-renderer {
    position:absolute; left:180px; top:20px; width:452px; height:804px;
    display:none;
  }
  ytd-reel-video-renderer[is-active] { display:block; }
  #shorts-player, #movie_player {
    position:relative; width:452px; height:804px; background:#000;
  }
  #movie_player { position:absolute; left:760px; top:20px; display:block; }
  .qt-cap-line { position:absolute; }
  [hidden] { display:none !important; }
</style>
<ytd-reel-video-renderer data-video="SHORT-A" aria-hidden="true">
  <div id="shorts-player" class="html5-video-player captions-enabled">
    <video class="html5-main-video"></video>
    <button class="ytp-subtitles-button" aria-pressed="true">CC A</button>
    <div class="ytp-caption-window-container"><span class="ytp-caption-segment" style="font-size:28px">native A</span></div>
  </div>
</ytd-reel-video-renderer>
<ytd-reel-video-renderer data-video="SHORT-B" is-active aria-hidden="false">
  <div id="shorts-player" class="html5-video-player captions-enabled">
    <video class="html5-main-video"></video>
    <button class="ytp-subtitles-button" aria-pressed="true">CC B</button>
    <div class="ytp-caption-window-container"><span class="ytp-caption-segment" style="font-size:28px">native B</span></div>
  </div>
</ytd-reel-video-renderer>
<div id="movie_player" class="html5-video-player captions-enabled" data-video="STALE-WATCH">
  <video class="html5-main-video"></video>
  <button class="ytp-subtitles-button" aria-pressed="true">stale watch CC</button>
</div>`;

/* Two independent sources: original English ASR with per-word onsets, and a
   Portuguese translation covering the same span. */
const EN_CUES = [
  { start: 0, end: 4, text: "one two three four", words: [
    { w: "one", t: 0.1 }, { w: "two", t: 1.5 }, { w: "three", t: 2.1 }, { w: "four", t: 3.5 },
  ] },
];
const PT_CUES = [
  { start: 0, end: 4, text: "um dois tres quatro", words: [
    { w: "um", t: 0.1 }, { w: "dois", t: 1.5 }, { w: "tres", t: 2.1 }, { w: "quatro", t: 3.5 },
  ] },
];

async function boot(page, {
  langs,
  dual,
  highlight,
  center,
  captionsEnabled,
  body = PLAYER,
}) {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body }),
  );
  await page.goto("http://yt.test/watch?v=DUAL");
  await page.evaluate(
    ({ langs, dual, highlight, center, captionsEnabled }) => {
      window.__qtStorage = {
        qt_dualCaptions: dual,
        qt_wordHighlight: highlight,
        qt_centerWord: center,
        qt_captionLangs: langs,
        qt_captionBg: true,
      };
      if (captionsEnabled === true || captionsEnabled === false)
        window.__qtStorage.qt_captionsEnabled = captionsEnabled;
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
      window.__qtTrackRequests = [];
      window.addEventListener("message", (e) => {
        const d = e.data;
        if (d && d.source === "quiettube-iso" && d.type === "QT_FETCH_TRACK")
          window.__qtTrackRequests.push(d);
      });
    },
    { langs, dual, highlight, center, captionsEnabled },
  );
  await page.evaluate(
    ({ en, pt }) => {
      const QT = (window.QuietTube = window.QuietTube || {});
      QT.cues = en;
      QT.cuesByLang = { "asr:en": en, en, "tlang:pt": pt };
      QT.cueProvenance = {
        "asr:en": { asr: true, original: true, translation: false },
        en: { asr: true, original: true, translation: false },
        "tlang:pt": { asr: false, original: false, translation: true },
      };
      QT.originalLang = "en";
      QT.videoId = "DUAL";
      QT._cuesAreAsr = true;
      QT.tracks = [
        { languageCode: "en", kind: "asr", vssId: "a.en",
          baseUrl: "https://www.youtube.com/api/timedtext?v=DUAL&lang=en&kind=asr" },
      ];
      QT.translationLanguages = [{ languageCode: "pt", name: "Portuguese" }];
    },
    { en: EN_CUES, pt: PT_CUES },
  );
  for (const file of ["lib/dual-lang.js", "lib/timedtext.js", "content/captions.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(() => {
    const v = document.querySelector("#movie_player video");
    Object.defineProperty(v, "currentTime", { value: 2.2, configurable: true });
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await page.waitForTimeout(120);
}

async function bootShorts(page) {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: SHORTS_PLAYERS }),
  );
  await page.goto("http://yt.test/shorts/SHORT-B");
  await page.evaluate(({ en, pt }) => {
    window.__qtStorage = {
      qt_dualCaptions: true,
      qt_wordHighlight: true,
      qt_centerWord: false,
      qt_captionLangs: ["en", "tlang:pt"],
      qt_captionBg: true,
    };
    window.__qtStorageListeners = [];
    const area = {
      get(keys, cb) {
        cb(
          Array.isArray(keys)
            ? Object.fromEntries(keys.map((key) => [key, window.__qtStorage[key]]))
            : { ...window.__qtStorage },
        );
      },
      set(values, cb) {
        const changes = {};
        Object.entries(values).forEach(([key, value]) => {
          changes[key] = { oldValue: window.__qtStorage[key], newValue: value };
          window.__qtStorage[key] = value;
        });
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
    window.__qtCcClicks = 0;
    document.querySelectorAll("ytd-reel-video-renderer").forEach((reel) => {
      const player = reel.querySelector("#shorts-player");
      const id = reel.dataset.video;
      player.getPlayerResponse = () => ({ videoDetails: { videoId: id } });
      const video = player.querySelector("video");
      Object.defineProperties(video, {
        currentTime: { configurable: true, get: () => 2.2 },
        paused: { configurable: true, get: () => true },
      });
      const cc = player.querySelector(".ytp-subtitles-button");
      cc.addEventListener("click", () => {
        window.__qtCcClicks++;
        const on = cc.getAttribute("aria-pressed") !== "true";
        cc.setAttribute("aria-pressed", String(on));
        player.classList.toggle("captions-enabled", on);
      });
    });
    const stale = document.querySelector("#movie_player video");
    Object.defineProperties(stale, {
      currentTime: { configurable: true, get: () => 2.2 },
      paused: { configurable: true, get: () => true },
    });
    window.QuietTube = {
      cues: en,
      cuesByLang: { "asr:en": en, en, "tlang:pt": pt },
      cueProvenance: {
        "asr:en": { asr: true, original: true, translation: false },
        en: { asr: true, original: true, translation: false },
        "tlang:pt": { asr: false, original: false, translation: true },
      },
      tracks: [{ languageCode: "en", kind: "asr", baseUrl: "?v=SHORT-B&lang=en&kind=asr" }],
      translationLanguages: [{ languageCode: "pt", name: "Portuguese" }],
      originalLang: "en",
      videoId: "SHORT-B",
      _cuesAreAsr: true,
    };
  }, { en: EN_CUES, pt: PT_CUES });
  for (const file of ["lib/dual-lang.js", "lib/timedtext.js", "content/captions.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });
  await page.evaluate(() => document.dispatchEvent(new Event("qt-toolkit-frame")));
  await page.waitForTimeout(120);
}

async function readLines(page) {
  return page.evaluate(() => {
    const one = (id) => {
      const el = document.getElementById(id);
      if (!el) return { present: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        present: true,
        hidden: el.hidden,
        text: el.textContent.trim(),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        rect: { top: r.top, bottom: r.bottom, left: r.left, height: r.height, width: r.width },
      };
    };
    return { p: one("qt-cap-p"), s: one("qt-cap-s") };
  });
}

function expectTwoStackedLines({ p, s }) {
  expect(p.present, "primary line must exist").toBe(true);
  expect(s.present, "secondary line must exist").toBe(true);
  expect(p.hidden, "primary line must not be hidden").toBe(false);
  expect(s.hidden, "secondary line must not be hidden").toBe(false);
  expect(p.display).not.toBe("none");
  expect(s.display).not.toBe("none");
  expect(p.visibility).not.toBe("hidden");
  expect(s.visibility).not.toBe("hidden");
  expect(Number(p.opacity)).toBeGreaterThan(0);
  expect(Number(s.opacity)).toBeGreaterThan(0);
  expect(p.text.length, "primary line must carry text").toBeGreaterThan(0);
  expect(s.text.length, "secondary line must carry text").toBeGreaterThan(0);
  expect(s.text, "two lines must not be the same text").not.toBe(p.text);
  expect(p.rect.height).toBeGreaterThan(0);
  expect(s.rect.height).toBeGreaterThan(0);
  /* Stacked, not overlapping. */
  const gap = Math.min(p.rect.top, s.rect.top) + Math.min(p.rect.height, s.rect.height);
  const overlap = Math.min(p.rect.bottom, s.rect.bottom) - Math.max(p.rect.top, s.rect.top);
  expect(overlap, `lines overlap by ${overlap}px (gap anchor ${gap})`).toBeLessThanOrEqual(0);
}

test("Dual renders two stacked lines in normal mode", async ({ page }) => {
  await boot(page, { langs: ["en", "tlang:pt"], dual: true, highlight: false, center: false });
  expectTwoStackedLines(await readLines(page));
});

test("Dual renders two stacked lines with Color highlight", async ({ page }) => {
  await boot(page, { langs: ["en", "tlang:pt"], dual: true, highlight: true, center: false });
  const lines = await readLines(page);
  expectTwoStackedLines(lines);
  /* Highlight paints the active word in each slot's own colour. */
  const colors = await page.evaluate(() =>
    ["qt-cap-p", "qt-cap-s"].map((id) => {
      const host = document.getElementById(id);
      const active = host.querySelector(".qt-w-on, .qt-on, [data-on='1']");
      return active ? getComputedStyle(active).color : "";
    }),
  );
  expect(colors, "caption colors must match the fixed language slots").toEqual([
    "rgb(255, 204, 0)",
    "rgb(62, 166, 255)",
  ]);
});

test("a lone secondary language keeps its blue slot instead of becoming primary", async ({ page }) => {
  await boot(page, {
    langs: ["", "tlang:pt"],
    dual: true,
    highlight: true,
    center: false,
  });
  const lines = await readLines(page);
  expect(lines.p.present).toBe(true);
  expect(lines.s.present).toBe(true);
  expect(lines.p.hidden, "the vacant primary slot must stay empty").toBe(true);
  expect(lines.s.hidden, "the secondary line must remain visible").toBe(false);
  expect(lines.s.text.length).toBeGreaterThan(0);
  await expect(page.locator("#qt-cap-p")).toHaveAttribute("data-qt-slot", "");
  await expect(page.locator("#qt-cap-s")).toHaveAttribute("data-qt-slot", "1");
  const secondaryColor = await page.locator("#qt-cap-s .qt-w-on").evaluate(
    (el) => getComputedStyle(el).color,
  );
  expect(secondaryColor).toBe("rgb(62, 166, 255)");
  expect(await page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "",
    "tlang:pt",
  ]);
});

test("captions bind to the active watch player and follow its replacement", async ({ page }) => {
  await boot(page, {
    langs: [],
    dual: false,
    highlight: true,
    center: false,
    body: PREVIEW_BEFORE_PLAYER,
  });
  const bound = () =>
    page.evaluate(() => {
      const line = document.getElementById("qt-cap-p");
      return {
        parent: line?.parentElement?.id || "",
        fixture: line?.parentElement?.dataset?.fixturePlayer || "",
        hidden: line?.hidden,
        text: line?.textContent?.trim() || "",
      };
    });
  await expect.poll(bound).toEqual({
    parent: "movie_player",
    fixture: "initial",
    hidden: false,
    text: expect.stringContaining("three"),
  });

  await page.evaluate(() => {
    const prior = document.getElementById("movie_player");
    prior.getPlayerResponse = () => ({ videoDetails: { videoId: "DUAL" } });
    const preview = document.getElementById("preview");
    preview.getPlayerResponse = () => ({ videoDetails: { videoId: "PREVIEW" } });
    window.__qtCcClicks = 0;
    document.querySelectorAll(".ytp-subtitles-button").forEach((button) => {
      button.addEventListener("click", () => window.__qtCcClicks++);
    });

    /* YouTube may retain the previous #movie_player inside its miniplayer
       while the next visible watch player is already live. The old id must
       not pin the overlay, video clock, or CC state to that hidden player. */
    const miniplayer = document.createElement("ytd-miniplayer");
    miniplayer.style.display = "none";
    prior.before(miniplayer);
    miniplayer.appendChild(prior);

    const flexy = document.createElement("ytd-watch-flexy");
    const host = document.createElement("ytd-player");
    const next = document.createElement("div");
    next.className = "html5-video-player captions-enabled";
    next.dataset.fixturePlayer = "next";
    next.innerHTML = `<video class="html5-main-video"></video>
      <button class="ytp-subtitles-button" aria-pressed="true">next CC</button>
      <div class="ytp-caption-window-container">
        <span class="ytp-caption-segment">native next</span>
      </div>`;
    next.getPlayerResponse = () => ({ videoDetails: { videoId: "NEXT" } });
    next.querySelector(".ytp-subtitles-button").addEventListener(
      "click",
      () => window.__qtCcClicks++,
    );
    Object.defineProperty(next.querySelector("video"), "currentTime", {
      value: 2.2,
      configurable: true,
    });
    host.appendChild(next);
    flexy.appendChild(host);
    document.body.appendChild(flexy);
    history.replaceState({}, "", "/watch?v=NEXT");
    window.QuietTube.videoId = "NEXT";
    document.dispatchEvent(new Event("qt-toolkit-frame"));
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(bound).toEqual({
    parent: "",
    fixture: "next",
    hidden: false,
    text: expect.stringContaining("three"),
  });
  expect(await page.locator("#qt-cap-p").count()).toBe(1);
  expect(
    await page.evaluate(() => ({
      clicks: window.__qtCcClicks,
      oldOwnsNative: document
        .getElementById("movie_player")
        ?.classList.contains("qt-ours-on"),
      nextOwnsNative: document
        .querySelector('[data-fixture-player="next"]')
        ?.classList.contains("qt-ours-on"),
    })),
  ).toEqual({ clicks: 0, oldOwnsNative: false, nextOwnsNative: true });
});

test("an explicit captions-off preference survives a host player replacement", async ({ page }) => {
  await boot(page, {
    langs: [],
    dual: false,
    highlight: true,
    center: false,
    captionsEnabled: false,
  });

  const effective = () =>
    page.evaluate(() => {
      const line = document.getElementById("qt-cap-p");
      const player = document.getElementById("movie_player");
      return {
        hidden: line?.hidden,
        ownsNative: player?.classList.contains("qt-ours-on"),
        clicks: window.__qtCcClicks || 0,
      };
    });
  await expect.poll(effective).toEqual({ hidden: true, ownsNative: false, clicks: 0 });

  await page.evaluate(() => {
    const old = document.getElementById("movie_player");
    const next = document.createElement("div");
    next.id = "movie_player";
    next.className = "html5-video-player captions-enabled";
    next.innerHTML = `<video class="html5-main-video"></video>
      <button class="ytp-subtitles-button" aria-pressed="true">replacement CC</button>`;
    Object.defineProperty(next.querySelector("video"), "currentTime", {
      configurable: true,
      value: 2.2,
    });
    window.__qtCcClicks = 0;
    next.querySelector("button").addEventListener("click", () => window.__qtCcClicks++);
    old.replaceWith(next);
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(effective).toEqual({ hidden: true, ownsNative: false, clicks: 0 });

  /* captions.js listens to the preference but still requires the live host
     CC state; it never clicks CC merely to obtain timedtext. */
  await page.evaluate(() => chrome.storage.sync.set({ qt_captionsEnabled: true }));
  await expect.poll(effective).toEqual({ hidden: false, ownsNative: true, clicks: 0 });
  await page.evaluate(() => chrome.storage.sync.set({ qt_captionsEnabled: false }));
  await expect.poll(effective).toEqual({ hidden: true, ownsNative: false, clicks: 0 });
});

test("Shorts Highlight and Center follow the path-matching player without enabling Dual", async ({
  page,
}) => {
  await bootShorts(page);

  const state = () =>
    page.evaluate(() => {
      const primary = document.getElementById("qt-cap-p");
      const secondary = document.getElementById("qt-cap-s");
      const owner = primary?.closest("ytd-reel-video-renderer");
      return {
        primaryCount: document.querySelectorAll("#qt-cap-p").length,
        secondaryCount: document.querySelectorAll("#qt-cap-s").length,
        owner: owner?.dataset.video || "",
        primaryHidden: primary?.hidden,
        secondaryHidden: secondary?.hidden,
        text: primary?.textContent?.replace(/\s+/g, " ").trim() || "",
        rsvp: !!primary?.classList.contains("qt-rsvp"),
        activeOwnsNative: document
          .querySelector("ytd-reel-video-renderer[is-active] #shorts-player")
          ?.classList.contains("qt-ours-on"),
        staleWatchOwnsNative: document
          .getElementById("movie_player")
          ?.classList.contains("qt-ours-on"),
        dualPreference: window.__qtStorage.qt_dualCaptions,
        ccClicks: window.__qtCcClicks,
      };
    });

  await expect.poll(state).toMatchObject({
    primaryCount: 1,
    secondaryCount: 1,
    owner: "SHORT-B",
    primaryHidden: false,
    secondaryHidden: true,
    text: expect.stringContaining("three"),
    activeOwnsNative: true,
    staleWatchOwnsNative: false,
    dualPreference: true,
    ccClicks: 0,
  });

  await page.evaluate(() => {
    chrome.storage.sync.set({ qt_centerWord: true });
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(state).toMatchObject({
    owner: "SHORT-B",
    primaryHidden: false,
    secondaryHidden: true,
    rsvp: true,
    dualPreference: true,
  });

  /* Move to A while B's old cues are still globally present. The singleton
     may reparent immediately, but stale B rhythm must never paint on A. */
  await page.evaluate(() => {
    const a = document.querySelector('[data-video="SHORT-A"]');
    const b = document.querySelector('[data-video="SHORT-B"]');
    b.removeAttribute("is-active");
    b.setAttribute("aria-hidden", "true");
    a.setAttribute("is-active", "");
    a.setAttribute("aria-hidden", "false");
    history.replaceState({}, "", "/shorts/SHORT-A");
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(state).toMatchObject({
    owner: "SHORT-A",
    primaryHidden: true,
    secondaryHidden: true,
    activeOwnsNative: false,
    staleWatchOwnsNative: false,
  });
  expect(
    await page.locator('[data-video="SHORT-B"] #shorts-player').evaluate((player) =>
      player.classList.contains("qt-ours-on"),
    ),
    "the previous reel must stop suppressing its native captions",
  ).toBe(false);

  await page.evaluate(() => {
    const cues = [{
      start: 0,
      end: 4,
      text: "alpha beta gamma",
      words: [
        { w: "alpha", t: 0.1 },
        { w: "beta", t: 1.4 },
        { w: "gamma", t: 2.1 },
      ],
    }];
    window.QuietTube.videoId = "SHORT-A";
    window.QuietTube.cues = cues;
    window.QuietTube.cuesByLang = { "asr:en": cues, en: cues };
    document.dispatchEvent(new Event("qt-cues"));
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(state).toMatchObject({
    owner: "SHORT-A",
    primaryHidden: false,
    secondaryHidden: true,
    text: expect.stringContaining("gamma"),
    activeOwnsNative: true,
    dualPreference: true,
    ccClicks: 0,
  });

  /* CC Off hides our overlay; captions.js must observe, never click, the host. */
  await page.evaluate(() => {
    const player = document.querySelector('[data-video="SHORT-A"] #shorts-player');
    player.querySelector(".ytp-subtitles-button").setAttribute("aria-pressed", "false");
    player.classList.remove("captions-enabled");
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(state).toMatchObject({
    owner: "SHORT-A",
    primaryHidden: true,
    secondaryHidden: true,
    activeOwnsNative: false,
    dualPreference: true,
    ccClicks: 0,
  });
});

test("Shorts never paints next-video cues over the reel that is still visible", async ({ page }) => {
  await bootShorts(page);

  await page.evaluate(() => {
    const cues = [{
      start: 0,
      end: 4,
      text: "alpha beta gamma",
      words: [
        { w: "alpha", t: 0.1 },
        { w: "beta", t: 1.4 },
        { w: "gamma", t: 2.1 },
      ],
    }];
    history.replaceState({}, "", "/shorts/SHORT-A");
    window.QuietTube.videoId = "SHORT-A";
    window.QuietTube.cues = cues;
    window.QuietTube.cuesByLang = { "asr:en": cues, en: cues };
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document.dispatchEvent(new Event("qt-cues"));
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });

  const state = () =>
    page.evaluate(() => {
      const line = document.getElementById("qt-cap-p");
      return {
        owner: line?.closest("ytd-reel-video-renderer")?.dataset.video || "",
        hidden: line?.hidden,
        text: line?.textContent?.replace(/\s+/g, " ").trim() || "",
      };
    });
  await expect.poll(state).toEqual({ owner: "SHORT-B", hidden: true, text: "" });

  await page.evaluate(() => {
    const a = document.querySelector('[data-video="SHORT-A"]');
    const b = document.querySelector('[data-video="SHORT-B"]');
    b.removeAttribute("is-active");
    b.setAttribute("aria-hidden", "true");
    a.setAttribute("is-active", "");
    a.setAttribute("aria-hidden", "false");
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await expect.poll(state).toEqual({
    owner: "SHORT-A",
    hidden: false,
    text: expect.stringContaining("gamma"),
  });
});

test("steady Shorts caption frames reuse the resolved player without document scans", async ({ page }) => {
  await bootShorts(page);
  const counts = await page.evaluate(() => {
    window.__qtResolveCounts = { scans: 0, rects: 0 };
    const query = document.querySelector.bind(document);
    const queryAll = document.querySelectorAll.bind(document);
    document.querySelector = (selector) => {
      if (String(selector).includes("ytd-reel-video-renderer"))
        window.__qtResolveCounts.scans++;
      return query(selector);
    };
    document.querySelectorAll = (selector) => {
      if (String(selector).includes("ytd-reel-video-renderer"))
        window.__qtResolveCounts.scans++;
      return queryAll(selector);
    };
    document.querySelectorAll("#shorts-player").forEach((player) => {
      const rect = player.getBoundingClientRect.bind(player);
      player.getBoundingClientRect = () => {
        window.__qtResolveCounts.rects++;
        return rect();
      };
    });
    window.__qtResolveCounts.scans = 0;
    window.__qtResolveCounts.rects = 0;
    for (let index = 0; index < 20; index++)
      document.dispatchEvent(new Event("qt-toolkit-frame"));
    return window.__qtResolveCounts;
  });
  expect(counts).toEqual({ scans: 0, rects: 0 });
});

test("a stable caption frame does not rewrite overlay attributes", async ({ page }) => {
  await boot(page, {
    langs: ["en", "tlang:pt"],
    dual: true,
    highlight: true,
    center: false,
  });
  const mutations = await page.evaluate(async () => {
    const host = document.getElementById("movie_player");
    let attributes = 0;
    const observer = new MutationObserver((records) => {
      attributes += records.filter((record) => record.type === "attributes").length;
    });
    observer.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "hidden",
        "style",
        "data-qt-slot",
        "data-sig",
      ],
    });
    for (let i = 0; i < 12; i++) {
      document.dispatchEvent(new Event("qt-toolkit-frame"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    observer.disconnect();
    return attributes;
  });
  expect(
    mutations,
    `stable caption attributes were rewritten ${mutations} times`,
  ).toBe(0);
});

test("a stable single-caption frame does not churn the empty secondary line", async ({ page }) => {
  await boot(page, {
    langs: [],
    dual: false,
    highlight: true,
    center: false,
  });
  const mutations = await page.evaluate(async () => {
    const host = document.getElementById("movie_player");
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.length;
    });
    observer.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    for (let i = 0; i < 12; i++) {
      document.dispatchEvent(new Event("qt-toolkit-frame"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    observer.disconnect();
    return count;
  });
  expect(
    mutations,
    `stable single-caption DOM changed ${mutations} times`,
  ).toBe(0);
});

test("Dual renders two stacked strips with Center word", async ({ page }) => {
  await boot(page, { langs: ["en", "tlang:pt"], dual: true, highlight: false, center: true });
  const lines = await readLines(page);
  expectTwoStackedLines(lines);
  const rsvp = await page.evaluate(() =>
    ["qt-cap-p", "qt-cap-s"].map((id) =>
      document.getElementById(id).classList.contains("qt-rsvp"),
    ),
  );
  expect(rsvp).toEqual([true, true]);
});

/* SPEC §7: the saved primary language stays active when Dual is off, and
   "Dual off + highlight off + center off" hides the overlay entirely. These
   are two different rules, so Dual-off is checked with highlight still on. */
test("turning Dual off returns to one line without erasing the saved languages", async ({ page }) => {
  await boot(page, { langs: ["en", "tlang:pt"], dual: true, highlight: true, center: false });
  expectTwoStackedLines(await readLines(page));
  await page.evaluate(() => {
    window.chrome.storage.sync.set({ qt_dualCaptions: false });
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await page.waitForTimeout(120);
  const after = await readLines(page);
  expect(after.p.hidden, "primary line stays while highlight is on").toBe(false);
  expect(after.s.hidden, "secondary line goes away with Dual").toBe(true);
  expect(await page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "en",
    "tlang:pt",
  ]);
});

test("Dual off with highlight and center off hides the overlay for native captions", async ({ page }) => {
  await boot(page, { langs: ["en", "tlang:pt"], dual: false, highlight: false, center: false });
  const lines = await readLines(page);
  expect(lines.p.hidden).toBe(true);
  expect(lines.s.hidden).toBe(true);
  expect(
    await page.evaluate(() =>
      document.querySelector("#movie_player").classList.contains("qt-ours-on"),
    ),
    "native captions must not stay suppressed",
  ).toBe(false);
});

test("a second language with no cues asks once and does not storm", async ({ page }) => {
  await boot(page, { langs: ["en", "tlang:ar"], dual: true, highlight: false, center: false });
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => document.dispatchEvent(new Event("qt-toolkit-frame")));
    await page.waitForTimeout(40);
  }
  const requests = await page.evaluate(() => window.__qtTrackRequests.length);
  expect(requests, "unavailable language must not refetch on every frame").toBeLessThanOrEqual(3);
  /* The saved preference survives an unavailable language. */
  expect(await page.evaluate(() => window.__qtStorage.qt_captionLangs)).toEqual([
    "en",
    "tlang:ar",
  ]);
});

/* End-to-end acquisition: the fixture tests above prove the renderer stacks
   two lines once two cue buffers exist. The user's report ("two checks, one
   line") points upstream, so this drives the whole real chain:
   captions.js requestLang -> QT_FETCH_TRACK -> inject.js fetch ->
   QT_TIMEDTEXT -> pace.js cuesByLang -> two painted lines. */
test("selecting a second language acquires its cues and paints two lines", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER }),
  );
  await page.goto("http://yt.test/watch?v=DUALE2E");
  await page.evaluate(() => {
    window.__qtStorage = {
      qt_dualCaptions: true,
      qt_wordHighlight: false,
      qt_centerWord: false,
      qt_captionLangs: ["en", "tlang:pt"],
      qt_captionBg: true,
      qt_paceLock: false,
      qt_trimSilence: false,
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
    window.__qtFetches = [];
    const ASR = JSON.stringify({
      events: [{ tStartMs: 0, dDurationMs: 4000, segs: [
        { utf8: "one", tOffsetMs: 100 }, { utf8: " two", tOffsetMs: 1500 },
        { utf8: " three", tOffsetMs: 2100 }, { utf8: " four", tOffsetMs: 3500 },
      ] }],
    });
    const PT = JSON.stringify({
      events: [{ tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: "um dois tres quatro" }] }],
    });
    window.fetch = (url) => {
      const u = String(url);
      window.__qtFetches.push(u);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(/tlang=pt/.test(u) ? PT : ASR),
      });
    };
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get: () => ({
        videoDetails: { videoId: "DUALE2E" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{
              languageCode: "en", kind: "asr", vssId: "a.en",
              name: { simpleText: "English (auto-generated)" },
              baseUrl: "https://www.youtube.com/api/timedtext?v=DUALE2E&lang=en&kind=asr",
            }],
            translationLanguages: [
              { languageCode: "pt", languageName: { simpleText: "Portuguese" } },
            ],
          },
        },
      }),
    });
  });
  for (const file of [
    "lib/dual-lang.js", "lib/timedtext.js", "lib/wpm.js", "lib/clock.js",
    "content/pace.js", "content/captions.js", "content/inject.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(window.QuietTube.cuesByLang || {}).filter(
            (k) => (window.QuietTube.cuesByLang[k] || []).length,
          ),
        ),
      { timeout: 15_000 },
    )
    .toEqual(expect.arrayContaining(["tlang:pt"]));

  await page.evaluate(() => {
    const v = document.querySelector("video");
    Object.defineProperty(v, "currentTime", { value: 2.2, configurable: true });
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  await page.waitForTimeout(150);
  expectTwoStackedLines(await readLines(page));

  /* The translation may never become the rhythm source. */
  expect(
    await page.evaluate(() => ({
      asr: window.QuietTube._cuesAreAsr,
      first: window.QuietTube.cues[0]?.words?.[0]?.w,
    })),
  ).toEqual({ asr: true, first: "one" });
});

/* W-011 — captions.js must not spam the fetch authority.
   tick() runs at ~7 Hz. requestLang() used to post QT_NEED_TRACKS on every
   frame while the track list was empty, and to retry an unresolvable language
   every 3 s forever. Both make inject.js re-parse the player response and
   force-fetch, which is the same storm shape as the QT_TRACKS loop. */
test("an empty track list does not make captions.js ask on every frame", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER }),
  );
  await page.goto("http://yt.test/watch?v=NOTRACKS");
  await page.evaluate(() => {
    window.__qtStorage = {
      qt_dualCaptions: true,
      qt_wordHighlight: false,
      qt_centerWord: false,
      qt_captionLangs: ["en", "tlang:pt"],
      qt_captionBg: true,
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
        for (const [k, v] of Object.entries(values)) window.__qtStorage[k] = v;
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
    window.__qtAsks = 0;
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (d && d.source === "quiettube-iso" && d.type === "QT_NEED_TRACKS") window.__qtAsks++;
    });
    /* Track list stays empty, as during an SPA navigation. */
    window.QuietTube = {
      cues: [], cuesByLang: {}, cueProvenance: {},
      tracks: [], translationLanguages: [],
      originalLang: "", videoId: "NOTRACKS", _cuesAreAsr: false,
    };
  });
  for (const file of ["lib/dual-lang.js", "lib/timedtext.js", "content/captions.js"])
    await page.addScriptTag({ path: path.join(ROOT, file) });

  /* Drive tick() at the real overlay cadence for 3 seconds. */
  await page.evaluate(async () => {
    for (let i = 0; i < 21; i++) {
      document.dispatchEvent(new Event("qt-toolkit-frame"));
      await new Promise((r) => setTimeout(r, 140));
    }
  });
  const asks = await page.evaluate(() => window.__qtAsks);
  expect(asks, `QT_NEED_TRACKS posted ${asks} times in ~3s of ticking`).toBeLessThanOrEqual(3);
});
