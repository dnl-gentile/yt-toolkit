/*
 * Verify the rendered card icons.
 *
 * Copyright (C) 2025  Daniel Gentile
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Two assertions, each for a way the previous icon set failed.
 *
 * 1. EVERY PNG IS A FAITHFUL RENDER OF icons/src/icon.svg.
 *
 *    The set this replaced was a bitmap composite: a wrench pasted over the old
 *    circle-with-slash icon without removing it, leaving a ghost of dotted arcs
 *    behind the glyph. An earlier version of this script tried to spot that by
 *    colour, and passed the broken icons — the ghost pixels are pink blends of
 *    red and white, indistinguishable from ordinary antialiasing.
 *
 *    So the check is exact instead of heuristic: re-render the vector and
 *    compare pixel for pixel. A hand-edited, stale, or composited PNG cannot
 *    survive that, whatever the artifact happens to look like.
 *
 * 2. THE GLYPH IS BIG ENOUGH TO READ AT EVERY SIZE.
 *
 *    A design reviewed only at 128px can be illegible at 16px, which is the
 *    size Chrome actually puts in the toolbar. This catches that at author
 *    time rather than after the store listing is live.
 *
 * Usage: npm run icons:check
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'icons', 'src', 'icon.svg');
const SIZES = [16, 48, 128];

/**
 * Legibility floor, expressed as geometry rather than ink.
 *
 * An earlier version measured the glyph's share of coloured pixels. That is the
 * wrong metric for an outlined glyph — its hollow interior is tile colour, so a
 * legible glyph scores as low as an illegible one. The bounding box is what
 * actually tracks whether you can see the thing.
 *
 * This floor is deliberately loose. It exists to catch a glyph that has
 * DISSOLVED — the outlined wrench tried here measured 9% at 16px, because its
 * strokes are half a pixel at that size — not to adjudicate whether 56% or 62%
 * is better proportioned. That is a judgement call, and it is recorded in
 * icons/src/icon.svg where it can be argued with, rather than smuggled in as a
 * threshold that looks objective.
 */
const MIN_GLYPH_VS_BADGE_HEIGHT = 0.35;
const MIN_GLYPH_PX = 4;

/** Per-channel tolerance, to absorb encoder noise rather than design drift. */
const CHANNEL_TOLERANCE = 2;

const svg = fs.readFileSync(SRC, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
let failures = 0;

/** Pixels of a PNG file, via the browser's own decoder. */
async function pixelsOfFile(file, size) {
  const data = fs.readFileSync(file).toString('base64');
  await page.setViewportSize({ width: size + 20, height: size + 20 });
  await page.setContent(`<img id="i" src="data:image/png;base64,${data}">`);
  await page.waitForFunction(() => document.getElementById('i').complete);
  return page.evaluate((size) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.drawImage(document.getElementById('i'), 0, 0);
    return Array.from(g.getImageData(0, 0, size, size).data);
  }, size);
}

/** Pixels of a fresh render of the vector, at the same size. */
async function pixelsOfSvg(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const shot = await page.screenshot({ omitBackground: true });
  const b64 = shot.toString('base64');
  await page.setViewportSize({ width: size + 20, height: size + 20 });
  await page.setContent(`<img id="i" src="data:image/png;base64,${b64}">`);
  await page.waitForFunction(() => document.getElementById('i').complete);
  return page.evaluate((size) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.drawImage(document.getElementById('i'), 0, 0);
    return Array.from(g.getImageData(0, 0, size, size).data);
  }, size);
}

/** Glyph and tile geometry, for the legibility assertion. */
function geometry(px, size) {
  const box = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 });
  const add = (b, x, y) => {
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.n += 1;
  };
  const white = box();
  const red = box();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [R, G, B, A] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
      if (A < 40) continue;
      if (R > 200 && G > 200 && B > 200) add(white, x, y);
      else if (R > 150 && G < 90 && B < 90) add(red, x, y);
    }
  }

  const mid = (b) => ({ w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
  return { glyph: mid(white), tile: mid(red) };
}

for (const size of SIZES) {
  const file = path.join(ROOT, 'icons', `icon${size}.png`);
  const problems = [];

  if (!fs.existsSync(file)) {
    console.log(`FAIL  icon${size}.png missing — run npm run icons`);
    failures += 1;
    continue;
  }

  const actual = await pixelsOfFile(file, size);
  const expected = await pixelsOfSvg(size);

  let differing = 0;
  let worst = 0;
  for (let i = 0; i < expected.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(actual[i + c] - expected[i + c]));
    if (d > CHANNEL_TOLERANCE) differing += 1;
    worst = Math.max(worst, d);
  }
  if (differing > 0) {
    problems.push(
      `${differing}/${size * size} px differ from a fresh render of icon.svg (worst channel ${worst}) — ` +
      `the PNG was hand-edited or is stale; run npm run icons`,
    );
  }

  const g = geometry(actual, size);
  const vsBadge = g.glyph.h / g.tile.h;
  if (vsBadge < MIN_GLYPH_VS_BADGE_HEIGHT) {
    problems.push(
      `glyph is ${(vsBadge * 100).toFixed(0)}% of the badge height, floor is ${MIN_GLYPH_VS_BADGE_HEIGHT * 100}%`,
    );
  }
  if (g.glyph.w < MIN_GLYPH_PX || g.glyph.h < MIN_GLYPH_PX) {
    problems.push(`glyph is ${g.glyph.w}x${g.glyph.h}px — too small to read at ${size}px`);
  }

  if (problems.length) {
    failures += 1;
    console.log(`FAIL  ${String(size).padStart(3)}px  ${problems.join('; ')}`);
  } else {
    console.log(
      `PASS  ${String(size).padStart(3)}px  matches icon.svg exactly  tile ${g.tile.w}x${g.tile.h}` +
      `  glyph ${g.glyph.w}x${g.glyph.h} (${(vsBadge * 100).toFixed(0)}% of badge height)`,
    );
  }
}

await browser.close();

if (failures) {
  console.log(`\n${failures} size(s) failed.`);
  process.exit(1);
}
console.log('\nicons ok');
