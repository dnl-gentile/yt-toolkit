#!/usr/bin/env node
/**
 * Dual/Color/Center must use native ytp-menuitem-toggle-checkbox (no qt-switch).
 * Pace lock/trim qt-switch must be the contained 40×24 pill (thumb inset, not overhang).
 * No paint override of YouTube's checkbox class.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const cssPath = path.join(root, "styles-toggles.css");
const stylesPath = path.join(root, "styles.css");
const menuPath = path.join(root, "content/yt-menu-patch.js");
const pacePath = path.join(root, "content/pace.js");

let failed = 0;
function pass(msg) {
  console.log("PASS  " + msg);
}
function fail(msg) {
  failed += 1;
  console.log("FAIL  " + msg);
}

const css = fs.readFileSync(cssPath, "utf8");
const stylesCss = fs.readFileSync(stylesPath, "utf8");
const menuSrc = fs.readFileSync(menuPath, "utf8");
const paceSrc = fs.readFileSync(pacePath, "utf8");

function has(src, re, label) {
  if (re.test(src)) pass(label);
  else fail(label + "  /" + re.source + "/");
}

has(
  menuSrc,
  /class="ytp-menuitem-toggle-checkbox"/,
  "CC Dual/Color/Center emit native ytp-menuitem-toggle-checkbox",
);
has(
  menuSrc,
  /function pinCapToggleLayout/,
  "copies Off icon width onto Dual/Color/Center (inset, not centered)",
);
has(
  css,
  /\.ytp-menuitem-content[\s\S]{0,180}min-width:\s*40px/,
  "content min-width 40px so the native toggle cannot collapse",
);
if (/class="[^"]*qt-switch/.test(menuSrc)) {
  fail("CC switchHtml must not add qt-switch (that double-paints the native pill)");
} else {
  pass("CC switchHtml has no qt-switch");
}

has(
  paceSrc,
  /class="qt-switch/,
  "pace lock/trim use qt-switch",
);
if (/ytp-menuitem-toggle-checkbox/.test(paceSrc)) {
  fail("pace.js must not use ytp-menuitem-toggle-checkbox");
} else {
  pass("pace.js does not use ytp-menuitem-toggle-checkbox");
}

has(
  css,
  /\.qt-switch\s*,[\s\S]{0,80}#qt-speed-menu\s+\.qt-switch\s*\{[^}]*width:\s*40px\s*!important/s,
  "pace switch width 40px",
);
has(
  css,
  /\.qt-switch[\s\S]{0,500}?height:\s*24px\s*!important/,
  "pace switch height 24px (contained pill)",
);
has(
  css,
  /\.qt-switch::after[\s\S]{0,280}top:\s*2px\s*!important/s,
  "thumb top 2px (inside the track, not overhang)",
);
has(
  css,
  /\.qt-switch::after[\s\S]{0,280}left:\s*2px\s*!important/s,
  "thumb left 2px inset",
);
has(
  css,
  /\.qt-switch::after[\s\S]{0,280}width:\s*20px\s*!important/s,
  "thumb 20px",
);
if (/top:\s*-3px/.test(css) || /top:\s*-3px/.test(stylesCss)) {
  fail("overhanging thumb top:-3px must not return");
} else {
  pass("no overhanging thumb top:-3px");
}
if (/translateX\(22px\)/.test(css) || /translateX\(22px\)/.test(stylesCss)) {
  fail("old translateX(22px) ON travel must not return");
} else {
  pass("no old translateX(22px)");
}

has(
  css,
  /\.qt-switch\.on[\s\S]{0,200}left:\s*18px\s*!important/s,
  "ON thumb left 18px (40 − 20 − 2)",
);

has(
  css,
  /--yt-sys-color-baseline--overlay-background-medium-light/,
  "OFF track follows YouTube overlay-background token",
);
has(
  css,
  /--yt-sys-color-baseline--overlay-button-primary/,
  "ON track follows YouTube overlay-button token",
);
has(
  css,
  /--yt-sys-color-baseline--overlay-text-secondary/,
  "OFF thumb follows YouTube secondary-text token",
);

/* Must not restyle YouTube's native checkbox (except position in our row). */
const paintNative = /(?:^|\n)\.ytp-menuitem-toggle-checkbox\s*[,{]/.test(css);
if (paintNative) fail("styles-toggles.css must not restyle .ytp-menuitem-toggle-checkbox paint");
else pass("no paint rules on bare .ytp-menuitem-toggle-checkbox");

has(
  css,
  /\.qt-switch:focus[\s\S]*?outline:\s*none\s*!important/,
  ".qt-switch:focus outline none",
);
has(
  css,
  /\.qt-chrome-btn:focus[\s\S]*?outline:\s*none\s*!important/,
  ".qt-chrome-btn:focus outline none",
);

has(
  css,
  /\.qt-cap-toggle[\s\S]{0,220}\.ytp-menuitem-icon[\s\S]{0,180}min-width:\s*24px/,
  "icon slot min-width 24px (Off inset, not glued left)",
);
if (/\.qt-cap-toggle[\s\S]{0,240}\.ytp-menuitem-icon[\s\S]{0,180}12px/.test(css) ||
    /\.qt-cap-toggle[\s\S]{0,240}\.ytp-menuitem-icon[\s\S]{0,180}12px/.test(stylesCss)) {
  fail("must not size .qt-cap-toggle icon at 12px");
} else {
  pass("icon slot is not 12px");
}

has(
  css,
  /\.qt-cap-toggle\s+\.ytp-menuitem-label[\s\S]{0,280}?text-align:\s*left\s*!important/,
  "caption-toggle label text-align left",
);
has(
  css,
  /\.qt-cap-toggle\s+\.ytp-menuitem-label[\s\S]{0,280}?white-space:\s*nowrap\s*!important/,
  "caption-toggle label nowrap",
);

if (/\.ytp-menuitem-label\s+\.qt-switch/.test(css)) {
  fail("switch must not be absolute inside the label");
} else {
  pass("switch is not absolute inside the label");
}

if (/text-align:\s*center/.test(css)) {
  fail("must not push Dual/Color/Center labels to center");
} else {
  pass("no text-align:center on caption-toggle labels");
}

function flexLeaks(src, name) {
  const re = /\.ytp-menuitem[^{}]*\{[^}]*display:\s*flex\s*!important/s;
  if (re.test(src)) {
    fail(name + " display:flex !important on .ytp-menuitem leaks into language rows");
  } else {
    pass(name + " no display:flex !important on .ytp-menuitem");
  }
}
flexLeaks(css, "styles-toggles.css");
flexLeaks(stylesCss, "styles.css");

if (failed) {
  console.log("\n" + failed + " check(s) failed");
  process.exit(1);
}
console.log("\nall checks passed");
