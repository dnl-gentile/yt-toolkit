/* W-011 — ASR provenance + fetch budget over the real transport.
 *
 * These tests drive content/inject.js (the single timedtext fetch authority)
 * together with content/pace.js, instead of the removed pace.js bgPull path.
 * They fail if an uploaded/translated track can own QT.cues while an ASR
 * track exists, or if the tracks->NEED_TRACKS->fetch loop is unbounded.
 */
const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

const PLAYER_HTML = `<div id="movie_player" style="position:relative;width:960px;height:540px">
  <video class="html5-main-video"></video>
  <button class="ytp-subtitles-button" aria-pressed="false">CC</button>
  <div class="ytp-left-controls"></div>
  <div class="ytp-right-controls"></div>
</div>`;

const ASR_BODY = JSON.stringify({
  events: [
    {
      tStartMs: 0,
      dDurationMs: 2000,
      segs: [
        { utf8: "real", tOffsetMs: 0 },
        { utf8: " asr", tOffsetMs: 600 },
      ],
    },
  ],
});

const UPLOADED_BODY = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "uploaded fallback" }] }],
});

async function installChromeStub(page, initial = {}) {
  await page.evaluate((seed) => {
    window.__qtStorage = { ...seed };
    window.__qtStorageListeners = [];
    const read = (keys) =>
      Array.isArray(keys)
        ? Object.fromEntries(keys.map((k) => [k, window.__qtStorage[k]]))
        : { ...window.__qtStorage };
    const area = {
      get(keys, cb) {
        cb(read(keys));
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
          (window.__qtMessages = window.__qtMessages || []).push(payload);
          if (cb) cb(null);
        },
      },
    };
  }, initial);
}

/* Serves timedtext over a counted fetch stub and exposes a mutable caption
   tracklist, so a test can make the ASR track appear late. */
async function installHostStub(page, { tracks, asrBody, uploadedBody }) {
  await page.evaluate(
    ({ tracks, asrBody, uploadedBody }) => {
      window.__qtFetches = [];
      window.__qtTracks = tracks;
      const build = () => ({
        videoDetails: { videoId: new URLSearchParams(location.search).get("v") },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: window.__qtTracks,
            translationLanguages: [{ languageCode: "pt", languageName: { simpleText: "Portuguese" } }],
          },
        },
      });
      Object.defineProperty(window, "ytInitialPlayerResponse", {
        configurable: true,
        get: build,
      });
      window.fetch = (url) => {
        const u = String(url);
        window.__qtFetches.push(u);
        const body = /kind=asr/.test(u) && !/tlang=/.test(u) ? asrBody : uploadedBody;
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
      };
    },
    { tracks, asrBody, uploadedBody },
  );
}

async function loadToolkit(page) {
  for (const file of [
    "lib/timedtext.js",
    "lib/wpm.js",
    "lib/clock.js",
    "content/pace.js",
    "content/inject.js",
  ])
    await page.addScriptTag({ path: path.join(ROOT, file) });
}

const UPLOADED_TRACK = {
  languageCode: "en",
  name: { simpleText: "English" },
  baseUrl: "https://www.youtube.com/api/timedtext?v=LATEASR&lang=en",
};
const ASR_TRACK = {
  languageCode: "en",
  kind: "asr",
  vssId: "a.en",
  name: { simpleText: "English (auto-generated)" },
  baseUrl: "https://www.youtube.com/api/timedtext?v=LATEASR&lang=en&kind=asr",
};

test("an uploaded original is replaced when the ASR track appears late", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/watch?v=LATEASR");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await installHostStub(page, {
    tracks: [UPLOADED_TRACK],
    asrBody: ASR_BODY,
    uploadedBody: UPLOADED_BODY,
  });
  await loadToolkit(page);

  /* The uploaded track is the only thing on offer, so it may drive rhythm. */
  await expect
    .poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text))
    .toBe("uploaded fallback");
  expect(await page.evaluate(() => window.QuietTube._cuesAreAsr)).toBe(false);

  /* YouTube populates the auto-generated track a moment later. */
  await page.evaluate(
    (asr) => {
      window.__qtTracks = [asr, ...window.__qtTracks];
    },
    ASR_TRACK,
  );

  await expect
    .poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text), { timeout: 15_000 })
    .toBe("real asr");
  expect(await page.evaluate(() => window.QuietTube._cuesAreAsr)).toBe(true);
});

