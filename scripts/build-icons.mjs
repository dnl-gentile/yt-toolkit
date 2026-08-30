/*
 * Render icons/src/icon.svg to the PNG sizes the manifest declares.
 *
 * Copyright (C) 2025  Daniel Gentile
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Each size is rasterised from the vector at its own native resolution — never
 * downscaled from the 128. The previous PNGs were bitmap composites carrying a
 * ghost of the old circle-with-slash icon, and they blurred because the larger
 * sizes had been upscaled from a smaller one.
 *
 * Usage: npm run icons
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'icons', 'src', 'icon.svg');
const SIZES = [16, 48, 128];

const svg = fs.readFileSync(SRC, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const size of SIZES) {
  // Transparent background, exact viewport, no page margins.
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const out = path.join(ROOT, 'icons', `icon${size}.png`);
  await page.screenshot({ path: out, omitBackground: true });
  console.log(`icons/icon${size}.png`);
}

await browser.close();
