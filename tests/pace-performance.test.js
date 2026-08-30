"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "content", "pace.js"),
  "utf8",
);

describe("pace hot-path budget", () => {
  it("throttles rhythm and UI instead of running the full tick each frame", () => {
    assert.match(source, /const RHYTHM_FRAME_MS = 80;/);
    assert.match(source, /const UI_FRAME_MS = 140;/);
    assert.match(source, /now - lastRhythmFrame >= RHYTHM_FRAME_MS[\s\S]*?tick\(false\);/);
    assert.doesNotMatch(source, /lastShortsChromeFrame/);
  });

  it("does not rewrite stable cluster text", () => {
    assert.match(source, /full\.textContent !== fullText/);
    assert.match(source, /compact\.textContent !== compactText/);
  });

  it("uses one conditional metric on Shorts", () => {
    assert.match(
      source,
      /if \(isShortsPage\(\)\)[\s\S]*?return lockOn\(\) \? lockTarget\(\) \+ " WPM" : formatRate\(rate\);/,
    );
  });

  it("samples native menu paint only at bounded interaction points", () => {
    assert.match(source, /const NATIVE_MENU_SAMPLE_MS = 1800;/);
    assert.match(source, /function syncNativeMenuSkin\(player, force\)/);
    assert.match(source, /if \(n === 0\) syncNativeMenuSkin\(player\);/);
    const renderCluster = source.slice(
      source.indexOf("function renderCluster()"),
      source.indexOf("function syncClusterInteractivity"),
    );
    assert.doesNotMatch(renderCluster, /syncNativeMenuSkin/);
    assert.doesNotMatch(
      source,
      /requestAnimationFrame\(\(\) => syncNativeMenuSkin\(playerEl\(\), true\)\)/,
    );
  });
});
