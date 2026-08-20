#!/usr/bin/env node
/**
 * Fails if styles-toggles.css loses native ON paint, focus kill, or Off-aligned rows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const cssPath = path.join(root, "styles-toggles.css");

let failed = 0;
function pass(msg) {
  console.log("PASS  " + msg);
}
function fail(msg) {
  failed += 1;
  console.log("FAIL  " + msg);
}

if (!fs.existsSync(cssPath)) {
  fail("styles-toggles.css missing at " + cssPath);
  process.exit(1);
}

const css = fs.readFileSync(cssPath, "utf8");

function has(re, label) {
  if (re.test(css)) pass(label);
  else fail(label + "  /" + re.source + "/");
}

has(
  /\.qt-switch\s*\{[^}]*background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.15\s*\)\s*!important/s,
  "off track rgba(255,255,255,0.15) !important",
);
has(
  /\.qt-switch::after\s*\{[^}]*background:\s*#c8c8c8\s*!important/s,
  "off thumb #c8c8c8 !important",
);
has(
  /\.qt-switch\.on[\s\S]*?background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.55\s*\)\s*!important/,
  "on track rgba(255,255,255,0.55) !important (lighter than styles.css 0.42)",
);
has(
  /\.qt-switch\.on::after[\s\S]*?background:\s*#ffffff\s*!important/,
  "on thumb #ffffff !important",
);
has(
  /\.ytp-menuitem\[aria-checked="true"\]\s+\.qt-switch/,
  "aria-checked=true .qt-switch ON selector",
);
has(
  /\.ytp-menuitem-toggle-checkbox/,
  "overrides YouTube .ytp-menuitem-toggle-checkbox",
);

const onAlpha = css.match(
  /\.qt-switch\.on[\s\S]{0,400}?background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0\.\d+)\s*\)\s*!important/,
);
const offAlpha = css.match(
  /\.qt-switch\s*\{[\s\S]{0,500}?background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0\.\d+)\s*\)\s*!important/,
);
if (onAlpha && offAlpha) {
  const on = Number(onAlpha[1]);
  const off = Number(offAlpha[1]);
  if (on > off && on >= 0.5) {
    pass("on track alpha " + on + " > off " + off + " and >= 0.5");
  } else {
    fail("on track not visibly lighter (on=" + on + " off=" + off + ")");
  }
} else {
  fail("could not parse on/off track alphas");
}

has(
  /\.qt-switch:focus[\s\S]*?outline:\s*none\s*!important/,
  ".qt-switch:focus outline none",
);
has(
  /\.qt-switch:focus-visible/,
  ".qt-switch:focus-visible present",
);
has(
  /\.qt-chrome-btn:focus[\s\S]*?outline:\s*none\s*!important/,
  ".qt-chrome-btn:focus outline none",
);
has(
  /\.qt-chrome-btn:focus-visible/,
  ".qt-chrome-btn:focus-visible present",
);
has(
  /\.qt-switch:focus[\s\S]*?box-shadow:\s*none\s*!important/,
  ".qt-switch / chrome-btn focus box-shadow none",
);

has(
  /\.ytp-menuitem\.qt-cap-toggle\s+\.ytp-menuitem-icon/,
  "Dual/Color/Center icon slot selector",
);
has(
  /\.ytp-menuitem-icon[\s\S]{0,280}?width:\s*40px\s*!important/,
  "icon slot width 40px (native band 24–40)",
);
has(
  /\.ytp-menuitem-icon[\s\S]{0,280}?min-width:\s*24px\s*!important/,
  "icon slot min-width 24px",
);
has(
  /\.ytp-menuitem-icon[\s\S]{0,280}?max-width:\s*40px\s*!important/,
  "icon slot max-width 40px",
);
has(
  /\.qt-cap-toggle\s+\.ytp-menuitem-label[\s\S]{0,280}?text-align:\s*left\s*!important/,
  "caption-toggle label text-align left",
);
has(
  /\.qt-cap-toggle\s+\.ytp-menuitem-content[\s\S]{0,280}?margin-left:\s*auto\s*!important/,
  "toggle lives in .ytp-menuitem-content on the right",
);

if (/text-align:\s*center/.test(css)) {
  fail("must not push Dual/Color/Center labels to center");
} else {
  pass("no text-align:center on caption-toggle labels");
}

if (failed) {
  console.log("\n" + failed + " check(s) failed");
  process.exit(1);
}
console.log("\nall checks passed");
