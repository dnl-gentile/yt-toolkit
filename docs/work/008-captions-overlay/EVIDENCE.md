# W-008 evidence — overlay follows Dual while paused; size = native; Dual lines not glued

Tier **M**. Commands below would fail if the change were reverted. Real-host Playwright against `https://www.youtube.com/watch` is still required to close the visual slice (QUALITY.md §2).

## Commands

```text
$ node --check content/captions.js
syntax: ok
```

```text
$ node docs/work/008-captions-overlay/check.mjs
PASS  tick has no v.paused early-return
PASS  qt_captionLangs path busts dataset.sig
PASS  lang change busts sig then tick() immediately (paused-safe)
PASS  uses YtToolkitDual
PASS  slot identity via Dual.uniqueLangs
PASS  slot identity via Dual.langBase
PASS  requestLang(langs[1]) fires whenever a second slot is set
PASS  requestLang is not gated on play
PASS  one captionFontPx function
PASS  copies visible .ytp-caption-segment
PASS  native copy requires fontSize >= 16
PASS  fallback player.clientHeight * 0.04
PASS  fallback clamp 18–40
PASS  no 22px/24px Center-word cap
PASS  Dual stack gap ~48px
PASS  primary above native-caption area
PASS  zero qt_captionPos / new video resets to defaults
PASS  CC Off or no Dual/highlight/center → hide
PASS  Dual off + highlight off + center off → wantPaint false
PASS  no MutationObserver
PASS  no document.body (no body observer)
PASS  does not rewrite native caption DOM
PASS  en ≡ tlang:en cannot occupy both slots
PASS  langBase(tlang:en) === en
PASS  langBase(en-US) === en
PASS  400px player → clamp 18 (not 16)
PASS  640px player → 26
PASS  1200px player → clamp 40
PASS  640px is above the old 24px RSVP cap
all checks passed
```

```text
$ grep -nE "v\.paused|MutationObserver|document\.body" content/captions.js || echo "no paused/observer/body"
no paused/observer/body
```

```text
$ npm test && npm run test:integration
ℹ tests 38  pass 38
ℹ tests 2   pass 2
```

## Mutation (load-bearing)

Re-introduced `if (v.paused) return;` in `tick`, re-ran the checker, restored:

```text
FAIL  tick has no v.paused early-return
1 check(s) failed
mutated-exit 1
```

Re-introduced `Math.min(..., 24)` on overlay `fontSize`, re-ran, restored:

```text
FAIL  no 22px/24px Center-word cap
1 check(s) failed
mutated-exit 1
```

Restored source matches the unmutated file (`no paused/24px leftovers`).

## Behaviors implemented (`content/captions.js`)

- `tick` uses `v.currentTime` with no `v.paused` gate. Interval already runs while paused.
- `qt_captionLangs` (and Dual / highlight / center / bg) sets `redraw`, `bustCap()`, then `tick()` immediately so a paused language switch paints at the current word.
- Slot identity is `YtToolkitDual.uniqueLangs` / `langBase`. `en` ≡ `tlang:en` cannot fill both slots; `pickCues` / `requestLang` match on base language.
- `requestLang(langs[1])` runs whenever Dual has two slots, including while paused. `qt-cues` busts sig and ticks when the translation arrives.
- `captionFontPx()`: visible `.ytp-caption-segment` with `fontSize >= 16`, else `player.clientHeight * 0.04` clamped 18–40. Dual and Center word get the same `px` in one tick.
- Default stack: primary `bottom` 80px, secondary `80 + primaryHeight + 48`. Inline `bottom` is `!important` so CSS `.qt-cap-s.qt-rsvp` cannot glue Center strips. Zero `qt_captionPos` (and `yt-navigate-finish`) resets drag offsets.
- `!ccEnabled()` or Dual off + highlight off + center off → `hideOurs()` (native captions). No `MutationObserver`. Native caption DOM is not rewritten.

## Not closed

Live proof still needed: pause a spoken video, switch Dual slot 2 (e.g. Portuguese + Auto-translate English) and see the overlay redraw without play; Center word Dual strips stacked with a visible gap at native-equivalent font size; CC Off hides `#qt-cap-p` / `#qt-cap-s`.
