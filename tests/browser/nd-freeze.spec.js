/* W-012 — No Distractions must not saturate the main thread.
 *
 * Reported symptom: opening YouTube freezes the whole browser, with a
 * completely clean console. That is the signature of a main-thread busy loop,
 * not an exception.
 *
 * Mechanism under test: chromeObserver watches ytd-masthead with
 * { childList: true, subtree: true }. onChromeMutations schedules a rAF that
 * calls updateIcon(), which assigns tooltip.textContent unconditionally.
 * Assigning textContent replaces the text node, which is itself a childList
 * mutation inside the observed masthead — so the observer re-fires forever,
 * once per frame, and each pass also runs collapseLeftSidebar()
 * (getComputedStyle + offsetWidth on five selectors: forced synchronous
 * layout) and a long list of querySelector calls.
 */
const { test, expect } = require("@playwright/test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

/* A masthead close enough to YouTube's for the observer path to run. */
const FIXTURE = `
  <style>
    ytd-masthead { display:block; height:56px; }
    #guide { display:block; width:240px; }
    #end { display:flex; }
  </style>
  <ytd-masthead>
    <div id="start"><button id="guide-button" aria-label="Guide">G</button></div>
    <div id="center"><ytd-searchbox><input id="search"></ytd-searchbox></div>
    <div id="end">
      <div id="buttons">
        <ytd-button-renderer><button aria-label="Create">Create</button></ytd-button-renderer>
        <ytd-notification-topbar-button-renderer>
          <button aria-label="Notifications">Bell</button>
        </ytd-notification-topbar-button-renderer>
        <button id="avatar-btn">A</button>
      </div>
    </div>
  </ytd-masthead>
  <div id="guide" opened><div id="guide-content"><div id="sections">Guide</div></div></div>
  <div id="page-manager"></div>`;

async function boot(page, { enabled = true } = {}) {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: FIXTURE }),
  );
  await page.goto("http://yt.test/");
  await page.evaluate((enabled) => {
    window.__qtStorage = { noDistractionsEnabled: enabled };
    const area = {
      get(keys, cb) {
        cb(
          Array.isArray(keys)
            ? Object.fromEntries(keys.map((k) => [k, window.__qtStorage[k]]))
            : { ...window.__qtStorage },
        );
      },
      set(values, cb) {
        Object.assign(window.__qtStorage, values);
        if (cb) cb();
      },
    };
    window.chrome = {
      storage: { sync: area, local: area, onChanged: { addListener() {} } },
      runtime: {
        id: "fixture",
        lastError: null,
        getURL: (p) => "http://yt.test/" + p,
        sendMessage: (m, cb) => cb && cb(null),
        onMessage: { addListener() {} },
      },
    };
  }, enabled);
  await page.addScriptTag({ path: path.join(ROOT, "lib/ext.js") });
  await page.addScriptTag({ path: path.join(ROOT, "lib/prefs.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content_script_youtube.js") });
  /* Let boot settle: storage read, button injection, first observer pass. */
  await page.waitForTimeout(1200);
}

/* Counts mutations inside the masthead while the host makes none itself. Any
   sustained count is the extension feeding its own observer. */
async function measureSelfMutations(page, ms) {
  return page.evaluate(async (ms) => {
    const masthead = document.querySelector("ytd-masthead");
    let count = 0;
    const kinds = {};
    const obs = new MutationObserver((list) => {
      count += list.length;
      for (const r of list) {
        const key =
          r.type + ":" + (r.attributeName || "") +
          ":" + (r.target.id || r.target.className || r.target.nodeName);
        kinds[key] = (kinds[key] || 0) + 1;
      }
    });
    obs.observe(masthead, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    await new Promise((r) => setTimeout(r, ms));
    obs.disconnect();
    const top = Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { count, top };
  }, ms);
}

/* Event-loop saturation: how long a zero-delay task waits. On a saturated
   main thread these queue behind the extension's per-frame work. */
async function measureLoopLag(page, samples) {
  return page.evaluate(async (samples) => {
    const lags = [];
    for (let i = 0; i < samples; i++) {
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 0));
      lags.push(performance.now() - t0);
    }
    lags.sort((a, b) => a - b);
    return {
      median: lags[Math.floor(lags.length / 2)],
      p95: lags[Math.floor(lags.length * 0.95)],
      max: lags[lags.length - 1],
    };
  }, samples);
}

