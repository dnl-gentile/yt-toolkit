"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const dual = require("../lib/dual-lang");

describe("selectLang", () => {
  it("adds a second different language", () => {
    assert.deepEqual(dual.selectLang(["en"], "ar"), ["en", "ar"]);
  });

  it("toggles off when clicking the same token", () => {
    assert.deepEqual(dual.selectLang(["en", "ar"], "ar"), ["en"]);
  });

  it("preserves slot 2 when slot 1 is cleared", () => {
    const next = dual.selectLang(["en", "ar"], "en");
    assert.deepEqual(next, ["", "ar"]);
    assert.equal(dual.slotOf(next, "ar"), 1);
  });

  it("fills the exact vacancy without moving the other slot", () => {
    assert.deepEqual(dual.selectLang(["", "ar"], "zh"), ["zh", "ar"]);
  });

  it("blocks a third language until a slot is cleared", () => {
    assert.deepEqual(dual.selectLang(["en", "ar"], "zh"), ["en", "ar"]);
  });

  it("treats en and tlang:en as the same selected identity", () => {
    assert.deepEqual(dual.selectLang(["en"], "tlang:en"), []);
  });

  it("Akan maps and can be slot 2", () => {
    const code = dual.codeFromLabel("Akan");
    assert.equal(code, "ak");
    assert.deepEqual(dual.selectLang(["en"], "ak"), ["en", "ak"]);
  });

  it("Arabic label maps to ar", () => {
    assert.equal(dual.codeFromLabel("Arabic"), "ar");
    assert.equal(dual.slotOf(["en", "ar"], "ar"), 1);
    assert.equal(dual.slotOf(["en", "ar"], "tlang:ar"), 1);
  });
});

describe("uniqueLangs", () => {
  it("caps at 2 and drops duplicate bases", () => {
    assert.deepEqual(dual.uniqueLangs(["en", "tlang:en", "ar", "zh"]), ["en", "ar"]);
  });
});

describe("normalizeSlots", () => {
  it("preserves a leading vacancy while slot 2 is occupied", () => {
    assert.deepEqual(dual.normalizeSlots(["", "tlang:pt"]), ["", "tlang:pt"]);
  });

  it("omits trailing vacancies in canonical storage", () => {
    assert.deepEqual(dual.normalizeSlots(["en", ""]), ["en"]);
    assert.deepEqual(dual.normalizeSlots(["", ""]), []);
  });

  it("drops a same-base duplicate without shifting slots", () => {
    assert.deepEqual(dual.normalizeSlots(["en", "tlang:en"]), ["en"]);
  });
});
