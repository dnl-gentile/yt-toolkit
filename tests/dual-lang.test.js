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

  it("replaces slot 2 when a third language is chosen", () => {
    assert.deepEqual(dual.selectLang(["en", "ar"], "zh"), ["en", "zh"]);
  });

  it("refuses en and tlang:en as two slots", () => {
    assert.deepEqual(dual.selectLang(["en"], "tlang:en"), ["en"]);
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
