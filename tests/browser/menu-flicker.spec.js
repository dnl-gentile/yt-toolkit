/* W-011 — the caption menu must not flicker while YouTube reuses a panel.
 *
 * Recorded reproduction (HANDOFF 2026-08-20 P1): YouTube reuses the same
 * settings panel for Subtitles/CC and Auto-translate. It swaps the row list
 * first and changes the panel title only afterwards. During that window the
 * Toolkit still reads the old "Subtitles/CC" title, injects its three
 * toggles, and rips them out ~143 ms later when the title flips. Observed
 * 0 -> 3 -> 0. Separately the patch generated 173 MutationRecords in 2 s with
 * no host mutation at all, because it observes class and then rewrites class
 * on the very nodes it observes.
 */
const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

const FIXTURE = `
  <style>
    .ytp-settings-menu { display:block; visibility:visible; width:235px; }
    .ytp-panel-menu { width:235px; }
    .ytp-menuitem { width:235px; height:48px; display:grid;
      grid-template-columns:minmax(0, 1fr) auto; align-items:center; }
    .ytp-menuitem-label { grid-column:1; padding-left:35px; }
    .ytp-menuitem-content { grid-column:2; padding-right:15px; }
    .ytp-menuitem-toggle-checkbox { width:40px; height:24px; display:block; }
  </style>
  <div id="movie_player">
    <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
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
    </div>
  </div>`;

const SHORTS_CAPTIONS_FIXTURE = `
  <style>
    body { margin:0; background:#151515; }
    ytd-reel-video-renderer { position:absolute;left:120px;top:20px;width:452px;height:760px; }
    #shorts-player { position:relative;width:452px;height:760px;background:#000; }
    #shorts-caption-sheet {
      position:absolute;left:620px;top:120px;width:256px;max-height:176px;
      overflow:hidden;background:rgb(255,255,255);border-radius:12px;
      box-shadow:0 4px 32px rgba(0,0,0,.1);backdrop-filter:blur(8px);
      color:rgb(15,15,15);transform:scale(.8);transform-origin:top left;
    }
    #shorts-caption-sheet h2 { box-sizing:border-box;height:48px;margin:0;padding:12px 16px; }
    #shorts-caption-menu { display:flex;flex-direction:column;max-height:128px;overflow-y:auto; }
    #shorts-caption-menu > [role="menuitemradio"] { min-height:40px;display:flex;align-items:center; }
    #shorts-caption-menu label { box-sizing:border-box;display:flex;align-items:center;width:100%;min-height:40px;padding:0 16px; }
    #shorts-caption-menu > .native-short-row {
      height:46px;min-height:46px;background-color:rgb(29,29,29);color:rgb(238,238,238);
    }
    #shorts-caption-menu > .native-short-row label {
      min-height:46px;padding:0 19px;font-size:13px;line-height:18px;
    }
    #shorts-caption-menu > .native-short-row:hover { background-color:rgb(47,47,47); }
  </style>
  <ytd-reel-video-renderer is-active aria-hidden="false">
    <div id="shorts-player" class="html5-video-player captions-enabled">
      <video class="html5-main-video"></video>
      <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
    </div>
  </ytd-reel-video-renderer>
  <yt-sheet-view-model id="shorts-caption-sheet">
    <h2>Captions</h2>
    <yt-list-view-model id="shorts-caption-menu" role="menu">
      <yt-list-item-view-model class="native-short-row" role="menuitemradio" aria-checked="false" data-native-row="off">
        <radio-shape><input id="radio-off" type="radio"><label for="radio-off"><span>Off</span></label></radio-shape>
      </yt-list-item-view-model>
      <yt-list-item-view-model class="native-short-row" role="menuitemradio" aria-checked="true" data-native-row="en">
        <radio-shape><input id="radio-en" type="radio" checked><label for="radio-en"><span>English (auto-generated)</span></label></radio-shape>
      </yt-list-item-view-model>
      <yt-list-item-view-model class="native-short-row" role="menuitemradio" aria-checked="false" data-native-row="auto">
        <radio-shape><input id="radio-auto" type="radio"><label for="radio-auto"><span>Auto-translate</span></label></radio-shape>
      </yt-list-item-view-model>
    </yt-list-view-model>
  </yt-sheet-view-model>`;

async function installChromeStub(page, initial = {}) {
  await page.evaluate((seed) => {
    window.__qtStorage = { ...seed };
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
  }, initial);
}

