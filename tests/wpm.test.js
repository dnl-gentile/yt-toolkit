"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const tt = require("../lib/timedtext");
const wpm = require("../lib/wpm");

function wordsAt(pairs) {
  return pairs.map(([w, t]) => ({ w, t, low: w.toLowerCase() }));
}

function sequence(tokens, start, step) {
  return tokens.map((w, i) => ({ w, t: start + i * step, low: w.toLowerCase() }));
}

describe("orthographic speech load", () => {
  it("keeps connectors positive but lighter than long technical words", () => {
    assert.ok(wpm.wordLoad("de") > 0);
    assert.ok(wpm.wordLoad("de") < wpm.wordLoad("responsabilidade"));
    assert.equal(wpm.wordLoad("alpha"), 1, "five characters define one equivalent word");
  });

  it("is Unicode-normalization and edge-punctuation invariant", () => {
    assert.equal(wpm.wordLoad("ação"), wpm.wordLoad("ac\u0327a\u0303o"));
    assert.equal(wpm.wordLoad("hello"), wpm.wordLoad("“hello…”"));
    assert.equal(wpm.wordLoad("..."), 0);
  });

  it("makes separate short- and long-word passages comparable in equivalent WPM", () => {
    const short = sequence(
      ["e", "de", "a", "o", "em", "por", "com", "um", "que", "se"],
      0,
      0.3,
    );
    const long = sequence(
      [
        "responsabilidade",
        "internacionalização",
        "regulamentação",
        "extraordinário",
        "desenvolvimento",
        "constitucional",
        "representatividade",
        "interdisciplinar",
        "sustentabilidade",
        "proporcionalidade",
      ],
      10,
      0.73,
    );
    const shortRate = wpm.localWpm(short, short[short.length - 1].t);
    const longRate = wpm.localWpm(long, long[long.length - 1].t);
    const legacyShort = ((short.length - 1) / (short.at(-1).t - short[0].t)) * 60;
    const legacyLong = ((long.length - 1) / (long.at(-1).t - long[0].t)) * 60;

    assert.ok(Math.abs(legacyShort - legacyLong) > 100);
    assert.ok(
      Math.abs(shortRate - longRate) < 18,
      `short=${shortRate}, long=${longRate}`,
    );
  });

  it("does not let unrelated vocabulary elsewhere change the same sample", () => {
    const sample = sequence(Array(10).fill("alpha"), 0, 0.5);
    const isolated = wpm.localWpm(sample, sample.at(-1).t);
    const unrelated = sample.concat(
      sequence(Array(10).fill("internacionalização"), 100, 0.8),
    );
    assert.equal(wpm.localWpm(unrelated, sample.at(-1).t), isolated);
  });

  it("does not inflate a sample when several tokens share its last onset", () => {
    const base = wordsAt([
      ["alpha", 0],
      ["bravo", 0.5],
      ["gamma", 1],
    ]);
    const grouped = wordsAt([
      ["alpha", 0],
      ["bravo", 0.5],
      ["gamma", 1],
      ["delta", 1],
      ["omega", 1],
    ]);
    assert.equal(wpm.localWpm(grouped, 1), wpm.localWpm(base, 1));
  });
});

describe("localWpm", () => {
  it("measures ~80 WPM slow speech (must NOT read as ≥150)", () => {
    /* 12 words over 8.25s ≈ 80 WPM: (11/8.25)*60 = 80 */
    const words = [];
    for (let i = 0; i < 12; i++) words.push({ w: "alpha", t: i * 0.75, low: "alpha" });
    const rate = wpm.localWpm(words, 8);
    assert.ok(rate > 60 && rate < 110, "got " + rate);
    assert.ok(rate < 150, "fake-200 floor returned " + rate);
  });

  it("measures ~120 WPM conversation", () => {
    const words = [];
    for (let i = 0; i < 20; i++) words.push({ w: "alpha", t: i * 0.5, low: "alpha" });
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

  it("uses a bounded local window on a long transcript", () => {
    const data = [];
    for (let i = 0; i < 20_000; i++)
      data.push({ w: "alpha", t: i * 0.5, low: "alpha" });
    let indexReads = 0;
    const words = new Proxy(data, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexReads++;
        return Reflect.get(target, property, receiver);
      },
    });
    wpm.prepareWords(words);
    indexReads = 0;
    const rate = wpm.localWpm(words, 5_000);
    assert.ok(rate > 100 && rate < 140, "got " + rate);
    assert.ok(indexReads < 300, "scanned too much of the transcript: " + indexReads);

    indexReads = 0;
    assert.equal(wpm.trimBoost(words, 5_000.2, 10_100), 0);
    assert.ok(indexReads < 100, "trim scanned too much of the transcript: " + indexReads);
  });

  it("validates timestamp cadence before weighting long fast words", () => {
    const words = sequence(Array(8).fill("internacionalização"), 0, 0.25);
    assert.ok(wpm.localWpm(words, words.at(-1).t) > 420);
    assert.ok(wpm.baseWpm(words) > 420);
  });

  it("keeps valid slow one-character speech even below 40 equivalent WPM", () => {
    const words = sequence(Array(8).fill("a"), 0, 1.1);
    const local = wpm.localWpm(words, words.at(-1).t);
    assert.ok(local > 0 && local < 40, `local=${local}`);
    assert.ok(wpm.baseWpm(words) > 0);
    assert.notEqual(wpm.lockRate(180, local), null);
  });

  it("still rejects implausible literal timestamp cadence", () => {
    const words = sequence(Array(20).fill("alpha"), 0, 0.1);
    assert.equal(wpm.localWpm(words, words.at(-1).t), 0);
    assert.equal(wpm.baseWpm(words), 0);
  });
});

