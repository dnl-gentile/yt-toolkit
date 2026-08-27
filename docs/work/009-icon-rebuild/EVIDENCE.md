# W-009 evidence

## The defect

`icons/icon{16,48,128}.png` were bitmap composites: a wrench pasted over the old
circle-with-slash icon without removing it. Upscaled 4x, the leftovers are plain — faint
dotted arcs and a rounded-rect outline sitting behind the glyph — and the edges are soft,
because the larger sizes had been enlarged from a smaller bitmap rather than drawn.

They are now rendered from `icons/src/icon.svg`, each size rasterised at its own native
resolution.

## 1. A check that rejects the old icons

The first version of `check-icons.mjs` tried to spot the ghost by colour. **It passed the
broken icons**, because the ghost pixels are pink blends of red and white — arithmetically
indistinguishable from ordinary antialiasing:

```
$ npm run icons:check          # old icons, colour-heuristic version
PASS   16px  tile 16x12  glyph 8x8 (7.1%)  centred  no ghost
PASS   48px  tile 48x34  glyph 22x22 (10.3%)  centred  no ghost
PASS  128px  tile 128x90  glyph 62x62 (12.5%)  centred  no ghost
icons ok
```

So the heuristic was replaced with an exact invariant: **every PNG must match a fresh
render of the vector, pixel for pixel.** A hand-edited, stale or composited file cannot
survive that, whatever the artifact looks like. Against the old icons:

```
$ npm run icons:check          # old icons, current version
FAIL   16px  250/256 px differ from a fresh render of icon.svg (worst channel 255)
FAIL   48px  1999/2304 px differ from a fresh render of icon.svg (worst channel 255)
FAIL  128px  13314/16384 px differ from a fresh render of icon.svg (worst channel 255)

3 size(s) failed.
```

Against the current icons:

```
$ npm run icons:check
PASS   16px  matches icon.svg exactly  tile 16x16  glyph 8x8 (9.4%)
PASS   48px  matches icon.svg exactly  tile 46x46  glyph 26x26 (12.4%)
PASS  128px  matches icon.svg exactly  tile 120x120  glyph 71x71 (13.1%)

icons ok
```

## 2. The 16px failure caught during authoring

The first vector revision reproduced YouTube's 28:20 play-button badge. It looked correct
at 128px. Measured at 16px, the wasted vertical space left the wrench **5x4 pixels**,
3.8% of the tile — unreadable in the Chrome toolbar, and invisible in a 128px review:

```
128px  badge 116x84  wrench 49x48  white 9.0%
 48px  badge 44x32   wrench 18x18  white 8.0%
 16px  badge 16x12   wrench  5x4   white 3.8%
```

A square tile — which is also what SPEC §1 says, "red YouTube square" — fixed it:

```
128px  tile 120x120  glyph 71x70  13.1%
 48px  tile  46x46   glyph 26x26  12.4%
 16px  tile  16x16   glyph  8x8    9.4%
```

`MIN_GLYPH_SHARE` (6%) and `MIN_GLYPH_PX` (6) in `check-icons.mjs` are the floors that
keep a future revision from repeating this.

## 3. Visual

`docs/media/icons.png` — 128, 48 and 16 as shipped, with 16 also at 4x.

## 4. Suites unaffected

```
$ npm test
ℹ pass 35
ℹ fail 0

$ npm run test:integration
ℹ pass 13
ℹ fail 0
```


## 5. Artwork revisions, and what each was wrong about

Recorded because three of the four were caught by the maintainer, not by me, and
the reasons generalise.

| Attempt | Wrong because |
|---|---|
| Rounded rect badge, filled wrench | The badge is not a rounded rectangle. Its sides bulge; the curvature is continuous. `rx` cannot express it |
| Square tile, filled wrench | Traded the YouTube identity for 16px legibility. The trade was never necessary — Chrome accepts different artwork per size |
| Official badge, filled wrench | The filled glyph is a solid slab that loses the wrench silhouette |
| Official badge, outlined wrench | Dissolved at 16px. Its strokes are half a pixel there, measuring 9% of the badge height |

The shipped artwork is the official badge path with Material Symbols Rounded
`home_repair_service` — a toolbox, whose compact horizontal mass shares the
badge's proportion and therefore survives 16px:

```
$ npm run icons:check
PASS   16px  matches icon.svg exactly  tile 16x10  glyph 8x5 (50% of badge height)
PASS   48px  matches icon.svg exactly  tile 44x32  glyph 22x18 (56% of badge height)
PASS  128px  matches icon.svg exactly  tile 116x82  glyph 62x48 (59% of badge height)

icons ok
```

### On the legibility floor

It is set at 35%, which is loose. It was briefly set at 60%, where it failed the
shipped design at 59% — a number I had picked before choosing the glyph. Neither
squeezing the artwork to satisfy an invented threshold nor lowering it until it
passed while still implying it tests proportion would have been honest.

So it is now scoped to what it can actually detect: a glyph that has *dissolved*
(the outlined wrench measured 9%). Whether 56% or 62% is better proportioned is
a judgement call, and it lives in `icons/src/icon.svg` where it can be argued
with, rather than smuggled in as a threshold that looks objective.