async function boot(page, { asr = true } = {}) {
  await page.setContent(FIXTURE);
  await installChromeStub(page, {
    qt_dualCaptions: false,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_captionLangs: [],
  });
  await page.evaluate((asr) => {
    window.QuietTube = {
      originalLang: "en",
      _cuesAreAsr: asr,
      cues: [],
      tracks: [{ languageCode: "en", name: "English", kind: "asr" }],
      translationLanguages: [
        { languageCode: "ar", name: "Arabic" },
        { languageCode: "ab", name: "Abkhazian" },
      ],
    };
  }, asr);
  await page.addStyleTag({ path: path.join(ROOT, "styles-toggles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });
  await page.waitForTimeout(400);
}

async function bootShortsCaptionMenu(
  page,
  { asr = false, trackObservers = false } = {},
) {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: SHORTS_CAPTIONS_FIXTURE }),
  );
  await page.goto("http://yt.test/shorts/SHORT-MENU");
  await installChromeStub(page, {
    qt_dualCaptions: true,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_captionLangs: ["en", "tlang:pt"],
    qt_captionsEnabled: true,
  });
  if (trackObservers) {
    await page.evaluate(() => {
      const NativeMutationObserver = window.MutationObserver;
      window.__qtTrackedObservers = [];
      window.MutationObserver = class TrackedMutationObserver extends NativeMutationObserver {
        constructor(callback) {
          super(callback);
          this.__qtDisconnected = true;
          this.__qtRoot = null;
          window.__qtTrackedObservers.push(this);
        }

        observe(root, options) {
          this.__qtRoot = root;
          this.__qtDisconnected = false;
          return super.observe(root, options);
        }

        disconnect() {
          this.__qtDisconnected = true;
          return super.disconnect();
        }
      };
    });
  }
  await page.evaluate((hasAsr) => {
    const player = document.getElementById("shorts-player");
    player.getPlayerResponse = () => ({ videoDetails: { videoId: "SHORT-MENU" } });
    window.QuietTube = {
      videoId: "SHORT-MENU",
      originalLang: "en",
      _cuesAreAsr: hasAsr,
      cues: [],
      tracks: [{ languageCode: "en", name: "English", kind: "asr" }],
      translationLanguages: [],
    };
    window.__qtNativeRows = Array.from(document.querySelectorAll("[data-native-row]"));
    window.__qtNativeRowsHtml = window.__qtNativeRows.map((row) => row.outerHTML);
  }, asr);
  await page.addStyleTag({ path: path.join(ROOT, "styles-toggles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });
  await page.waitForTimeout(500);
}

test("a delayed Auto-translate transition never shows a Toolkit row", async ({ page }) => {
  await page.setContent(FIXTURE);
  await installChromeStub(page, {
    qt_dualCaptions: false,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_captionLangs: [],
  });
  await page.evaluate(() => {
    window.QuietTube = {
      originalLang: "en",
      _cuesAreAsr: true,
      cues: [],
      tracks: [{ languageCode: "en", name: "English", kind: "asr" }],
      translationLanguages: [
        { languageCode: "ar", name: "Arabic" },
        { languageCode: "ab", name: "Abkhazian" },
      ],
    };
    /* Sample continuously so a row that exists for a single frame is caught. */
    window.__qtPeak = 0;
    const sample = () => {
      const n = document.querySelectorAll("[data-qt-cap]").length;
      if (n > window.__qtPeak) window.__qtPeak = n;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles-toggles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });

  /* YouTube reuses the panel: rows are swapped first, the title only after. */
  await page.evaluate(() => {
    const panel = document.querySelector("[data-panel='captions']");
    const menu = panel.querySelector(".ytp-panel-menu");
    menu.innerHTML =
      '<div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="false" data-row="ar"><div class="ytp-menuitem-label">Arabic</div></div>' +
      '<div class="ytp-menuitem" tabindex="0" role="menuitemradio" aria-checked="false" data-row="ab"><div class="ytp-menuitem-label">Abkhazian</div></div>';
    setTimeout(() => {
      panel.querySelector(".ytp-panel-title").textContent = "Auto-translate";
    }, 143);
  });
  await page.waitForTimeout(900);

  expect(
    await page.evaluate(() => document.querySelectorAll("[data-qt-cap]").length),
    "no Toolkit row may remain on an Auto-translate panel",
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__qtPeak),
    "no Toolkit row may appear even for one frame during the transition",
  ).toBe(0);
});

test("a stable captions panel keeps exactly the same three nodes", async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-qt-cap]"));
    window.__qtRows = rows;
    return rows.map((r) => r.getAttribute("data-qt-cap"));
  });
  expect(before).toEqual(["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord"]);

  await page.waitForTimeout(2000);

  const after = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-qt-cap]"));
    return {
      keys: rows.map((r) => r.getAttribute("data-qt-cap")),
      /* Same node objects, still connected: no silent teardown and rebuild. */
      sameNodes:
        rows.length === window.__qtRows.length &&
        rows.every((r, i) => r === window.__qtRows[i]),
      connected: window.__qtRows.every((r) => r.isConnected),
    };
  });
  expect(after.keys).toEqual(["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord"]);
  expect(after.sameNodes, "rows must not be torn down and rebuilt").toBe(true);
  expect(after.connected, "the original row nodes must stay connected").toBe(true);
});