/* A same-video player replacement can renew the signed timedtext base URL
   without changing the video id or ASR language. The old source URL must not
   stay pinned: otherwise every hidden pull keeps receiving an empty body and
   the first successful transcript is the request YouTube makes when the user
   toggles CC. */
test("a same-video player replacement refreshes the ASR URL without toggling CC", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/watch?v=SAMEID");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await page.evaluate(
    ({ asrBody }) => {
      window.__qtOldAsrUrl =
        "https://www.youtube.com/api/timedtext?v=SAMEID&lang=en&kind=asr&signature=OLD";
      window.__qtNewAsrUrl =
        "https://www.youtube.com/api/timedtext?v=SAMEID&lang=en&kind=asr&signature=NEW";
      window.__qtCurrentAsrUrl = window.__qtOldAsrUrl;
      window.__qtFetches = [];
      window.__qtTimedtextPosts = [];
      const response = (text) => ({
        ok: true,
        status: 200,
        text: () => Promise.resolve(text),
        clone: () => response(text),
      });
      window.fetch = (url) => {
        const raw = String(url);
        window.__qtFetches.push(raw);
        return Promise.resolve(
          response(
            raw.includes("signature=NEW")
              ? asrBody
              : "<timedtext></timedtext>",
          ),
        );
      };
      const bindResponse = (player) => {
        player.getPlayerResponse = () => ({
          videoDetails: { videoId: "SAMEID" },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  languageCode: "en",
                  kind: "asr",
                  vssId: "a.en",
                  baseUrl: window.__qtCurrentAsrUrl,
                },
              ],
              translationLanguages: [],
            },
          },
        });
      };
      bindResponse(document.getElementById("movie_player"));
      window.__qtBindResponse = bindResponse;
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data?.source === "quiettube" && data.type === "QT_TIMEDTEXT")
          window.__qtTimedtextPosts.push(data);
      });
    },
    { asrBody: ASR_BODY },
  );
  await loadToolkit(page);

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__qtFetches.filter((url) => url.includes("signature=OLD")).length,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => window.QuietTube._cuesAreAsr)).toBe(false);
  const ccBefore = await page.evaluate(
    () =>
      document.querySelector(".ytp-subtitles-button")?.getAttribute("aria-pressed") ||
      null,
  );
  expect(ccBefore).toBe("false");

  await page.evaluate(() => {
    window.__qtCurrentAsrUrl = window.__qtNewAsrUrl;
    const prior = document.getElementById("movie_player");
    const replacement = prior.cloneNode(true);
    replacement.id = "movie_player";
    prior.replaceWith(replacement);
    window.__qtBindResponse(replacement);
    document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
  });

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__qtFetches.some((url) => url.includes("signature=NEW")),
        ),
      { timeout: 2500 },
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.QuietTube._cuesAreAsr))
    .toBe(true);
  expect(await page.evaluate(() => window.QuietTube.cues[0]?.text)).toBe("real asr");
  expect(
    await page.evaluate(
      () =>
        document.querySelector(".ytp-subtitles-button")?.getAttribute("aria-pressed") ||
        null,
    ),
    "hidden ASR acquisition must keep CC unchanged",
  ).toBe(ccBefore);

  await page.waitForTimeout(3500);
  const fetches = await page.evaluate(() => window.__qtFetches.slice());
  expect(
    fetches.filter((url) => url.includes("signature=NEW")).length,
    `replacement ASR fetches: ${JSON.stringify(fetches)}`,
  ).toBeLessThanOrEqual(2);
  expect(fetches.length, `all timedtext fetches: ${JSON.stringify(fetches)}`).toBeLessThanOrEqual(
    4,
  );
  const posted = await page.evaluate(() =>
    window.__qtTimedtextPosts.map((item) => item.text),
  );
  expect(posted.length, `timedtext announcements: ${posted.length}`).toBeGreaterThanOrEqual(1);
  expect(posted.length, `timedtext announcements: ${posted.length}`).toBeLessThanOrEqual(2);
  expect(new Set(posted).size, "re-announcement must not change transcript identity").toBe(1);
});