test("the masthead observer is not fed by our own writes", async ({ page }) => {
  await boot(page);
  const { count, top } = await measureSelfMutations(page, 2000);
  expect(
    count,
    `masthead mutations in 2s with an idle host: ${count} — ${JSON.stringify(top)}`,
  ).toBeLessThanOrEqual(5);
});

test("recreating the navbar button survives an invalidated extension context", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await boot(page);
  await page.evaluate(() => {
    const invalidated = () => {
      throw new Error("Extension context invalidated.");
    };
    window.chrome.storage.sync.get = invalidated;
    window.chrome.storage.local.get = invalidated;
    document.getElementById("quiet-mode-toggle-button").remove();
  });
  await expect(page.locator("#quiet-mode-toggle-button")).toBeVisible();
  expect(errors).toEqual([]);
});

test("No Distractions does not keep the main thread busy every frame", async ({ page }) => {
  await boot(page);
  const lag = await measureLoopLag(page, 40);
  expect(
    lag.p95,
    `zero-delay task lag p95=${lag.p95.toFixed(1)}ms max=${lag.max.toFixed(1)}ms`,
  ).toBeLessThan(50);
});

test("repeated navigation events do not multiply per-frame work", async ({ page }) => {
  await boot(page);
  /* SPA navigation fires these repeatedly on a real watch page. */
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) {
      document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
      document.dispatchEvent(new CustomEvent("yt-page-data-updated"));
    }
  });
  await page.waitForTimeout(1500);
  const { count, top } = await measureSelfMutations(page, 2000);
  expect(
    count,
    `masthead mutations after 10 navigation events: ${count} — ${JSON.stringify(top)}`,
  ).toBeLessThanOrEqual(5);
});

test("the sidebar collapse does not re-write styles on every pass", async ({ page }) => {
  await boot(page);
  const writes = await page.evaluate(async () => {
    const guide = document.querySelector("#guide");
    let count = 0;
    const obs = new MutationObserver((list) => {
      count += list.filter((r) => r.attributeName === "style").length;
    });
    obs.observe(guide, { attributes: true, attributeFilter: ["style"] });
    await new Promise((r) => setTimeout(r, 2000));
    obs.disconnect();
    return count;
  });
  expect(
    writes,
    `#guide style rewrites in 2s: ${writes} (each pass also forces layout via getComputedStyle/offsetWidth)`,
  ).toBeLessThanOrEqual(5);
});

test("theater mode is not clicked repeatedly", async ({ page }) => {
  await page.route("http://yt.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        FIXTURE +
        `<ytd-watch-flexy>
           <div id="movie_player">
             <button class="ytp-size-button" aria-label="Theater mode (t)"></button>
           </div>
         </ytd-watch-flexy>`,
    }),
  );
  await page.goto("http://yt.test/watch?v=abc");
  await page.evaluate(() => {
    window.__qtStorage = { noDistractionsEnabled: true };
    const area = {
      get(keys, cb) {
        cb(
          Array.isArray(keys)
            ? Object.fromEntries(keys.map((k) => [k, window.__qtStorage[k]]))
            : { ...window.__qtStorage },
        );
      },
      set(values, cb) {
        Object.assign(window.__qtStorage, values);
        if (cb) cb();
      },
    };
    window.chrome = {
      storage: { sync: area, local: area, onChanged: { addListener() {} } },
      runtime: {
        id: "fixture",
        lastError: null,
        getURL: (p) => "http://yt.test/" + p,
        sendMessage: (m, cb) => cb && cb(null),
        onMessage: { addListener() {} },
      },
    };
    window.__theaterClicks = 0;
    document
      .querySelector(".ytp-size-button")
      .addEventListener("click", () => {
        window.__theaterClicks++;
      });
  });
  await page.addScriptTag({ path: path.join(ROOT, "content_script_youtube.js") });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) {
      document.dispatchEvent(new CustomEvent("yt-page-data-updated"));
      document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
    }
  });
  await page.waitForTimeout(2000);
  const clicks = await page.evaluate(() => window.__theaterClicks);
  /* The fixture never applies theater mode, so the guard must stop retrying
     rather than clicking the size button on every event and retry timer. */
  expect(clicks, `theater size-button clicks: ${clicks}`).toBeLessThanOrEqual(2);
});