test("the patch does not mutate the menu on its own after mount", async ({ page }) => {
  await boot(page);
  /* Let any mount work settle, then watch for self-inflicted churn with the
     host completely idle. */
  await page.waitForTimeout(600);
  const records = await page.evaluate(async () => {
    const menu = document.querySelector(".ytp-settings-menu");
    let count = 0;
    const seen = [];
    const obs = new MutationObserver((list) => {
      count += list.length;
      for (const r of list) {
        if (seen.length < 12)
          seen.push(
            r.type + ":" + (r.attributeName || "") + ":" +
              (r.target.getAttribute ? r.target.getAttribute("class") || "" : ""),
          );
      }
    });
    obs.observe(menu, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    await new Promise((r) => setTimeout(r, 2000));
    obs.disconnect();
    return { count, seen };
  });
  expect(
    records.count,
    `self-inflicted mutations in 2s with an idle host: ${records.count} — ${JSON.stringify(records.seen)}`,
  ).toBeLessThanOrEqual(10);
});

/* W-011 — reused rows must track the live preference, not the value they were
   built with. injectCaptionsToggles() returns as soon as a [data-qt-cap] row
   exists, so without an explicit re-sync a row keeps whatever state it was
   constructed with. */
test("an out-of-band preference change is reflected and the next click honours it", async ({ page }) => {
  await boot(page);
  const center = () => page.locator("[data-qt-cap='qt_centerWord']");
  await expect(center()).toHaveAttribute("aria-checked", "false");

  /* Another tab (or the options surface) turns Center word on. */
  await page.evaluate(() => window.chrome.storage.sync.set({ qt_centerWord: true }));
  await page.waitForTimeout(400);
  await expect(
    center(),
    "the reused row must show the live preference",
  ).toHaveAttribute("aria-checked", "true");

  /* Clicking must now turn it OFF, not write the stale value back. */
  await page.evaluate(() =>
    document.querySelector("[data-qt-cap='qt_centerWord']").click(),
  );
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__qtStorage.qt_centerWord)).toBe(false);
});

test("a late ASR track re-enables Color highlight and Center word in the open menu", async ({ page }) => {
  await boot(page, { asr: false });
  const hi = page.locator("[data-qt-cap='qt_wordHighlight']");
  const ctr = page.locator("[data-qt-cap='qt_centerWord']");
  const dual = page.locator("[data-qt-cap='qt_dualCaptions']");
  await expect(hi).toHaveAttribute("aria-disabled", "true");
  await expect(ctr).toHaveAttribute("aria-disabled", "true");
  /* Dual is pure display and stays available. */
  expect(await dual.getAttribute("aria-disabled")).toBe(null);
  expect((await hi.getAttribute("title")) || "").toContain("auto-generated");

  /* The auto-generated track is adopted while the menu is still open. */
  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.dispatchEvent(new CustomEvent("qt-cues", { detail: {} }));
  });
  await page.waitForTimeout(500);
  expect(
    await hi.getAttribute("aria-disabled"),
    "Color highlight must re-arm without reopening the menu",
  ).toBe(null);
  expect(await ctr.getAttribute("aria-disabled")).toBe(null);
  /* The saved preference is restored, not lost. */
  await expect(hi).toHaveAttribute("aria-checked", "true");
});