test("a delayed native response from the replaced ASR source is discarded", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/watch?v=SAMEID");
  await page.evaluate(
    ({ freshBody, staleBody }) => {
      window.__qtOldAsrUrl =
        "https://www.youtube.com/api/timedtext?v=SAMEID&lang=en&kind=asr&signature=OLD";
      window.__qtNewAsrUrl =
        "https://www.youtube.com/api/timedtext?v=SAMEID&lang=en&kind=asr&signature=NEW";
      window.__qtCurrentAsrUrl = window.__qtOldAsrUrl;
      window.__qtFetches = [];
      window.__qtXhrRequests = [];
      window.__qtTimedtextPosts = [];
      window.__qtStaleBody = staleBody;
      let resolveOldNative = null;
      const response = (text) => ({
        ok: true,
        status: 200,
        text: () => Promise.resolve(text),
        clone: () => response(text),
      });
      window.fetch = (url) => {
        const raw = String(url);
        window.__qtFetches.push(raw);
        if (raw.includes("signature=OLD") && raw.includes("pot=OLDPOT"))
          return new Promise((resolve) => {
            resolveOldNative = () => resolve(response(staleBody));
          });
        return Promise.resolve(
          response(
            raw.includes("signature=NEW")
              ? freshBody
              : "<timedtext></timedtext>",
          ),
        );
      };
      class FixtureXhr {
        constructor() {
          this.responseText = "";
          this.__listeners = Object.create(null);
        }
        addEventListener(type, listener) {
          (this.__listeners[type] || (this.__listeners[type] = [])).push(listener);
        }
        open(_method, url) {
          this.__fixtureUrl = String(url);
          window.__qtXhrRequests.push(this.__fixtureUrl);
        }
        send() {}
        resolve(text) {
          this.responseText = text;
          (this.__listeners.load || []).forEach((listener) => listener.call(this));
        }
      }
      window.XMLHttpRequest = FixtureXhr;
      const bindResponse = (player) => {
        player.getPlayerResponse = () => ({
          videoDetails: { videoId: "SAMEID" },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  languageCode: "en",
                  kind: "asr",
                  vssId: "a.en",
                  baseUrl: window.__qtCurrentAsrUrl,
                },
              ],
              translationLanguages: [],
            },
          },
        });
      };
      bindResponse(document.getElementById("movie_player"));
      window.__qtBindResponse = bindResponse;
      window.__qtResolveOldNative = () => resolveOldNative?.();
      window.__qtResolveOldXhr = () =>
        window.__qtOldXhr?.resolve(window.__qtStaleBody);
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (data?.source === "quiettube" && data.type === "QT_TIMEDTEXT")
          window.__qtTimedtextPosts.push(data);
      });
    },
    {
      freshBody: ASR_BODY,
      staleBody: JSON.stringify({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 2000,
            segs: [
              { utf8: "stale", tOffsetMs: 0 },
              { utf8: " old", tOffsetMs: 600 },
            ],
          },
        ],
      }),
    },
  );
  await page.addScriptTag({ path: path.join(ROOT, "content/inject.js") });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__qtFetches.filter((url) => url.includes("signature=OLD")).length,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  /* Start a host-owned request against OLD and hold its response until after
     the replacement source has already delivered NEW. */
  await page.evaluate(() => {
    void window.fetch(window.__qtOldAsrUrl + "&pot=OLDPOT");
    const xhr = new XMLHttpRequest();
    xhr.open("GET", window.__qtOldAsrUrl + "&potc=OLDPOTC");
    xhr.send();
    window.__qtOldXhr = xhr;
    window.__qtCurrentAsrUrl = window.__qtNewAsrUrl;
    const prior = document.getElementById("movie_player");
    const replacement = prior.cloneNode(true);
    prior.replaceWith(replacement);
    window.__qtBindResponse(replacement);
    document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__qtTimedtextPosts.some((item) => item.text.includes("real")),
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    window.__qtResolveOldNative();
    window.__qtResolveOldXhr();
  });
  await page.waitForTimeout(250);
  const afterStale = await page.evaluate(() =>
    window.__qtTimedtextPosts.map((item) => item.text),
  );
  expect(afterStale.some((text) => text.includes("stale"))).toBe(false);
  expect(afterStale.some((text) => text.includes("real"))).toBe(true);

  /* A later forced pull must not inherit proof tokens from the stale source. */
  await page.evaluate(() =>
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*"),
  );
  await page.waitForTimeout(250);
  const snapshot = await page.evaluate(() => ({
    fetches: window.__qtFetches.slice(),
    xhrRequests: window.__qtXhrRequests.slice(),
    cc: document
      .querySelector(".ytp-subtitles-button")
      ?.getAttribute("aria-pressed"),
  }));
  expect(
    snapshot.fetches.some(
      (url) => url.includes("signature=NEW") && url.includes("pot=OLDPOT"),
    ),
    `stale auth merged into replacement source: ${JSON.stringify(snapshot.fetches)}`,
  ).toBe(false);
  expect(
    snapshot.fetches.some(
      (url) => url.includes("signature=NEW") && url.includes("potc=OLDPOTC"),
    ),
    `stale XHR auth merged into replacement source: ${JSON.stringify(snapshot.fetches)}`,
  ).toBe(false);
  expect(snapshot.xhrRequests).toEqual([
    expect.stringContaining("signature=OLD"),
  ]);
  expect(snapshot.fetches.length, `timedtext fetches: ${JSON.stringify(snapshot.fetches)}`).toBeLessThanOrEqual(
    5,
  );
  expect(snapshot.cc).toBe("false");
});