describe("effectiveWpm", () => {
  it("1x keeps 150", () => {
    assert.equal(wpm.effectiveWpm(150, 1), 150);
  });

  it("2x doubles 150 to 300", () => {
    assert.equal(wpm.effectiveWpm(150, 2), 300);
  });

  it("silence stays 0 at any rate", () => {
    assert.equal(wpm.effectiveWpm(0, 2), 0);
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

  it("clamps at 4x", () => {
    assert.equal(wpm.lockRate(600, 80), 4);
  });
});

describe("trimBoost", () => {
  const words = wordsAt([
    ["a", 1],
    ["b", 1.3],
    ["c", 5.0],
    ["d", 5.3],
  ]);

  it("boosts remaining silence without waiting 1.15s", () => {
    /* t=1.7 is 0.4s after last word, 3.3s left until speech */
    const b = wpm.trimBoost(words, 1.7);
    assert.equal(b, 4, "got " + b);
  });

  it("does not boost 0.15s after the last word", () => {
    assert.equal(wpm.trimBoost(words, 1.4), 0);
  });

  it("is 0 on the first spoken word after the gap (snap-back)", () => {
    assert.equal(wpm.trimBoost(words, 5.0), 0);
    assert.equal(wpm.trimBoost(words, 5.2), 0);
    assert.equal(wpm.inSilence(words, 5.0), false);
  });

  it("is 0 while currently speaking", () => {
    assert.equal(wpm.trimBoost(words, 1.15), 0);
  });

  it("boosts trailing silence after the last word", () => {
    const b = wpm.trimBoost(words, 6.2, 20);
    assert.equal(b, 8, "got " + b);
  });

  it("uses 4x not 3x so it is faster than pace lock 2.5x", () => {
    const b = wpm.trimBoost(words, 1.8);
    assert.equal(b, 4);
    assert.ok(b > 2.5);
  });

  it("does not boost tiny ASR holes under 1.2s", () => {
    const tight = wordsAt([
      ["a", 1],
      ["b", 1.9],
    ]);
    assert.equal(wpm.trimBoost(tight, 1.4), 0);
  });

  it("uses the exact 1.2s trim boundary", () => {
    assert.equal(
      wpm.trimBoost(wordsAt([["a", 1], ["b", 2.19]]), 1.4),
      0,
      "1.19s must not trim",
    );
    assert.equal(
      wpm.trimBoost(wordsAt([["a", 1], ["b", 2.2]]), 1.4),
      4,
      "1.20s must trim",
    );
  });

  it("does not boost a short trailing gap", () => {
    assert.equal(wpm.trimBoost(wordsAt([["last", 9.5]]), 9.8, 10), 0);
  });

  it("can boost a real leading gap", () => {
    assert.equal(wpm.trimBoost(wordsAt([["first", 3]]), 0.5, 10), 4);
  });
});

describe("silenceCut interval consistency", () => {
  it("counts eligible leading silence but not short trailing silence", () => {
    const words = wordsAt([["a", 3], ["b", 4]]);
    assert.equal(wpm.silenceCut(words, 0, 5, 1.2), 2.75);
  });

  it("does not cut a trailing interval below 1.2s", () => {
    assert.equal(wpm.silenceCut(wordsAt([["a", 0]]), 0, 0.5, 1.2), 0);
  });

  it("cuts eligible interior and trailing intervals", () => {
    assert.equal(wpm.silenceCut(wordsAt([["a", 1], ["b", 3]]), 0, 4, 1.2), 1.75);
    assert.equal(wpm.silenceCut(wordsAt([["a", 0]]), 0, 3, 1.2), 2.75);
  });
});

describe("baseWpm median", () => {
  it("ignores a single fast outlier window", () => {
    const words = [];
    for (let i = 0; i < 10; i++) words.push({ w: "alpha", t: i * 0.5, low: "alpha" });
    for (let i = 0; i < 10; i++)
      words.push({ w: "bravo", t: 20 + i * 0.5, low: "bravo" });
    const base = wpm.baseWpm(words);
    assert.ok(base > 100 && base < 140, "got " + base);
  });

  it("keeps 0.90s slow speech in one utterance below the 1.15s silence boundary", () => {
    const words = sequence(Array(8).fill("alpha"), 0, 0.9);
    const local = wpm.localWpm(words, words.at(-1).t);
    const base = wpm.baseWpm(words);
    assert.ok(local > 60 && local < 75, `local=${local}`);
    assert.ok(base > 60 && base < 75, `base=${base}`);
  });

  it("uses one inclusive 1.15s boundary for base and local WPM", () => {
    for (const step of [1.149, 1.15]) {
      const words = sequence(Array(5).fill("alpha"), 0, step);
      assert.ok(wpm.baseWpm(words) > 0, `base lost speech at ${step}s`);
      assert.ok(wpm.localWpm(words, words.at(-1).t) > 0, `local lost speech at ${step}s`);
    }
    const split = sequence(Array(5).fill("alpha"), 0, 1.151);
    assert.equal(wpm.baseWpm(split), 0);
    assert.equal(wpm.localWpm(split, split.at(-1).t), 0);
  });
});
