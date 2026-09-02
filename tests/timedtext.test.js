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

describe("parseSrv3", () => {
  it("parses <p t d> milliseconds and <s t> word offsets", () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<body>
<p t="0" d="2000">hello there</p>
<p t="2500" d="1800"><s>how</s><s t="400"> are</s><s t="800"> you</s></p>
</body>
</timedtext>`;
    const cues = tt.parseTimedtext(xml);
    assert.equal(cues.length, 2);
    assert.equal(cues[0].text, "hello there");
    assert.equal(cues[0].words.length, 2);
    assert.ok(Math.abs(cues[0].start) < 0.001);
    assert.ok(Math.abs(cues[0].end - 2) < 0.001);
    assert.equal(cues[1].words.map((w) => w.w).join(" "), "how are you");
    assert.ok(Math.abs(cues[1].words[0].t - 2.5) < 0.001);
    assert.ok(Math.abs(cues[1].words[1].t - 2.9) < 0.001);
    assert.ok(Math.abs(cues[1].words[2].t - 3.3) < 0.001);
  });
});

describe("withJson3", () => {
  it("appends fmt=json3 without re-encoding the signature", () => {
    const signed =
      "https://www.youtube.com/api/timedtext?v=x&signature=AB+CD/EF==&lang=en&pot=aa+bb";
    const out = tt.withJson3(signed);
    assert.ok(out.includes("signature=AB+CD/EF=="), out);
    assert.ok(out.includes("pot=aa+bb"), out);
    assert.equal(out.includes("%2B"), false);
    assert.ok(/fmt=json3/.test(out));
  });

  it("strips tlang without touching other params", () => {
    const url =
      "https://www.youtube.com/api/timedtext?v=x&lang=en&tlang=pt&signature=A+B";
    const out = tt.withJson3(url, false);
    assert.equal(/tlang=/.test(out), false, out);
    assert.ok(out.includes("signature=A+B"), out);
    assert.ok(/fmt=json3/.test(out));
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

  it("treats lang=en without kind as original when none is known yet", () => {
    assert.equal(
      tt.isOriginalTrack(
        "en",
        "https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=json3&caps=asr",
        "",
      ),
      true,
    );
  });

  it("rejects uploaded same-lang when ASR is required", () => {
    assert.equal(
      tt.isOriginalTrack(
        "en",
        "https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=json3",
        "en",
        { requireAsr: true },
      ),
      false,
    );
  });

  it("reads caps=asr as kind=asr", () => {
    assert.equal(
      tt.langFromUrl("https://www.youtube.com/api/timedtext?v=x&lang=en&caps=asr").kind,
      "asr",
    );
  });
});

describe("timedtext provenance", () => {
  it("never classifies an ASR-backed translation as source ASR", () => {
    const url =
      "https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&tlang=pt&fmt=json3";
    assert.equal(tt.isTranslation(url, "tlang:pt"), true);
    assert.equal(tt.isGeneratedUrl(url), false);
  });
});

describe("mergeAuthParams", () => {
  it("copies pot without replacing the target track signature", () => {
    const base =
      "https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&signature=TARGET";
    const signed =
      "https://www.youtube.com/api/timedtext?v=x&lang=en&pot=aa+bb/cc&signature=AB+CD/EF==";
    const out = tt.mergeAuthParams(base, signed);
    assert.ok(out.includes("pot=aa+bb/cc"), out);
    assert.ok(out.includes("signature=TARGET"), out);
    assert.equal(out.includes("signature=AB+CD/EF=="), false, out);
    assert.equal(out.includes("%2B"), false);
    assert.ok(out.includes("kind=asr"));
  });

  it("does not duplicate pot already on the target", () => {
    const base = "https://www.youtube.com/api/timedtext?v=x&pot=keep+me";
    const signed = "https://www.youtube.com/api/timedtext?v=x&pot=other";
    const out = tt.mergeAuthParams(base, signed);
    assert.ok(out.includes("pot=keep+me"));
    assert.equal(/pot=other/.test(out), false);
  });
});

describe("trackIsAsr", () => {
  it("matches kind, vssId a.*, and *.asr ids", () => {
    assert.equal(tt.trackIsAsr({ kind: "asr", languageCode: "en" }), true);
    assert.equal(tt.trackIsAsr({ kind: "", vssId: "a.en" }), true);
    assert.equal(tt.trackIsAsr({ kind: "", id: "en.asr" }), true);
    assert.equal(tt.trackIsAsr({ kind: "", vssId: ".en", languageCode: "en" }), false);
  });
});

describe("wordIndexAt", () => {
  it("follows ASR tOffsetMs instead of even time split", () => {
    const words = [
      { w: "hello", t: 0.1 },
      { w: "world", t: 0.3 },
      { w: "there", t: 2.5 },
    ];
    /* Cue 0–3s, 3 words. Even split at t=2.0 would be index 2.
       Stamps still have "world" current until 2.5. */
    assert.equal(tt.wordIndexAt(words, 2.0, 0, 3), 1);
    assert.equal(tt.wordIndexAt(words, 2.6, 0, 3), 2);
    assert.equal(tt.wordIndexAt(words, 2.0, 0, 3, { forceEven: true }), 2);
  });
});
