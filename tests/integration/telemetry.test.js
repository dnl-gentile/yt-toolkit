/*
 * Telemetry opt-out gate (PRIVACY.md, SPEC.md §11).
 *
 * These assertions fail if the `qt_telemetry` switch is removed or bypassed:
 * an opt-out that any code path can skip is not an opt-out.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

// Minimal chrome stub. `store` is the sync area the gate reads.
function withChrome(store) {
  const calls = [];
  const local = {};

  globalThis.chrome = {
    storage: {
      sync: { get: (keys, cb) => cb({ ...store }) },
      local: {
        get: (keys, cb) => cb({ ...local }),
        set: (obj, cb) => {
          Object.assign(local, obj);
          cb && cb();
        },
        remove: (keys, cb) => {
          for (const k of [].concat(keys)) delete local[k];
          cb && cb();
        },
      },
    },
    runtime: { getManifest: () => ({ version: "0.0.0-test" }) },
  };

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };

  return calls;
}

function loadAnalytics() {
  const modPath = require.resolve(path.join(ROOT, "analytics.js"));
  delete require.cache[modPath];
  return require(modPath);
}

test("no network call when the user opted out", async () => {
  const calls = withChrome({ qt_telemetry: false });
  const { Analytics } = loadAnalytics();
  const a = new Analytics("G-TEST", "secret");

  assert.equal(await a.sendEvent("extension_installed"), false);
  assert.equal(await a.trackToggle(true), false);
  assert.equal(await a.trackHomepageRedirect(), false);
  assert.equal(await a.trackVideoPage(), false);
  assert.equal(await a.trackFeature("pace_lock"), false);

  assert.equal(calls.length, 0, "opted out, yet something was sent");
});

test("sends when the key is absent (documented default: on)", async () => {
  const calls = withChrome({});
  const { Analytics } = loadAnalytics();
  const a = new Analytics("G-TEST", "secret");

  assert.equal(await a.sendEvent("extension_installed"), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /measurement_id=G-TEST/);
});

test("sends when explicitly opted in", async () => {
  const calls = withChrome({ qt_telemetry: true });
  const { Analytics } = loadAnalytics();
  const a = new Analytics("G-TEST", "secret");

  await a.trackToggle(false);
  assert.equal(calls.length, 1);

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.events[0].name, "toggle_no_distractions");
  assert.ok(body.client_id, "client_id missing");
});

test("no storage at all means no reporting", async () => {
  withChrome({});
  const { Analytics } = loadAnalytics();
  const a = new Analytics("G-TEST", "secret");

  let sent = 0;
  globalThis.fetch = async () => {
    sent += 1;
    return { ok: true };
  };
  globalThis.chrome.storage.sync.get = () => {
    throw new Error("no storage");
  };

  assert.equal(await a.sendEvent("extension_installed"), false);
  assert.equal(sent, 0);
});

test("resetClientId forgets the installation id", async () => {
  withChrome({ qt_telemetry: true });
  const { Analytics } = loadAnalytics();
  const a = new Analytics("G-TEST", "secret");

  const first = await a.getOrCreateClientId();
  assert.ok(first);
  assert.equal(await a.getOrCreateClientId(), first, "id should be stable");

  await a.resetClientId();
  assert.notEqual(await a.getOrCreateClientId(), first, "id survived the reset");
});

test("the opt-out has a surface: manifest declares an options page that exists", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const page = manifest.options_ui && manifest.options_ui.page;

  assert.ok(page, "manifest.options_ui.page missing — the user cannot opt out");
  assert.ok(fs.existsSync(path.join(ROOT, page)), `${page} does not exist`);

  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert.match(html, /id="telemetry"/, "options page has no telemetry control");
});

test("install defaults declare qt_telemetry", () => {
  const bg = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  assert.match(bg, /qt_telemetry:\s*true/, "qt_telemetry is not in the install defaults");
});