test("Shorts native Captions sheet gets only Highlight and Center without touching radio rows", async ({
  page,
}) => {
  await bootShortsCaptionMenu(page, { asr: false });
  await page.evaluate(() => document.dispatchEvent(new Event("qt-toolkit-frame")));

  const rows = page.locator("#shorts-caption-menu > [data-qt-cap]");
  await expect(rows).toHaveCount(2);
  expect(
    await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-qt-cap"))),
  ).toEqual(["qt_wordHighlight", "qt_centerWord"]);
  await expect(page.locator("[data-qt-cap='qt_dualCaptions']")).toHaveCount(0);
  expect(await page.evaluate(() => window.__qtStorage.qt_dualCaptions)).toBe(true);

  const structure = await page.evaluate(() => {
    const menu = document.getElementById("shorts-caption-menu");
    const native = Array.from(document.querySelectorAll("[data-native-row]"));
    return {
      order: Array.from(menu.children).map(
        (row) => row.getAttribute("data-native-row") || row.getAttribute("data-qt-cap"),
      ),
      nativeSameNodes: native.every((row, index) => row === window.__qtNativeRows[index]),
      nativeSameHtml: native.map((row) => row.outerHTML),
      nativeRoles: native.map((row) => row.getAttribute("role")),
      nativeRadios: native.map((row) => row.querySelectorAll('input[type="radio"]').length),
      toolkitRoles: Array.from(menu.querySelectorAll("[data-qt-cap]")).map((row) =>
        row.getAttribute("role"),
      ),
      toolkitRadios: menu.querySelectorAll('[data-qt-cap] input[type="radio"]').length,
      sheetPaint: (() => {
        const style = getComputedStyle(document.getElementById("shorts-caption-sheet"));
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
        };
      })(),
    };
  });
  expect(structure.order).toEqual([
    "off",
    "qt_wordHighlight",
    "qt_centerWord",
    "en",
    "auto",
  ]);
  expect(structure.nativeSameNodes).toBe(true);
  expect(structure.nativeSameHtml).toEqual(
    await page.evaluate(() => window.__qtNativeRowsHtml),
  );
  expect(structure.nativeRoles).toEqual(["menuitemradio", "menuitemradio", "menuitemradio"]);
  expect(structure.nativeRadios).toEqual([1, 1, 1]);
  expect(structure.toolkitRoles).toEqual(["menuitemcheckbox", "menuitemcheckbox"]);
  expect(structure.toolkitRadios).toBe(0);
  expect(structure.sheetPaint).toEqual({
    backgroundColor: "rgb(255, 255, 255)",
    borderRadius: "12px",
    backdropFilter: "blur(8px)",
  });

  const hi = page.locator("[data-qt-cap='qt_wordHighlight']");
  const center = page.locator("[data-qt-cap='qt_centerWord']");
  await expect(hi).toHaveAttribute("aria-disabled", "true");
  await expect(center).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.dispatchEvent(new Event("qt-cues"));
  });
  expect(await hi.getAttribute("aria-disabled")).toBe(null);
  expect(await center.getAttribute("aria-disabled")).toBe(null);
  await expect(hi).toHaveAttribute("aria-checked", "true");
  await center.click();
  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_centerWord)).toBe(true);
  expect(await page.evaluate(() => window.__qtStorage.qt_dualCaptions)).toBe(true);

  const computedRow = async (locator) => locator.evaluate((row) => {
    const content = row.querySelector("label, .qt-shorts-cap-content");
    const text = row.querySelector("span, .qt-shorts-cap-label");
    const rowStyle = getComputedStyle(row);
    const contentStyle = getComputedStyle(content);
    const textStyle = getComputedStyle(text);
    return {
      height: Math.round(row.getBoundingClientRect().height * 100) / 100,
      paddingLeft: contentStyle.paddingLeft,
      paddingRight: contentStyle.paddingRight,
      fontSize: textStyle.fontSize,
      lineHeight: textStyle.lineHeight,
      backgroundColor: rowStyle.backgroundColor,
    };
  });
  const nativeOff = page.locator("[data-native-row='off']");
  const nativeGeometry = await computedRow(nativeOff);
  expect(
    await computedRow(hi),
    "the Toolkit row must inherit the native Shorts row geometry and paint",
  ).toEqual(nativeGeometry);
  await nativeOff.hover();
  const nativeHover = await nativeOff.evaluate((row) => getComputedStyle(row).backgroundColor);
  await hi.hover();
  expect(await hi.evaluate((row) => getComputedStyle(row).backgroundColor)).toBe(nativeHover);

  /* Fractional geometry approximates Windows display scaling/browser zoom.
     Both custom rows must remain reachable inside the bounded sheet. */
  for (const key of ["qt_wordHighlight", "qt_centerWord"]) {
    const row = page.locator(`[data-qt-cap='${key}']`);
    await row.evaluate((node) => node.scrollIntoView({ block: "nearest" }));
    expect(
      await row.evaluate((node) => {
        const rowRect = node.getBoundingClientRect();
        const sheetRect = document.getElementById("shorts-caption-sheet").getBoundingClientRect();
        return (
          rowRect.top >= sheetRect.top - 0.5 &&
          rowRect.bottom <= sheetRect.bottom + 0.5 &&
          rowRect.left >= sheetRect.left - 0.5 &&
          rowRect.right <= sheetRect.right + 0.5
        );
      }),
      `${key} must be reachable at fractional Windows/zoom geometry`,
    ).toBe(true);
  }

  await rows.evaluateAll((nodes) => {
    window.__qtShortRows = nodes;
  });
  for (let i = 0; i < 8; i++)
    await page.evaluate(() => document.dispatchEvent(new Event("qt-toolkit-frame")));
  expect(
    await rows.evaluateAll(
      (nodes) =>
        nodes.length === window.__qtShortRows.length &&
        nodes.every((node, index) => node === window.__qtShortRows[index]),
    ),
    "Shorts rows must be reconciled in place, not rebuilt per frame",
  ).toBe(true);
});

