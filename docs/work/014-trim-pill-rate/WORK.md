# W-014 — trim boost on the pace pill

Points at `docs/SPEC.md` supersession 2026-08-26 (trim boost is visible on the
pace pill) and §4 / §6:

- Pill `{rate}x` is the live transport rate, including Trim 4×/8×
- On the first spoken word it snaps back to the saved manual speed or the live
  Pace Lock rate
- Adjusted clock never uses the trim boost
- Shorts still show only `{target} WPM` with effective Pace Lock, otherwise
  only `{rate}x`

## Payload

`content/pace.js` `pillRate()`: when `QT._trimBoost` is set, return the actual
`video.playbackRate` (4 or 8). Do not substitute `_userRate`. Check trim
before the Pace Lock branch so a silence with Lock on also shows 8×.

`clockRate()` is not changed.

`pillText()` already implements the Shorts one-metric rule from the live rate
argument, so Shorts without Lock show `8x` and Shorts with Lock stay WPM-only.