test("reordering multiple ASR tracks preserves the pinned source identity", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/watch?v=MULTIASR");
  await page.evaluate(() => {
    const url = (lang, signature) =>
      `https://www.youtube.com/api/timedtext?v=MULTIASR&lang=${lang}&kind=asr&signature=${signature}`;
    window.__qtEnOld = url("en", "ENOLD");
    window.__qtEnNew = url("en", "ENNEW");
    window.__qtPt = url("pt", "PT");
    window.__qtTracks = [
      { languageCode: "en", kind: "asr", vssId: "a.en", baseUrl: window.__qtEnOld },
      { languageCode: "pt", kind: "asr", vssId: "a.pt", baseUrl: window.__qtPt },
    ];
    window.__qtFetches = [];
    window.__qtTimedtextPosts = [];
    const body = (first, second) =>
      JSON.stringify({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 2000,
            segs: [
              { utf8: first, tOffsetMs: 0 },
              { utf8: ` ${second}`, tOffsetMs: 600 },
            ],
          },
        ],
      });
    const response = (text) => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(text),
      clone: () => response(text),
    });
    window.fetch = (requested) => {
      const raw = String(requested);
      window.__qtFetches.push(raw);
      if (raw.includes("signature=ENNEW"))
        return Promise.resolve(response(body("right", "english")));
      if (raw.includes("signature=PT"))
        return Promise.resolve(response(body("wrong", "portuguese")));
      return Promise.resolve(response("<timedtext></timedtext>"));
    };
    const player = document.getElementById("movie_player");
    player.getPlayerResponse = () => ({
      videoDetails: { videoId: "MULTIASR" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: window.__qtTracks,
          translationLanguages: [],
        },
      },
    });
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (data?.source === "quiettube" && data.type === "QT_TIMEDTEXT")
        window.__qtTimedtextPosts.push(data);
    });
  });
  await page.addScriptTag({ path: path.join(ROOT, "content/inject.js") });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__qtFetches.filter((url) => url.includes("signature=ENOLD")).length,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  await page.evaluate(() => {
    /* Same tracks, new order; only the already-pinned English source renewed
       its signed URL. */
    window.__qtTracks = [
      { languageCode: "pt", kind: "asr", vssId: "a.pt", baseUrl: window.__qtPt },
      { languageCode: "en", kind: "asr", vssId: "a.en", baseUrl: window.__qtEnNew },
    ];
    document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
  });

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__qtTimedtextPosts.some((item) => item.text.includes("right")),
      ),
    )
    .toBe(true);
  const snapshot = await page.evaluate(() => ({
    posts: window.__qtTimedtextPosts.map((item) => ({ lang: item.lang, text: item.text })),
    fetches: window.__qtFetches.slice(),
    cc: document
      .querySelector(".ytp-subtitles-button")
      ?.getAttribute("aria-pressed"),
  }));
  expect(snapshot.posts.some((item) => item.text.includes("wrong"))).toBe(false);
  expect(snapshot.posts.every((item) => item.lang === "en")).toBe(true);
  expect(snapshot.fetches.some((url) => url.includes("signature=PT"))).toBe(false);
  expect(snapshot.fetches.length, `timedtext fetches: ${JSON.stringify(snapshot.fetches)}`).toBeLessThanOrEqual(
    4,
  );
  expect(snapshot.cc).toBe("false");
});

