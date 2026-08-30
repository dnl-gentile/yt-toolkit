/*
 * Presence marker on the quiet search page.
 *
 * The old yt-no-distractions-ext injects the same #quiet-mode-toggle-button, so the page
 * at yt-search-bar.web.app uses `data-yt-toolkit` on <html> to tell the two apart before
 * deciding whether to show an update notice. Lose the marker and the page nags people who
 * are already up to date.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "content_script_searchapp.js"), "utf8");

test("the script sets data-yt-toolkit on the document element", () => {
  assert.match(
    SRC,
    /document\.documentElement\.setAttribute\(\s*['"]data-yt-toolkit['"]/,
    "marker attribute is gone — the quiet page can no longer tell this extension from the old one",
  );
});

test("the marker carries the extension version", () => {
  assert.match(
    SRC,
    /chrome\.runtime\.getManifest\(\)\.version/,
    "marker should carry the version, so the page can act on which release is installed",
  );
});

test("the marker is set before the toggle is built, and cannot break it", () => {
  const marker = SRC.indexOf("data-yt-toolkit");
  const button = SRC.indexOf("document.createElement('button')");

  assert.ok(marker > -1 && button > -1, "expected both the marker and the toggle");
  assert.ok(
    marker < button,
    "marker must be set before the toggle is built, so a slow toggle never delays detection",
  );

  // A throwing getManifest must not take the toggle down with it.
  const guarded = /try\s*\{[^}]*data-yt-toolkit[\s\S]{0,240}?\}\s*catch/.test(SRC);
  assert.ok(guarded, "marker must be wrapped in try/catch — it is advisory, the toggle is not");
});

test("the manifest still runs this script on the quiet page", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const entry = manifest.content_scripts.find((cs) =>
    (cs.js || []).includes("content_script_searchapp.js"),
  );

  assert.ok(entry, "content_script_searchapp.js is not registered in the manifest");
  assert.ok(
    entry.matches.some((m) => m.includes("yt-search-bar.web.app")),
    "the script no longer matches the quiet page host",
  );
});
