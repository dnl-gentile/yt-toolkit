/*
 * No Distractions must stay off once turned off.
 *
 * lib/prefs.js reads with `Object.assign({}, sync, local)` — LOCAL WINS — and
 * content_script_youtube.js reads No Distractions through it. background.js
 * seeds the install defaults into BOTH areas (noDistractionsEnabled: true).
 *
 * So any write that reaches only `sync` is invisible: the stale `true` still
 * sitting in `local` outranks it on the next page load, and the setting turns
 * itself back on. These tests pin the write path to the same contract as the
 * read path.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

/** Chrome stub with genuinely separate sync and local areas. */
function chromeStub() {
  const sync = {};
  const local = {};
  const listeners = { message: [], installed: [] };

  const area = (store) => ({
    get(keys, cb) {
      const out = {};
      for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
      cb(out);
    },
    set(obj, cb) {
      Object.assign(store, obj);
      cb && cb();
    },
    remove(keys, cb) {
      for (const k of [].concat(keys)) delete store[k];
      cb && cb();
    },
  });

  return {
    sync,
    local,
    listeners,
    api: {
      runtime: {
        onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
        onMessage: { addListener: (fn) => listeners.message.push(fn) },
        getManifest: () => ({ version: "0.0.0-test" }),
        lastError: null,
      },
      storage: {
        sync: area(sync),
        local: area(local),
        onChanged: { addListener() {} },
      },
      tabs: {
        get: (_id, cb) => cb({ url: "https://www.youtube.com/watch?v=X" }),
        update() {},
        query: (_q, cb) => cb([]),
        sendMessage() {},
      },
      webNavigation: {
        onBeforeNavigate: { addListener() {} },
        onCompleted: { addListener() {} },
      },
    },
  };
}

function loadBackground() {
  const c = chromeStub();
  const sandbox = {
    chrome: c.api,
    console,
    fetch: async () => ({ ok: true }),
    importScripts() {
      // analytics.js defines self.Analytics; supply an inert stand-in.
      sandbox.self.Analytics = class {
        async sendEvent() { return false; }
        async trackInstall() { return false; }
        async trackToggle() { return false; }
        async trackVideoPage() { return false; }
        async trackHomepageRedirect() { return false; }
      };
    },
    setTimeout,
    clearTimeout,
    URL,
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "background.js"), "utf8"), sandbox);
  return c;
}

/** What content_script_youtube.js effectively sees, via lib/prefs.js semantics. */
const effective = (c, key) => Object.assign({}, c.sync, c.local)[key];

test("install seeds No Distractions into both areas", () => {
  const c = loadBackground();
  c.listeners.installed.forEach((fn) => fn({ reason: "install" }));
  assert.equal(c.sync.noDistractionsEnabled, true);
  assert.equal(
    c.local.noDistractionsEnabled,
    true,
    "local seeding is what makes a sync-only write invisible later",
  );
});

test("turning No Distractions off survives the local-wins read", () => {
  const c = loadBackground();
  c.listeners.installed.forEach((fn) => fn({ reason: "install" }));

  // The masthead toggle goes through the background service worker.
  c.listeners.message.forEach((fn) =>
    fn({ action: "toggleNoDistractions" }, { tab: { id: 1 } }, () => {}),
  );

  assert.equal(c.sync.noDistractionsEnabled, false, "sync should record the new state");
  assert.equal(
    effective(c, "noDistractionsEnabled"),
    false,
    "No Distractions turned itself back on: the write did not reach chrome.storage.local, " +
      "so the stale `true` there outranks sync on the next page load",
  );
});

test("toggling back on is also durable", () => {
  const c = loadBackground();
  c.listeners.installed.forEach((fn) => fn({ reason: "install" }));
  const toggle = () =>
    c.listeners.message.forEach((fn) =>
      fn({ action: "toggleNoDistractions" }, { tab: { id: 1 } }, () => {}),
    );

  toggle();
  assert.equal(effective(c, "noDistractionsEnabled"), false);
  toggle();
  assert.equal(effective(c, "noDistractionsEnabled"), true);
});