/*
 * BLIND SPOT: every fixture in this suite writes <yt-list-item-view-model> as
 * an UNDEFINED custom element — `customElements.define` appears nowhere under
 * tests/. An undefined tag is an inert HTMLElement, so anything we put inside
 * one stays put. On real YouTube that element IS defined, and defined custom
 * elements run a lifecycle when inserted.
 *
 * makeShortsToggle (content/yt-menu-patch.js:742) builds our row with
 * `document.createElement(offItem.tagName)` — i.e. it instantiates YouTube's
 * own component — and then calls `row.replaceChildren(content)`. Measured
 * against a minimal view-model that renders its own light DOM on connect:
 *
 *   undefined element -> our label survives, textContent "Color highlight"
 *   defined element   -> our label is GONE, textContent "native"
 *
 * So the rows appear in the DOM with the right data-qt-cap attributes — which
 * is all the existing assertions check — while showing YouTube's content
 * The rows appeared with the right data-qt-cap attributes — all the existing
 * assertions check — while showing YouTube’s content instead of ours, and no
 * fixture could tell the two apart.
 *
 * Fixed by building a plain element instead of the host component, in
 * makeShortsToggle. Appearance survives because it comes from the copied
 * className/style plus display:flex in styles-toggles.css, none of which is
 * tag-dependent — the geometry-and-paint assertions above still pass unchanged.
 *
 * This test now guards that fix: it goes red again the moment anything returns
 * to instantiating a defined host element and letting it own our children.
 */
test(
  "Shorts rows keep their own content when the host element is a real custom element",
  async ({ page }) => {
    /* Define the element the way YouTube does. addInitScript runs before any
       page script, so the definition is in place by the time our patch calls
       document.createElement on that tag. */
    await page.addInitScript(() => {
      class ListItemViewModel extends HTMLElement {
        connectedCallback() {
          if (this.dataset.nativeRow) return; /* leave the seeded rows alone */
          this.replaceChildren(
            Object.assign(document.createElement("label"), { textContent: "native" }),
          );
        }
      }
      customElements.define("yt-list-item-view-model", ListItemViewModel);
    });

    await bootShortsCaptionMenu(page, { asr: false });
    await page.evaluate(() => document.dispatchEvent(new Event("qt-toolkit-frame")));

    const rows = page.locator("#shorts-caption-menu > [data-qt-cap]");
    await expect(rows).toHaveCount(2);
    expect(
      await rows.evaluateAll((nodes) =>
        nodes.map((node) => node.querySelector(".qt-shorts-cap-label")?.textContent || ""),
      ),
      "the injected rows lost their labels to the host element's own render",
    ).toEqual(["Color highlight", "Center word"]);
  },
);

test("closed Shorts frames do not rediscover document menus", async ({ page }) => {
  await bootShortsCaptionMenu(page, { asr: true });
  await page.evaluate(() => {
    document.getElementById("shorts-caption-sheet").remove();
    window.__qtMenuDocumentScans = 0;
    const queryAll = document.querySelectorAll.bind(document);
    document.querySelectorAll = (selector) => {
      if (String(selector).includes("[role='menu']"))
        window.__qtMenuDocumentScans++;
      return queryAll(selector);
    };
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.__qtMenuDocumentScans = 0;
    for (let index = 0; index < 20; index++)
      document.dispatchEvent(new Event("qt-toolkit-frame"));
  });
  expect(await page.evaluate(() => window.__qtMenuDocumentScans)).toBe(0);
});

test("a Shorts menu hidden by its sheet ancestor releases its local observer", async ({
  page,
}) => {
  await bootShortsCaptionMenu(page, { asr: true, trackObservers: true });

  const activeMenuObservers = () =>
    page.evaluate(
      () =>
        window.__qtTrackedObservers.filter(
          (observer) =>
            observer.__qtRoot?.id === "shorts-caption-menu" &&
            !observer.__qtDisconnected,
        ).length,
    );

  await expect.poll(activeMenuObservers).toBe(1);
  await page.evaluate(() => {
    document.getElementById("shorts-caption-sheet").style.display = "none";
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });

  await expect
    .poll(activeMenuObservers)
    .toBe(0);
});