test("an adopted ASR source is never replaced by uploaded or translated cues", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/watch?v=LATEASR");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await installHostStub(page, {
    tracks: [ASR_TRACK, UPLOADED_TRACK],
    asrBody: ASR_BODY,
    uploadedBody: UPLOADED_BODY,
  });
  await loadToolkit(page);

  await expect
    .poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text))
    .toBe("real asr");

  /* A translated display track and an uploaded same-language track arrive. */
  await page.evaluate((body) => {
    window.postMessage(
      {
        source: "quiettube",
        type: "QT_TIMEDTEXT",
        videoId: "LATEASR",
        url: "https://www.youtube.com/api/timedtext?v=LATEASR&lang=en&kind=asr&tlang=pt",
        lang: "tlang:pt",
        original: false,
        text: body,
      },
      "*",
    );
    window.postMessage(
      {
        source: "quiettube",
        type: "QT_TIMEDTEXT",
        videoId: "LATEASR",
        url: "https://www.youtube.com/api/timedtext?v=LATEASR&lang=en",
        lang: "en",
        original: true,
        text: body,
      },
      "*",
    );
  }, UPLOADED_BODY);

  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => ({
      text: window.QuietTube.cues[0]?.text,
      asr: window.QuietTube._cuesAreAsr,
    })),
  ).toEqual({ text: "real asr", asr: true });
});

test("a video with no ASR track keeps the timedtext fetch budget bounded", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/watch?v=LATEASR");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await installHostStub(page, {
    tracks: [UPLOADED_TRACK],
    asrBody: ASR_BODY,
    uploadedBody: UPLOADED_BODY,
  });
  await loadToolkit(page);

  await expect
    .poll(() => page.evaluate(() => window.QuietTube.cues[0]?.text))
    .toBe("uploaded fallback");

  /* inject.js re-announces tracks every 3s. pace.js must not answer every
     announcement with another QT_NEED_TRACKS -> fetchOriginal round trip. */
  await page.waitForTimeout(9_000);
  const timedtext = await page.evaluate(() =>
    window.__qtFetches.filter((u) => u.includes("/api/timedtext")),
  );
  expect(timedtext.length, `timedtext fetches: ${JSON.stringify(timedtext)}`).toBeLessThanOrEqual(3);
});

/* W-011 — a burst of SPA navigations must not leave stale boot-retry timers.
   yt-navigate-finish scheduled an uncancelled setTimeout(sendTracks(true), 400).
   N navigations inside that window left N live timers that all fired against
   whichever video was current when they landed, each forcing a re-download of
   a track already fetched and adopted, and each redundant payload re-entered
   adoptOriginalCues() and reset the smoothed-WPM state Pace Lock reads. */
test("flicking through Shorts does not multiply timedtext fetches", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: PLAYER_HTML }),
  );
  await page.goto("http://yt.test/shorts/S1");
  await installChromeStub(page, { qt_paceLock: false, qt_trimSilence: false });
  await page.evaluate((asr) => {
    window.__qtFetches = [];
    window.fetch = (url) => {
      window.__qtFetches.push(String(url));
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(asr),
      });
    };
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get: () => {
        const id = location.pathname.split("/").pop();
        return {
          videoDetails: { videoId: id },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [{
                languageCode: "en", kind: "asr", vssId: "a.en",
                baseUrl:
                  "https://www.youtube.com/api/timedtext?v=" + id + "&lang=en&kind=asr",
              }],
              translationLanguages: [],
            },
          },
        };
      },
    });
  }, ASR_BODY);
  await loadToolkit(page);
  await page.waitForTimeout(700);

  /* Six advances 50 ms apart, as when flicking through Shorts. */
  await page.evaluate(async () => {
    for (let i = 2; i <= 7; i++) {
      history.pushState({}, "", "/shorts/S" + i);
      document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
      await new Promise((r) => setTimeout(r, 50));
    }
  });
  await page.waitForTimeout(1500);

  const forFinal = await page.evaluate(() =>
    window.__qtFetches.filter((u) => u.includes("v=S7")).length,
  );
  expect(
    forFinal,
    `timedtext fetches for the final Short: ${forFinal}`,
  ).toBeLessThanOrEqual(2);
});
