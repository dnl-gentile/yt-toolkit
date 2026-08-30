"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const videojs = require("../lib/videojs");

describe("Video.js course-player helpers", () => {
  it("steps manual speed by 0.25x and clamps the supported range", () => {
    assert.equal(videojs.stepRate(1, 1), 1.25);
    assert.equal(videojs.stepRate(1.25, -1), 1);
    assert.equal(videojs.stepRate(4, 1), 4);
    assert.equal(videojs.stepRate(0.25, -1), 0.25);
  });

  it("finds an active cue without inventing word offsets", () => {
    const cues = [
      { start: 1, end: 2.5, text: "first sentence" },
      { start: 5, end: 7, text: "second sentence" },
    ];
    assert.equal(videojs.cueAt(cues, 0.5), null);
    assert.equal(videojs.cueAt(cues, 2)?.text, "first sentence");
    assert.equal(videojs.cueAt(cues, 4), null);
    assert.equal(videojs.cueAt(cues, 5)?.text, "second sentence");
  });

  it("keeps two persistent language vacancies", () => {
    const tracks = [{ language: "pt" }, { language: "en" }, { language: "de" }];
    let slots = { primary: "pt", secondary: "en" };
    assert.deepEqual(videojs.selectLanguage(slots, "de", tracks), slots);
    slots = videojs.selectLanguage(slots, "en", tracks);
    assert.deepEqual(slots, { primary: "pt", secondary: "" });
    slots = videojs.selectLanguage(slots, "de", tracks);
    assert.deepEqual(slots, { primary: "pt", secondary: "de" });
    slots = videojs.selectLanguage(slots, "pt", tracks);
    assert.deepEqual(slots, { primary: "", secondary: "de" });
  });

  it("fills a primary vacancy without duplicating an occupied secondary", () => {
    const tracks = [{ language: "pt" }, { language: "en" }, { language: "de" }];
    assert.deepEqual(
      videojs.fillVacancies({ primary: "", secondary: "pt" }, tracks),
      { primary: "en", secondary: "pt" },
    );
    assert.deepEqual(
      videojs.fillVacancies({ primary: "missing", secondary: "also-missing" }, tracks),
      { primary: "pt", secondary: "en" },
    );
  });

  it("adjusts clock time only by the manual transport multiplier", () => {
    assert.deepEqual(videojs.adjustedTimes(20, 832, 2), {
      current: 10,
      duration: 416,
      original: 832,
    });
  });
});