test("caption toggles stay reachable in a fixed-height Windows-style popup", async ({ page }) => {
  await page.setContent(`
    <style>
      #movie_player{position:relative;width:640px;height:360px;background:#000}
      .ytp-settings-menu{display:block;visibility:visible;position:absolute;right:16px;bottom:40px;
        width:235px;height:192px;overflow:hidden}
      .ytp-panel{height:192px;overflow:hidden}
      .ytp-panel-title{height:48px;line-height:48px}
      .ytp-panel-menu{width:235px;height:144px;overflow:hidden}
      .ytp-menuitem{box-sizing:border-box;width:235px;height:48px;display:grid;
        grid-template-columns:minmax(0,1fr) auto;align-items:center}
      .ytp-menuitem-label{grid-column:1;padding-left:35px}
      .ytp-menuitem-content{grid-column:2;padding-right:15px}
      .ytp-menuitem-toggle-checkbox{width:40px;height:24px;display:block}
    </style>
    <div id="movie_player">
      <button class="ytp-subtitles-button" aria-pressed="true">CC</button>
      <button class="ytp-settings-button">Settings</button>
      <div class="ytp-popup ytp-settings-menu">
        <div class="ytp-panel">
          <div class="ytp-panel-title">Subtitles/CC</div>
          <div class="ytp-panel-menu">
            <div class="ytp-menuitem"><div class="ytp-menuitem-label">Off</div></div>
            <div class="ytp-menuitem" aria-checked="true"><div class="ytp-menuitem-label">English</div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label">Auto-translate</div></div>
          </div>
        </div>
      </div>
    </div>`);
  await installChromeStub(page, {
    qt_dualCaptions: false,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_captionLangs: [],
  });
  await page.evaluate(() => {
    window.QuietTube = {
      originalLang: "en",
      _cuesAreAsr: true,
      tracks: [{ languageCode: "en", name: "English", kind: "asr" }],
      translationLanguages: [],
    };
  });
  await page.addStyleTag({ path: path.join(ROOT, "styles-toggles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });
  await expect(page.locator("[data-qt-cap]")).toHaveCount(3);

  const popup = page.locator(".ytp-settings-menu");
  const menu = page.locator(".ytp-panel-menu");
  await expect.poll(() => popup.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(235);
  const fit = await page.evaluate(() => {
    const player = document.getElementById("movie_player").getBoundingClientRect();
    const popup = document.querySelector(".ytp-settings-menu").getBoundingClientRect();
    const menu = document.querySelector(".ytp-panel-menu");
    return {
      playerTop: player.top,
      popupTop: popup.top,
      overflowY: getComputedStyle(menu).overflowY,
    };
  });
  expect(fit.popupTop).toBeGreaterThanOrEqual(fit.playerTop + 8);
  expect(["auto", "scroll"]).toContain(fit.overflowY);

  for (const key of ["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord"]) {
    const row = page.locator(`[data-qt-cap='${key}']`);
    await row.evaluate((el) => el.scrollIntoView({ block: "nearest" }));
    const visible = await row.evaluate((el) => {
      const rowRect = el.getBoundingClientRect();
      const popupRect = el.closest(".ytp-settings-menu").getBoundingClientRect();
      return rowRect.top >= popupRect.top && rowRect.bottom <= popupRect.bottom;
    });
    expect(visible, `${key} must be fully reachable inside the popup`).toBe(true);
  }

  /* Browser zoom fires resize and YouTube can publish a new native panel
     basis while our fit is live. Rebase on those host dimensions instead of
     overwriting them with the first snapshot, and remove the old capped
     scrollbar once the enlarged player has room for every row. */
  await page.evaluate(() => {
    document.getElementById("movie_player").style.height = "500px";
    const popup = document.querySelector(".ytp-settings-menu");
    const panel = document.querySelector(".ytp-panel");
    const menu = document.querySelector(".ytp-panel-menu");
    popup.style.setProperty("height", "205px");
    popup.style.setProperty("max-height", "205px");
    panel.style.setProperty("height", "205px");
    panel.style.setProperty("max-height", "205px");
    menu.style.setProperty("height", "157px");
    menu.style.setProperty("max-height", "157px");
    menu.style.setProperty("overflow-y", "hidden");
    window.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() =>
    page.evaluate(() => {
      const popup = document.querySelector(".ytp-settings-menu");
      const panel = document.querySelector(".ytp-panel");
      const menu = document.querySelector(".ytp-panel-menu");
      return {
        popupHeight: popup.style.height,
        popupMaxHeight: popup.style.maxHeight,
        panelHeight: panel.style.height,
        panelMaxHeight: panel.style.maxHeight,
        menuHeight: menu.style.height,
        menuMaxHeight: menu.style.maxHeight,
        menuOverflowY: getComputedStyle(menu).overflowY,
      };
    }),
  ).toEqual({
    popupHeight: "349px",
    popupMaxHeight: "349px",
    panelHeight: "349px",
    panelMaxHeight: "349px",
    menuHeight: "301px",
    menuMaxHeight: "301px",
    menuOverflowY: "hidden",
  });

  await page.evaluate(() => {
    const panel = document.querySelector(".ytp-panel");
    panel.querySelector(".ytp-panel-title").textContent = "Auto-translate";
    panel.querySelector(".ytp-panel-menu").innerHTML =
      '<div class="ytp-menuitem"><div class="ytp-menuitem-label">Arabic</div></div>';
  });
  await expect(page.locator("[data-qt-cap]")).toHaveCount(0);
  await expect.poll(() => popup.evaluate((el) => el.style.height)).toBe("205px");
  expect(await popup.evaluate((el) => el.style.maxHeight)).toBe("205px");
  expect(await page.locator(".ytp-panel").evaluate((el) => el.style.height)).toBe("205px");
  expect(await menu.evaluate((el) => el.style.height)).toBe("157px");
  expect(await menu.evaluate((el) => getComputedStyle(el).overflowY)).toBe("hidden");
});

test("stale open rows reconcile from the live ASR state even when the adoption event was missed", async ({
  page,
}) => {
  await boot(page, { asr: false });
  const hi = page.locator("[data-qt-cap='qt_wordHighlight']");
  const ctr = page.locator("[data-qt-cap='qt_centerWord']");
  await expect(hi).toHaveAttribute("aria-disabled", "true");
  await expect(ctr).toHaveAttribute("aria-disabled", "true");

  /* On the real host the settings popup transitions between root and caption
     panels. If QT_TIMEDTEXT lands during that window, the one-shot qt-cues
     repaint can be missed even though pace.js already owns ASR and reports a
     numeric WPM. The normal Toolkit frame must reconcile existing rows from
     that live authority; reopening the menu is not an acceptable workaround. */
  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });

  expect(
    await hi.getAttribute("aria-disabled"),
    "Color highlight must not stay blocked once ASR rhythm is live",
  ).toBe(null);
  expect(
    await ctr.getAttribute("aria-disabled"),
    "Center word must not stay blocked once ASR rhythm is live",
  ).toBe(null);
  expect(await hi.getAttribute("title")).toBe(null);
  await expect(hi).toHaveAttribute("aria-checked", "true");
});

test("a stale disabled row revalidates live ASR before refusing the user's click", async ({ page }) => {
  await boot(page, { asr: false });
  const hi = page.locator("[data-qt-cap='qt_wordHighlight']");
  await expect(hi).toHaveAttribute("aria-disabled", "true");

  /* Exercise the smallest race: the rhythm authority is already live, but no
     repaint event/frame has reconciled this old DOM node yet. The click must
     consult live state rather than trusting stale aria-disabled. */
  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.querySelector("[data-qt-cap='qt_wordHighlight']").click();
  });

  await expect.poll(() => page.evaluate(() => window.__qtStorage.qt_wordHighlight)).toBe(false);
  expect(await hi.getAttribute("aria-disabled")).toBe(null);
  expect(await hi.getAttribute("title")).toBe(null);
});

test("a hidden duplicate settings menu cannot mask the visible caption menu", async ({ page }) => {
  await boot(page, { asr: false });
  await page.evaluate(() => {
    const visible = document.querySelector(".ytp-settings-menu");
    visible.id = "visible-settings-menu";
    const hidden = visible.cloneNode(true);
    hidden.id = "hidden-settings-menu";
    hidden.hidden = true;
    visible.before(hidden);
  });
  const hi = page.locator(
    "#visible-settings-menu [data-qt-cap='qt_wordHighlight']",
  );
  await expect(hi).toHaveAttribute("aria-disabled", "true");

  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.dispatchEvent(new CustomEvent("qt-cues", { detail: {} }));
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });

  expect(
    await hi.getAttribute("aria-disabled"),
    "the first hidden host menu must not suppress reconciliation in the visible one",
  ).toBe(null);
  expect(await hi.getAttribute("title")).toBe(null);
});

