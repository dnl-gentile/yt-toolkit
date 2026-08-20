"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const tt = require("../lib/timedtext");

describe("parseJson3", () => {
  it("uses real cue duration, not a 0.28s/word floor", () => {
    const json = JSON.stringify({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 8000,
          segs: [
            { utf8: "one two three four five six seven eight nine ten" },
          ],
        },
      ],
    });
    const cues = tt.parseTimedtext(json);
    assert.equal(cues.length, 1);
    assert.equal(cues[0].words.length, 10);
    const span = cues[0].words[9].t - cues[0].words[0].t;
    /* 10 words over 8s ⇒ ~0.8s between first and last. The old floor
       (n * 0.28 = 2.8s) would pack them into ~2.5s. */
    assert.ok(span > 6, "spread=" + span);
    assert.ok(span < 8.1, "spread=" + span);
  });

  it("respects tOffsetMs when present", () => {
    const json = JSON.stringify({
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [
            { utf8: "hello", tOffsetMs: 0 },
            { utf8: " world", tOffsetMs: 1200 },
            { utf8: " there", tOffsetMs: 2400 },
          ],
        },
      ],
    });
    const cues = tt.parseTimedtext(json);
    assert.equal(cues[0].words[0].t, 1);
    assert.equal(cues[0].words[1].t, 2.2);
    assert.equal(cues[0].words[2].t, 3.4);
  });

  it("drops [Music] noise cues", () => {
    const json = JSON.stringify({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 4000,
          segs: [{ utf8: "[Music]" }],
        },
        {
          tStartMs: 5000,
          dDurationMs: 2000,
          segs: [{ utf8: "hello there" }],
        },
      ],
    });
    const cues = tt.parseTimedtext(json);
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "hello there");
  });
});

describe("collapseRollingCues", () => {
  it("does not double-count overlapping ASR windows", () => {
    const cues = tt.parseTimedtext(
      JSON.stringify({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 2000,
            segs: [{ utf8: "hello there how" }],
          },
          {
            tStartMs: 800,
            dDurationMs: 2000,
            segs: [{ utf8: "there how are" }],
          },
          {
            tStartMs: 1600,
            dDurationMs: 2000,
            segs: [{ utf8: "how are you" }],
          },
        ],
      }),
    );
    const words = tt.timedWords(cues);
    const lows = words.map((w) => w.low);
    assert.deepEqual(lows, ["hello", "there", "how", "are", "you"]);
  });
});

describe("isOriginalTrack", () => {
  it("rejects tlang translations", () => {
    assert.equal(
      tt.isOriginalTrack("tlang:zh", "https://www.youtube.com/api/timedtext?v=x&lang=en&tlang=zh&fmt=json3", "en"),
      false,
    );
    assert.equal(
      tt.isOriginalTrack("zh", "https://www.youtube.com/api/timedtext?v=x&lang=zh&fmt=json3", "en"),
      false,
    );
  });

  it("accepts the ASR source language", () => {
    assert.equal(
      tt.isOriginalTrack(
        "en",
        "https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&fmt=json3",
        "en",
      ),
      true,
    );
  });
});
