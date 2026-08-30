"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "content/inject.js"), "utf8");

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function harness(responseText, options = {}) {
  const posts = [];
  const fetches = [];
  const setOptions = [];
  const intervals = [];
  const listeners = {};
  const pendingFetches = [];
  let ccOn = false;

  const videoId = options.videoId || "VIDEO1";
  const shorts = options.shorts === true;
  const asr = {
    languageCode: "en",
    kind: "asr",
    vssId: "a.en",
    baseUrl:
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&signature=TARGET`,
    name: { simpleText: "English (auto-generated)" },
  };
  const playerResponse = {
    videoDetails: { videoId },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [asr],
        translationLanguages: [
          { languageCode: "ab", languageName: { simpleText: "Abkhazian" } },
        ],
      },
    },
  };
  const player = {
    classList: { add() {}, remove() {} },
    getPlayerResponse: () => playerResponse,
    getBoundingClientRect: () => ({ width: 508, height: 904 }),
    loadModule() {},
    isSubtitlesOn: () => ccOn,
    getOption(_module, key) {
      if (key === "track") return {};
      if (key === "tracklist") return [asr];
      return undefined;
    },
    setOption(module, key, value) {
      setOptions.push({ module, key, value });
      if (module === "captions" && key === "track") ccOn = true;
    },
  };
  const location = {
    origin: "https://www.youtube.com",
    search: shorts ? "" : `?v=${videoId}`,
    pathname: shorts ? `/shorts/${videoId}` : "/watch",
  };
  const response = (text) => ({
    text: async () => text,
    clone() {
      return this;
    },
  });
  const windowObj = {
    location,
    ytInitialPlayerResponse: playerResponse,
    postMessage(payload) {
      posts.push(JSON.parse(JSON.stringify(payload)));
    },
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    fetch(url) {
      fetches.push(String(url));
      if (options.deferFetch) {
        return new Promise((resolve) => pendingFetches.push({ resolve }));
      }
      return Promise.resolve(response(responseText));
    },
  };
  windowObj.window = windowObj;
  const sandbox = {
    window: windowObj,
    document: {
      readyState: "complete",
      addEventListener(type, fn) {
        (listeners[type] || (listeners[type] = [])).push(fn);
      },
      querySelector(selector) {
        if (shorts && selector.includes("ytd-reel-video-renderer")) return null;
        return !shorts && selector.includes("movie_player") ? player : null;
      },
      querySelectorAll(selector) {
        if (shorts && selector.includes("ytd-reel-video-renderer")) return [player];
        return [];
      },
    },
    location,
    URL,
    URLSearchParams,
    XMLHttpRequest: {
      prototype: { open() {}, send() {}, addEventListener() {} },
    },
    setTimeout(fn) {
      fn();
      return 1;
    },
    setInterval(fn) {
      intervals.push(fn);
      return intervals.length;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {
    posts,
    fetches,
    setOptions,
    intervals,
    ccOn: () => ccOn,
    pendingCount: () => pendingFetches.length,
    resolvePending(text = responseText) {
      const pending = pendingFetches.shift();
      if (pending) pending.resolve(response(text));
    },
    navigate(pathname) {
      location.pathname = pathname;
      location.search = "";
      (listeners["yt-navigate-finish"] || []).forEach((fn) => fn());
    },
  };
}

test("empty timedtext never forces CC and retries stay bounded", async () => {
  const h = harness("<timedtext></timedtext>");
  await tick();
  await tick();
  for (let i = 0; i < 3; i++) {
    h.intervals.forEach((fn) => fn());
    await tick();
    await tick();
  }
  assert.equal(h.ccOn(), false, "ASR bootstrap changed CC OFF to ON");
  assert.equal(
    h.setOptions.filter((x) => x.module === "captions" && x.key === "track").length,
    0,
    "ASR bootstrap selected a visible caption track",
  );
  assert.equal(
    h.posts.some((p) => p.type === "QT_TIMEDTEXT"),
    false,
    "empty <timedtext> was accepted as cues",
  );
  assert.ok(h.fetches.length <= 4, `request storm: ${h.fetches.length} fetches`);
});

test("Shorts derives the path video id and fetches ASR without changing CC", async () => {
  const body = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: "short speech" }] }],
  });
  const h = harness(body, { shorts: true, videoId: "SHORT1" });
  await tick();
  await tick();

  const tracks = h.posts.find((post) => post.type === "QT_TRACKS");
  const timed = h.posts.find((post) => post.type === "QT_TIMEDTEXT");
  assert.equal(tracks?.videoId, "SHORT1");
  assert.equal(timed?.original, true);
  assert.equal(timed?.lang, "en");
  assert.equal(timed?.videoId, "SHORT1");
  assert.match(h.fetches[0] || "", /[?&]v=SHORT1(?:&|$)/);
  assert.equal(h.ccOn(), false, "Shorts ASR bootstrap changed CC OFF to ON");
  assert.equal(h.setOptions.length, 0, "Shorts ASR bootstrap selected a visible track");
});

test("late ASR from the previous Short is discarded after navigation", async () => {
  const body = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: "old short" }] }],
  });
  const h = harness(body, {
    shorts: true,
    videoId: "SHORT1",
    deferFetch: true,
  });
  assert.equal(h.pendingCount(), 1, "expected the first Short ASR fetch to be pending");

  h.navigate("/shorts/SHORT2");
  h.resolvePending();
  await tick();
  await tick();

  assert.equal(
    h.posts.some((post) => post.type === "QT_TIMEDTEXT"),
    false,
    "the previous Short ASR response crossed the navigation boundary",
  );
  assert.equal(h.ccOn(), false);
  assert.equal(h.setOptions.length, 0);
});

/* W-011 — a single timedtext fetch authority.
   The isolated world used to fetch through the service worker (pace.js
   bgPull) while MAIN inject.js fetched from the page. Two authorities made
   the live probe's page-level request count unable to see the real total,
   and re-armed the QT_TRACKS -> QT_NEED_TRACKS storm. Only inject.js may
   fetch timedtext; captions.js asks it via QT_FETCH_TRACK. */
test("only the MAIN world inject fetches timedtext", () => {
  const isolated = ["content/pace.js", "content/captions.js", "content/yt-menu-patch.js"];
  for (const file of isolated) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(
      /QT_FETCH\b(?!_TRACK)/.test(text),
      false,
      `${file} must not send QT_FETCH; inject.js is the only fetch authority`,
    );
    assert.equal(
      /\bfetch\s*\(/.test(text),
      false,
      `${file} must not call fetch() directly`,
    );
  }
});
