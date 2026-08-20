"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const tt = require("../lib/timedtext");
const wpm = require("../lib/wpm");

function wordsAt(pairs) {
  return pairs.map(([w, t]) => ({ w, t, low: w.toLowerCase() }));
}

describe("localWpm", () => {
  it("measures ~80 WPM slow speech (must NOT read as ≥150)", () => {
    /* 12 words over 8.25s ≈ 80 WPM: (11/8.25)*60 = 80 */
    const words = [];
    for (let i = 0; i < 12; i++) words.push({ w: "w" + i, t: i * 0.75, low: "w" + i });
    const rate = wpm.localWpm(words, 8);
    assert.ok(rate > 60 && rate < 110, "got " + rate);
    assert.ok(rate < 150, "fake-200 floor returned " + rate);
  });

  it("measures ~120 WPM conversation", () => {
    const words = [];
    for (let i = 0; i < 20; i++) words.push({ w: "w" + i, t: i * 0.5, low: "w" + i });
    const rate = wpm.localWpm(words, 9);
    assert.ok(rate > 100 && rate < 140, "got " + rate);
  });

  it("pause ≥1.15s is 0", () => {
    const words = wordsAt([
      ["hello", 1],
      ["there", 1.3],
    ]);
    assert.equal(wpm.localWpm(words, 3.5), 0);
    assert.equal(wpm.inSilence(words, 3.5), true);
  });

  it("does not use n*0.28 duration when parsing a slow json3 cue", () => {
    const json = JSON.stringify({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 9000,
          segs: [
            {
              utf8: "this is a slow careful explanation of the idea today",
            },
          ],
        },
      ],
    });
    const cues = tt.parseTimedtext(json);
    const words = tt.timedWords(cues);
    const rate = wpm.localWpm(words, 8);
    /* 10 words over 9s ≈ 60 WPM. Old floor would spread into 2.8s ≈ 193. */
    assert.ok(rate < 120, "got " + rate + " (looks like the 0.28s floor)");
    assert.ok(rate > 40, "got " + rate);
  });
});

describe("lockRate", () => {
  it("100 WPM speech + 200 target → ~2x", () => {
    const r = wpm.lockRate(200, 100);
    assert.ok(Math.abs(r - 2) < 0.01, "got " + r);
  });

  it("180 WPM speech + 180 target → 1x", () => {
    const r = wpm.lockRate(180, 180);
    assert.ok(Math.abs(r - 1) < 0.01, "got " + r);
  });

  it("silence (local 0) does not invent a rate", () => {
    assert.equal(wpm.lockRate(180, 0), null);
  });

  it("clamps at 2.5x", () => {
    assert.equal(wpm.lockRate(600, 80), 2.5);
  });
});

describe("trimBoost", () => {
  const words = wordsAt([
    ["a", 1],
    ["b", 1.3],
    ["c", 5.0],
    ["d", 5.3],
  ]);

  it("boosts a ≥1.2s gap", () => {
    /* t=2.8 is 1.5s after the last word (1.3) and 2.2s before the next (5.0) */
    assert.equal(wpm.trimBoost(words, 2.8), 4);
  });

  it("does not keep boosting 0.7s after the last word", () => {
    assert.equal(wpm.trimBoost(words, 2.0), 0);
  });

  it("is 0 on the first spoken word after the gap (snap-back)", () => {
    assert.equal(wpm.trimBoost(words, 5.0), 0);
    assert.equal(wpm.trimBoost(words, 5.2), 0);
    assert.equal(wpm.inSilence(words, 5.0), false);
  });

  it("is 0 while currently speaking", () => {
    assert.equal(wpm.trimBoost(words, 1.15), 0);
  });

  it("does not boost tiny ASR holes under 1.2s", () => {
    const tight = wordsAt([
      ["a", 1],
      ["b", 1.9],
    ]);
    assert.equal(wpm.trimBoost(tight, 1.4), 0);
  });
});

describe("baseWpm median", () => {
  it("ignores a single fast outlier window", () => {
    const words = [];
    for (let i = 0; i < 10; i++) words.push({ w: "a" + i, t: i * 0.5, low: "a" + i });
    for (let i = 0; i < 10; i++)
      words.push({ w: "b" + i, t: 20 + i * 0.5, low: "b" + i });
    const base = wpm.baseWpm(words);
    assert.ok(base > 100 && base < 140, "got " + base);
  });
});