test("a menu inside a hidden player ancestor cannot mask the visible caption menu", async ({
  page,
}) => {
  await boot(page, { asr: false });
  await page.evaluate(() => {
    const visible = document.querySelector(".ytp-settings-menu");
    visible.id = "visible-ancestor-menu";
    const hiddenHost = document.createElement("div");
    hiddenHost.style.display = "none";
    const hidden = visible.cloneNode(true);
    hidden.id = "hidden-ancestor-menu";
    hiddenHost.appendChild(hidden);
    visible.before(hiddenHost);
  });
  const hi = page.locator(
    "#visible-ancestor-menu [data-qt-cap='qt_wordHighlight']",
  );
  await expect(hi).toHaveAttribute("aria-disabled", "true");

  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });

  expect(
    await hi.getAttribute("aria-disabled"),
    "zero-geometry menus in hidden players must not win the active-menu lookup",
  ).toBe(null);
});

test("an inline preview before #movie_player cannot steal the active caption menu", async ({
  page,
}) => {
  await boot(page, { asr: false });
  await page.evaluate(() => {
    const main = document.getElementById("movie_player");
    const mainMenu = main.querySelector(".ytp-settings-menu");
    mainMenu.id = "main-player-menu";
    const preview = document.createElement("div");
    preview.className = "html5-video-player";
    preview.style.cssText = "position:relative;width:320px;height:180px";
    const previewMenu = mainMenu.cloneNode(true);
    previewMenu.id = "preview-player-menu";
    preview.appendChild(previewMenu);
    main.before(preview);
  });
  const hi = page.locator(
    "#main-player-menu [data-qt-cap='qt_wordHighlight']",
  );
  await expect(hi).toHaveAttribute("aria-disabled", "true");

  await page.evaluate(() => {
    window.QuietTube._cuesAreAsr = true;
    document.dispatchEvent(new Event("qt-toolkit-frame"));
  });

  expect(
    await hi.getAttribute("aria-disabled"),
    "the canonical watch player must outrank an earlier inline preview",
  ).toBe(null);
});

