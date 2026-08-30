#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const require = createRequire(import.meta.url);
const dual = require(path.join(root, "lib/dual-lang.js"));
const src = fs.readFileSync(path.join(root, "content/captions.js"), "utf8");
let failed = 0;

function ok(cond, msg) {
  if (cond) console.log("PASS  " + msg);
  else {
    console.log("FAIL  " + msg);
    failed++;
  }
}

ok(!/\bv\.paused\b/.test(src), "tick has no v.paused early-return");
ok(
  /dataset\.sig/.test(src) && /qt_captionLangs/.test(src) && /bustCap\(\)/.test(src),
  "qt_captionLangs path busts dataset.sig",
);
ok(
  /if \(ch\.qt_captionLangs\)[\s\S]*bustCap\(\)[\s\S]*tick\(\)/.test(src) ||
    /if \(ch\.qt_captionLangs\)[\s\S]*redraw = true[\s\S]*bustCap\(\);\s*tick\(\)/.test(src),
  "lang change busts sig then tick() immediately (paused-safe)",
);
ok(/YtToolkitDual/.test(src), "uses YtToolkitDual");
ok(/Dual\.uniqueLangs/.test(src), "slot identity via Dual.uniqueLangs");
ok(/Dual\.langBase/.test(src), "slot identity via Dual.langBase");
ok(
  /if \(two\) requestLang\(langs\[1\]\)/.test(src),
  "requestLang(langs[1]) fires whenever a second slot is set",
);
ok(
  !/if\s*\(\s*v\.paused\s*\)[^{]*requestLang/.test(src) &&
    !/if\s*\(\s*!v\.paused/.test(src),
  "requestLang is not gated on play",
);
ok(
  /centerOn\(\)\)[\s\S]{0,180}?color:#fff;opacity:1[\s\S]{0,80}?opacity:0\.28/.test(src) ||
    /centerOn\(\)[\s\S]{0,200}?on \? "color:#fff;opacity:1" : "color:#fff;opacity:0\.28"/.test(src),
  "Center + highlight off: only center word white, neighbors dim",
);
ok(/function captionFontPx\(/.test(src), "one captionFontPx function");
ok(/\.ytp-caption-segment/.test(src), "copies .ytp-caption-segment font-size");
ok(/px >= 16/.test(src), "native copy requires fontSize >= 16");
ok(/h \* 0\.04/.test(src), "same base as native: player.clientHeight * 0.04");
ok(/fontSizeIncrement/.test(src), "follows YouTube fontSizeIncrement for - / =");
ok(/FONT_INC_SCALE/.test(src), "50–400% increment scale");
ok(!/op < 0\.05/.test(src), "does not reject native size when opacity is 0");
ok(
  !/Math\.min\([^;]*?,\s*2[24]\s*\)/.test(src) &&
    !/min\(\s*px\s*,\s*2[24]\s*\)/.test(src),
  "no 22px/24px Center-word cap",
);
ok(/STACK_GAP = 48/.test(src), "Dual stack gap ~48px");
ok(/PRIMARY_BOTTOM = 80/.test(src), "primary above native-caption area");
ok(
  /normalizePos/.test(src) && /state\.pos = \{ p: \{ x: 0, y: 0 \}/.test(src),
  "zero qt_captionPos / new video resets to defaults",
);
ok(/if \(!ccEnabled\(\)\)/.test(src), "CC Off always hides our overlay");
ok(!/ensureCcOn/.test(src), "Dual never forces CC on");
ok(
  /highlightOn\(\) \|\| centerOn\(\) \|\| dualActive/.test(src),
  "Dual off + highlight off + center off → wantPaint false",
);
ok(!/MutationObserver/.test(src), "no MutationObserver");
ok(!/document\.body/.test(src), "no document.body (no body observer)");
ok(
  !/ytp-caption-segment[\s\S]{0,80}textContent\s*=/.test(src) &&
    !/\.caption-window[\s\S]{0,40}innerHTML\s*=/.test(src),
  "does not rewrite native caption DOM",
);

const uniq = dual.uniqueLangs(["en", "tlang:en", "ar"]);
assert.deepEqual(uniq, ["en", "ar"]);
ok(uniq.length === 2 && uniq[1] === "ar", "en ≡ tlang:en cannot occupy both slots");
ok(dual.langBase("tlang:en") === "en", "langBase(tlang:en) === en");
ok(dual.langBase("en-US") === "en", "langBase(en-US) === en");

function fallbackPx(h, inc) {
  const scales = { "-2": 0.5, "-1": 0.75, 0: 1, 1: 1.5, 2: 2, 3: 3, 4: 4 };
  const base = Math.max(18, h * 0.04);
  const scale = scales[String(inc || 0)] != null ? scales[String(inc || 0)] : 1;
  return Math.round(Math.max(18, base * scale));
}
ok(fallbackPx(400, 0) === 18, "400px player → 18");
ok(fallbackPx(640, 0) === 26, "640px player → 26");
ok(fallbackPx(640, 2) === 51, "640px at 200% → 51 (tracks native - / =)");
ok(fallbackPx(2160, 4) === 346, "large-player 400% fallback is not artificially capped");
ok(fallbackPx(640, 0) !== 24 && fallbackPx(640, 0) > 24, "640px is above the old 24px RSVP cap");

if (failed) {
  console.log(failed + " check(s) failed");
  process.exit(1);
}
console.log("all checks passed");
