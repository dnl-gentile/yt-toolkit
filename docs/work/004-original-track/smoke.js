/* Vm check of content/inject.js original-track posting. Exit 1 if reverted. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "../../..");
const src = fs.readFileSync(path.join(root, "content/inject.js"), "utf8");

const posts = [];
const fetches = [];
const json3 = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "hello there" }] }],
});
const zhJson3 = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "你好" }] }],
});

const listeners = {};
function on(type, fn) {
  (listeners[type] || (listeners[type] = [])).push(fn);
}

const location = {
  origin: "https://www.youtube.com",
  search: "?v=VIDEO1",
};

const windowObj = {
  __qtMain: false,
  postMessage(p) {
    posts.push(JSON.parse(JSON.stringify(p)));
  },
  addEventListener: on,
  fetch(url) {
    const u = String(url);
    fetches.push(u);
    const needsProof = /tlang=pt/.test(u);
    const body =
      needsProof && !/[?&]pot=TOKEN/.test(u)
        ? ""
        : /lang=zh/.test(u) && !/tlang=/.test(u)
          ? zhJson3
          : json3;
    return Promise.resolve({
      text: async () => body,
      clone() {
        return this;
      },
    });
  },
  location,
  ytInitialPlayerResponse: {
    videoDetails: { videoId: "VIDEO1" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en",
            languageCode: "en",
            name: { simpleText: "English" },
            kind: "",
            vssId: ".en",
          },
          {
            baseUrl: "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&kind=asr",
            languageCode: "en",
            name: { simpleText: "English (auto)" },
            kind: "asr",
            vssId: "a.en",
          },
          {
            baseUrl: "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=zh",
            languageCode: "zh",
            name: { simpleText: "Chinese" },
            kind: "",
            vssId: ".zh",
          },
        ],
      },
    },
  },
};
windowObj.window = windowObj;

const sandbox = {
  window: windowObj,
  document: {
    readyState: "complete",
    addEventListener: on,
    querySelector() {
      return null;
    },
  },
  location,
  URL,
  URLSearchParams,
  XMLHttpRequest: {
    prototype: { open() {}, send() {}, addEventListener() {} },
  },
  setTimeout: (fn) => {
    fn();
    return 0;
  },
  setInterval: () => 0,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

function timed() {
  return posts.filter((p) => p.type === "QT_TIMEDTEXT");
}

function tick() {
  return new Promise((r) => setImmediate(r));
}

(async () => {
  await tick();
  await tick();

  const tracks = posts.filter((p) => p.type === "QT_TRACKS");
  assert.ok(tracks.length >= 1, "posted QT_TRACKS");
  assert.equal(tracks[0].tracks[0].kind, "", "uploaded listed first");
  assert.ok(
    tracks[0].tracks.some((t) => t.kind === "asr"),
    "ASR track present",
  );

  const origPosts = timed().filter((p) => p.original === true);
  assert.ok(origPosts.length >= 1, "posted original:true");
  assert.equal(origPosts[0].lang, "en");
  assert.equal(/tlang=/.test(origPosts[0].url), false, "original url has no tlang");
  assert.equal(/fmt=json3/.test(origPosts[0].url), true, "original url is json3");
  assert.ok(
    /kind=asr/.test(origPosts[0].url) || /caps=asr/.test(origPosts[0].url),
    "original payload is ASR, not uploaded",
  );
  assert.ok(
    fetches.some((u) => /lang=en/.test(u) && /kind=asr/.test(u) && !/tlang=/.test(u)),
    "fetched original asr without tlang",
  );

  const nUp = posts.length;
  await windowObj.fetch(
    "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&fmt=json3",
  );
  await tick();
  const uploaded = posts.slice(nUp).filter((p) => p.type === "QT_TIMEDTEXT");
  assert.ok(uploaded.length >= 1, "posted uploaded en");
  assert.ok(
    uploaded.every((p) => p.original === false),
    "uploaded same-lang is original:false when ASR exists",
  );

  const nCaps = posts.length;
  await windowObj.fetch(
    "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&fmt=json3&caps=asr",
  );
  await tick();
  const capsOrig = posts.slice(nCaps).filter((p) => p.type === "QT_TIMEDTEXT");
  assert.ok(
    capsOrig.some((p) => p.original === true),
    "player URL with caps=asr (no kind) is original",
  );

  const before = timed().filter((p) => p.original === true).length;

  await windowObj.fetch(
    "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=zh&fmt=json3",
  );
  await windowObj.fetch(
    "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&tlang=ar&fmt=json3",
  );
  await tick();
  await tick();

  const zh = timed().filter((p) => p.lang === "zh");
  const ar = timed().filter(
    (p) => String(p.lang).includes("ar") || /tlang=ar/.test(p.url),
  );
  assert.ok(zh.length >= 1, "posted zh for dual");
  assert.ok(
    zh.every((p) => p.original === false),
    "zh is original:false",
  );
  assert.ok(ar.length >= 1, "posted tlang ar for dual");
  assert.ok(
    ar.every((p) => p.original === false),
    "tlang is original:false",
  );
  assert.equal(
    timed().filter((p) => p.original === true).length,
    before,
    "translation did not replace lastTimedOriginal",
  );

  const n = posts.length;
  (listeners.message || []).forEach((fn) =>
    fn({
      source: windowObj,
      data: { source: "quiettube-iso", type: "QT_NEED_TRACKS" },
    }),
  );
  const firstTimed = posts.slice(n).find((p) => p.type === "QT_TIMEDTEXT");
  assert.ok(firstTimed, "QT_NEED_TRACKS re-posted timedtext");
  assert.equal(firstTimed.original, true, "re-posted original first");
  assert.equal(firstTimed.lang, "en");

  await windowObj.fetch(
    "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&kind=asr&pot=TOKEN&signature=NATIVE",
  );
  await tick();
  const n2 = posts.length;
  (listeners.message || []).forEach((fn) =>
    fn({
      source: windowObj,
      data: {
        source: "quiettube-iso",
        type: "QT_FETCH_TRACK",
        url: "https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&tlang=pt&fmt=json3&signature=TRANSLATION",
        lang: "tlang:pt",
      },
    }),
  );
  await tick();
  await tick();
  const dual = posts.slice(n2).filter((p) => p.type === "QT_TIMEDTEXT");
  assert.ok(
    dual.some((p) => p.original === false && String(p.lang).includes("pt")),
    "QT_FETCH_TRACK posts translation",
  );
  assert.equal(
    dual.filter((p) => p.original === true && String(p.lang).includes("pt")).length,
    0,
    "translation must not be original:true",
  );
  const translatedFetch = fetches.find(
    (u) => /tlang=pt/.test(u) && /[?&]pot=TOKEN/.test(u),
  );
  assert.ok(translatedFetch, "translation fetch copied pot from player request");
  assert.ok(
    /signature=TRANSLATION/.test(translatedFetch),
    "translation kept its own signature",
  );
  assert.equal(
    /signature=NATIVE/.test(translatedFetch),
    false,
    "native signature did not leak tracks",
  );

  console.log("PASS: original ASR posted original:true lang=en no tlang");
  console.log("PASS: zh and tlang:ar posted original:false");
  console.log("PASS: lastTimedOriginal not replaced by translation");
  console.log("PASS: QT_NEED_TRACKS re-posts original first");
  console.log("PASS: QT_FETCH_TRACK dual translation original:false");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