test("Shorts CC restore waits until URL, cue owner, and active player agree", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>
          ytd-reel-video-renderer { display:block;width:400px;height:700px }
          .html5-video-player { display:block;width:400px;height:700px }
          #reel-b { display:none }
        </style>
        <ytd-reel-video-renderer id="reel-a" is-active aria-hidden="false" video-id="A">
          <div id="player-a" class="html5-video-player">
            <button class="ytp-subtitles-button" aria-pressed="false">A CC</button>
          </div>
        </ytd-reel-video-renderer>
        <ytd-reel-video-renderer id="reel-b" aria-hidden="true" video-id="B">
          <div id="player-b" class="html5-video-player">
            <button class="ytp-subtitles-button" aria-pressed="false">B CC</button>
          </div>
        </ytd-reel-video-renderer>`,
    }),
  );
  await page.goto("http://yt.test/shorts/B");
  await installChromeStub(page, {
    qt_captionsEnabled: true,
    qt_dualCaptions: false,
    qt_wordHighlight: true,
    qt_centerWord: true,
    qt_captionLangs: [],
  });
  await page.evaluate(() => {
    const a = document.getElementById("player-a");
    const b = document.getElementById("player-b");
    a.getPlayerResponse = () => ({ videoDetails: { videoId: "A" } });
    b.getPlayerResponse = () => ({ videoDetails: { videoId: "B" } });
    window.__qtCcClicks = { A: 0, B: 0 };
    a.querySelector("button").addEventListener("click", () => window.__qtCcClicks.A++);
    b.querySelector("button").addEventListener("click", () => window.__qtCcClicks.B++);
    window.QuietTube = { videoId: "B", cues: [], tracks: [] };
  });
  await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });
  await page.waitForTimeout(450);

  expect(
    await page.evaluate(() => window.__qtCcClicks),
    "a transition mismatch must never click the visible previous reel or a hidden next reel",
  ).toEqual({ A: 0, B: 0 });
});

test("same-video player replacement restores explicit CC-on once after the startup window", async ({
  page,
}) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="movie_player" class="html5-video-player">
        <button class="ytp-subtitles-button">CC</button>
      </div>`,
    }),
  );

  const runCase = async ({ pref, replacementOn, expectedClicks, suffix }) => {
    await page.goto(`http://yt.test/watch?v=SAME-${suffix}`);
    await page.locator(".ytp-subtitles-button").evaluate((button, on) => {
      button.setAttribute("aria-pressed", String(on));
      button.closest("#movie_player").classList.toggle("captions-enabled", on);
    }, pref);
    await installChromeStub(page, {
      qt_captionsEnabled: pref,
      qt_dualCaptions: false,
      qt_wordHighlight: false,
      qt_centerWord: false,
      qt_captionLangs: [],
    });
    await page.addScriptTag({ path: path.join(ROOT, "lib/dual-lang.js") });
    await page.addScriptTag({ path: path.join(ROOT, "content/yt-menu-patch.js") });

    /* Let the original bounded 2.2 s restore probe expire. A later same-video
       replacement must be detected from normal Toolkit lifecycle events. */
    await page.waitForTimeout(2350);
    await page.evaluate((on) => {
      const old = document.getElementById("movie_player");
      const next = document.createElement("div");
      next.id = "movie_player";
      next.className = "html5-video-player";
      next.innerHTML = '<button class="ytp-subtitles-button">replacement CC</button>';
      const button = next.querySelector(".ytp-subtitles-button");
      button.setAttribute("aria-pressed", String(on));
      next.classList.toggle("captions-enabled", on);
      window.__qtReplacementClicks = 0;
      button.addEventListener("click", () => {
        window.__qtReplacementClicks++;
        const nextOn = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(nextOn));
        next.classList.toggle("captions-enabled", nextOn);
      });
      old.replaceWith(next);
      for (let i = 0; i < 8; i++)
        document.dispatchEvent(new Event("qt-toolkit-frame"));
    }, replacementOn);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__qtReplacementClicks)).toBe(expectedClicks);
    return page.locator(".ytp-subtitles-button").getAttribute("aria-pressed");
  };

  expect(
    await runCase({ pref: true, replacementOn: false, expectedClicks: 1, suffix: "ON" }),
    "explicit CC-on should be restored on the replacement player",
  ).toBe("true");
  expect(
    await runCase({ pref: false, replacementOn: true, expectedClicks: 0, suffix: "OFF" }),
    "CC-off must not click a late replacement button",
  ).toBe("true");
});