describe("Video.js adapter safety budget", () => {
  const root = path.join(__dirname, "..");
  const adapter = fs.readFileSync(path.join(root, "content/videojs.js"), "utf8");
  const bridge = fs.readFileSync(path.join(root, "content/videojs-main.js"), "utf8");

  it("does not inherit YouTube polling or animation-frame loops", () => {
    assert.doesNotMatch(adapter, /setInterval\s*\(/);
    assert.doesNotMatch(adapter, /requestAnimationFrame\s*\(/);
    assert.doesNotMatch(bridge, /setInterval\s*\(/);
    assert.doesNotMatch(bridge, /requestAnimationFrame\s*\(/);
  });

  it("does not hook course network requests or synthesize word timing", () => {
    assert.doesNotMatch(bridge, /XMLHttpRequest|\.fetch\s*=|fetch\s*\(/);
    assert.doesNotMatch(adapter, /tOffsetMs|forceEven|cueFromParts|localWpm|trimBoost/);
  });

  it("uses only bounded player discovery plus local root observers", () => {
    assert.equal((bridge.match(/new MutationObserver/g) || []).length, 2);
    assert.equal((adapter.match(/new MutationObserver/g) || []).length, 3);
    assert.match(bridge, /DISCOVERY_TTL_MS = 15000/);
    assert.match(adapter, /DISCOVERY_TTL_MS = 15000/);
    assert.match(adapter, /attributeFilter: \["class"\]/);
    assert.equal((adapter.match(/new ResizeObserver/g) || []).length, 1);
  });

  it("keeps native captions intact until Toolkit explicitly selects a mode", () => {
    assert.match(bridge, /command\.preserve/);
    assert.match(adapter, /preserve: true/);
    assert.match(adapter, /nativeCaptionsOn\(\)/);
  });

  it("rebinds generations and listens for late cue readiness", () => {
    assert.match(bridge, /generation\+\+/);
    assert.match(adapter, /bridgeGeneration/);
    assert.match(bridge, /"cuechange"/);
    assert.match(bridge, /"loadstart", invalidateMediaGeneration/);
    assert.match(bridge, /cueSignature: requestedLanguages/);
    assert.match(adapter, /30000/);
    assert.match(adapter, /function invalidateLocalMediaSnapshot\(\)/);
    assert.match(adapter, /"loadstart", \(\) => \{/);
    assert.match(adapter, /"emptied", \(\) => \{/);
  });

  it("caps cue work before crossing the world bridge", () => {
    assert.match(bridge, /MAX_TRACK_ENTRIES_INSPECTED = 128/);
    assert.match(bridge, /Number\.isFinite\(length\)/);
    assert.match(bridge, /trackNodeLimit = Math\.min/);
    assert.doesNotMatch(bridge, /querySelectorAll\("track"\)\.forEach/);
    assert.match(bridge, /MAX_CUES_TOTAL = 4000/);
    assert.match(bridge, /MAX_TEXT_TOTAL = 240000/);
    assert.match(bridge, /MAX_PAYLOAD_BYTES = 360000/);
    assert.match(bridge, /nextFingerprint !== lastFingerprint/);
    assert.match(adapter, /MAX_BRIDGE_PAYLOAD_BYTES = 360000/);
    assert.match(adapter, /if \(cueBudget-- <= 0\) break/);
  });

  it("does not repeat a document-wide player query for every added node", () => {
    assert.equal((bridge.match(/document\.querySelector\("\.video-js"\)/g) || []).length, 1);
    assert.equal((adapter.match(/document\.querySelector\("\.video-js"\)/g) || []).length, 1);
    assert.match(bridge, /findPlayer\(node, false\)/);
    assert.match(adapter, /find\(node, false\)/);
  });

  it("authenticates and coalesces bridge messages and avoids slider storage churn", () => {
    assert.match(bridge, /QT_VIDEOJS_HELLO/);
    assert.match(adapter, /send\("QT_VIDEOJS_HELLO"\)/);
    assert.match(adapter, /event\.data\.channel !== CHANNEL_ID/);
    assert.match(bridge, /if \(channel\) return/);
    assert.match(bridge, /requestId/);
    assert.match(adapter, /event\.data\.requestId !== state\.bridgeRequestId/);
    assert.match(adapter, /performance\.now\(\) - state\.bridgeRequestAt > BRIDGE_REQUEST_TIMEOUT_MS/);
    assert.match(adapter, /if \(!track \|\| typeof track !== "object"\) continue/);
    assert.match(adapter, /finally \{/);
    assert.match(bridge, /COMMAND_MIN_GAP_MS = 1200/);
    assert.match(bridge, /!commandTimer &&\s*raw === lastCommandRaw/);
    assert.match(bridge, /REQUEST_MIN_GAP_MS = 1200/);
    assert.match(adapter, /BRIDGE_REQUEST_TIMEOUT_MS - \(now - state\.bridgeRequestAt\)/);
    assert.match(adapter, /BRIDGE_MIN_GAP_MS = 100/);
    assert.match(adapter, /setTimeout\(flushBridgePayload, BRIDGE_MIN_GAP_MS\)/);
    assert.match(adapter, /syncHostStorage: false/);
  });

  it("keeps saved language preferences separate from per-course fallbacks", () => {
    assert.match(adapter, /preferredPrimary/);
    assert.match(adapter, /preferredSecondary/);
    assert.match(adapter, /qt_vjs_primaryTrack: state\.preferredPrimary/);
    assert.match(adapter, /state\.userEditedSlots = false/);
  });

  it("shares fixed 1x across adapters without mistaking host resets for user intent", () => {
    assert.match(adapter, /qt_fixed1x/);
    assert.match(adapter, /changes\.qt_fixed1x/);
    assert.match(adapter, /if \(!explicitNativeChoice\) \{\s*applyRate\(1/);
    assert.match(adapter, /rangeFixed1xWasOn/);
    assert.match(adapter, /qt_playbackRate: live, qt_fixed1x: false/);
  });

  it("watches only the local ancestor chain for SPA player replacement", () => {
    assert.match(adapter, /while \(ancestor\?\.nodeType === 1 && depth < 8\)/);
    assert.match(adapter, /observe\(ancestor, \{ childList: true \}\)/);
    assert.doesNotMatch(adapter, /observe\(document\.body, \{[^}]*subtree: true/);
  });
});
