"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const prefs = require("../lib/prefs");

describe("bool", () => {
  it("keeps explicit false (do not treat as default on)", () => {
    assert.equal(prefs.bool(false, true), false);
  });
  it("keeps explicit true", () => {
    assert.equal(prefs.bool(true, false), true);
  });
  it("uses default only when missing", () => {
    assert.equal(prefs.bool(undefined, true), true);
    assert.equal(prefs.bool(undefined, false), false);
  });
});

describe("persistent playback and caption state", () => {
  it("keeps manual speed while leaving captions unset until the user chooses", () => {
    assert.equal(prefs.DEFAULTS.qt_playbackRate, 1);
    assert.equal(prefs.DEFAULTS.qt_fixed1x, false);
    assert.equal(prefs.DEFAULTS.qt_captionsEnabled, null);
  });

  it("keeps UNIP caption slots separate from YouTube selections", () => {
    assert.equal(prefs.DEFAULTS.qt_vjs_dualCaptions, false);
    assert.equal(prefs.DEFAULTS.qt_vjs_primaryTrack, "");
    assert.equal(prefs.DEFAULTS.qt_vjs_secondaryTrack, "");
    assert.equal(prefs.DEFAULTS.qt_vjs_slotsChosen, false);
  });
});
