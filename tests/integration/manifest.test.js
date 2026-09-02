"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");

test("manifest loads dual-lang before menu/captions", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const js = m.content_scripts.find((s) =>
    (s.js || []).some((f) => f.includes("pace.js")),
  ).js;
  const dual = js.indexOf("lib/dual-lang.js");
  const menu = js.indexOf("content/yt-menu-patch.js");
  const cap = js.indexOf("content/captions.js");
  assert.ok(dual >= 0, "dual-lang missing");
  assert.ok(menu > dual, "menu must load after dual-lang");
  assert.ok(cap > dual, "captions must load after dual-lang");
});

test("pace menu switch is qt-switch only (not YouTube checkbox class)", () => {
  const src = fs.readFileSync(path.join(root, "content/pace.js"), "utf8");
  assert.equal(
    /ytp-menuitem-toggle-checkbox/.test(src),
    false,
    "pace lock/trim must not use ytp-menuitem-toggle-checkbox",
  );
  assert.match(src, /class="qt-switch/);
});

test("CC Dual/Color/Center use native checkbox, not qt-switch", () => {
  const src = fs.readFileSync(path.join(root, "content/yt-menu-patch.js"), "utf8");
  assert.match(src, /class="ytp-menuitem-toggle-checkbox"/);
  assert.equal(
    /ytp-menuitem-toggle-checkbox qt-switch/.test(src),
    false,
    "native checkbox must not also carry qt-switch",
  );
});

test("idle observer and pace/captions scheduler budgets stay bounded", () => {
  const menu = fs.readFileSync(path.join(root, "content/yt-menu-patch.js"), "utf8");
  const pace = fs.readFileSync(path.join(root, "content/pace.js"), "utf8");
  const captions = fs.readFileSync(path.join(root, "content/captions.js"), "utf8");
  /* The menu used to carry a second observer that was a byte-for-byte copy of
     the one in captions.js, on the same roots. On Shorts each watched every
     sibling reel with subtree:true, which measured 3 instances over 7 roots at
     idle against a budget of 2. There is now one owner that broadcasts
     qt-player-lifecycle, and the menu listens.

     These are source-shape checks and they only pin the architecture. The
     behavioural guard is "Shorts keeps the idle observer budget" in
     tests/browser/menu-flicker.spec.js, which counts what is actually attached
     on a live three-reel page — that is the one that would catch a regression
     this file cannot see. */
  assert.equal(
    (menu.match(/new MutationObserver/g) || []).length,
    1,
    "menu may observe only the open menu; player lifecycle is broadcast to it",
  );
  assert.match(
    menu,
    /addEventListener\("qt-player-lifecycle"/,
    "menu must consume the shared lifecycle event rather than re-observing",
  );
  const broadRootObserver =
    /observe\(\s*document\.(?:body|documentElement)\s*,\s*\{[\s\S]{0,220}?subtree\s*:\s*true/;
  assert.doesNotMatch(menu, broadRootObserver);
  assert.doesNotMatch(captions, broadRootObserver);
  assert.match(captions, /playerLifecycleObserver\.observe\(root,/);
  assert.match(
    captions,
    /dispatchEvent\(new CustomEvent\("qt-player-lifecycle"\)\)/,
    "captions owns the lifecycle observer and must broadcast it",
  );
  assert.equal(
    (pace.match(/setInterval\s*\(/g) || []).length,
    1,
    "pace owns the single content watchdog",
  );
  assert.equal(
    (captions.match(/setInterval\s*\(/g) || []).length,
    0,
    "captions must share the pace frame instead of polling separately",
  );
  assert.match(captions, /qt-toolkit-frame/);
});

test("UNIP uses an isolated, frame-aware Video.js adapter", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const unip = m.content_scripts.filter((script) =>
    (script.matches || []).includes("https://tvweb3.unip.br/*"),
  );
  assert.equal(unip.length, 2, "expected MAIN bridge plus isolated adapter");
  assert.ok(unip.every((script) => script.all_frames === true));
  const main = unip.find((script) => script.world === "MAIN");
  const isolated = unip.find((script) => script.world !== "MAIN");
  assert.deepEqual(main.js, ["content/videojs-main.js"]);
  assert.deepEqual(isolated.css, ["styles-videojs.css"]);
  assert.equal(isolated.run_at, "document_start");
  assert.ok(isolated.js.includes("content/videojs.js"));
  assert.ok(isolated.js.includes("lib/videojs.js"));
  const forbidden = [
    "content/inject.js",
    "content_script_youtube.js",
    "content/yt-menu-patch.js",
    "content/pace.js",
    "content/captions.js",
  ];
  forbidden.forEach((file) => assert.ok(!isolated.js.includes(file), file + " leaked into UNIP"));
  assert.ok(!isolated.js.some((file) => /distraction/i.test(file)));
});
