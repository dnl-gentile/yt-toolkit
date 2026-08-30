"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const clock = require("../lib/clock");
const wpm = require("../lib/wpm");

describe("formatClock", () => {
  it("formats mm:ss and h:mm:ss", () => {
    assert.equal(clock.formatClock(0), "0:00");
    assert.equal(clock.formatClock(89), "1:29");
    assert.equal(clock.formatClock(3661), "1:01:01");
  });
});

describe("stable adjusted duration", () => {
  it("does not follow a 4x/8x trim boost", () => {
    const words = [];
    for (let i = 0; i < 100; i++)
      words.push({ w: "w" + i, t: i * 0.4, low: "w" + i });
    /* 40s of speech packed into 40s, plus 20s of trailing silence in a 60s video */
    const cut = (t0, t1) => wpm.silenceCut(words, t0, t1, 1.2);
    const adj = clock.watchSecs(0, 60, {
      paceLock: true,
      targetWpm: 150,
      baseWpm: 150,
      playbackRate: 8,
      trimSilence: true,
      silenceCut: cut,
    });
    /* lock rate 1x, trim cuts trailing silence after last word at t=39.6 */
    assert.ok(adj > 35 && adj < 45, "got " + adj);
  });

  it("180 WPM target on 90 WPM speech halves watch time", () => {
    const adj = clock.watchSecs(0, 180, {
      paceLock: true,
      targetWpm: 180,
      baseWpm: 90,
      playbackRate: 1,
      trimSilence: false,
    });
    assert.ok(Math.abs(adj - 90) < 0.5, "got " + adj);
  });

  it("hides original when nothing changed", () => {
    const html = clock.clockHtml(10, 60, 60.2);
    assert.equal(html.includes("qt-orig-time"), false);
    assert.equal(html, "0:10 / 1:00");
  });

  it("dims only the original total", () => {
    const html = clock.clockHtml(10, 45, 60);
    assert.ok(html.includes("0:10 / 0:45"));
    assert.ok(html.includes("(1:00)"));
    assert.ok(html.includes("qt-orig-time"));
  });

  it("13:09 at 1.5x is 8:46", () => {
    const orig = 13 * 60 + 9;
    const adj = clock.watchSecs(0, orig, {
      paceLock: false,
      playbackRate: 1.5,
      trimSilence: false,
    });
    assert.equal(clock.formatClock(adj), "8:46");
  });

  it("13:09 at 2x is ~6:35 (not stuck at 8:46)", () => {
    const orig = 13 * 60 + 9;
    const adj = clock.watchSecs(0, orig, {
      paceLock: false,
      playbackRate: 2,
      trimSilence: false,
    });
    assert.equal(clock.formatClock(adj), "6:35");
    assert.notEqual(clock.formatClock(adj), "8:46");
  });

  it("changing 1.5x → 2x changes the total", () => {
    const orig = 13 * 60 + 9;
    const a = clock.watchSecs(0, orig, { playbackRate: 1.5 });
    const b = clock.watchSecs(0, orig, { playbackRate: 2 });
    assert.ok(b < a - 60, "2x should be >1 min shorter than 1.5x, got " + a + " vs " + b);
  });

  it("clock and trim share leading/interior/trailing silence eligibility", () => {
    const words = [
      { w: "a", low: "a", t: 3 },
      { w: "b", low: "b", t: 5 },
    ];
    const cut = (t0, t1) => wpm.silenceCut(words, t0, t1, 1.2);
    const adjusted = clock.watchSecs(0, 6, {
      playbackRate: 1,
      trimSilence: true,
      silenceCut: cut,
    });
    /* leading 0.25→3 and interior 3.25→5 are removed; trailing 1s is kept */
    assert.equal(adjusted, 1.5);
  });
});
