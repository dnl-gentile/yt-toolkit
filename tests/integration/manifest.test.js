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
    /ytp-menuitem-toggle-checkbox qt-switch/.test(src),
    false,
    "pace lock/trim must not use ytp-menuitem-toggle-checkbox — YouTube paints that track dark",
  );
  assert.match(src, /class="qt-switch/);
});
