# W-001 evidence

## Command

```
node --test tests/*.test.js
```

## Observed (2026-08-20)

```
ℹ tests 24
ℹ pass 24
ℹ fail 0
```

Load-bearing cases:

- 10 words over 8s json3 cue are spread across ~8s, not `n * 0.28s`
- Rolling ASR windows collapse to unique words
- `tlang:zh` is rejected as original track
- Slow ~80 WPM speech measures below 110, never ≥150
- Silence/pause → local WPM 0
- 100 WPM speech + 200 target → 2×
- `trimBoost` is 4 in a ≥1.2s gap and **0 on the first spoken word after it**
- Adjusted clock ignores a 8× playbackRate (trim boost)

## Mutation

Inverting `rate < 150` in `tests/wpm.test.js` (“slow 80 WPM must not read as ≥150”) would fail the suite. The assertion is the guard against the v1.5.24 `n × 0.28s` floor.

## Follow-up in pace.js (same session, after engine green)

- `QT.cues` only updates for `isOriginalTrack` / `original: true`
- `tick()` uses `WPM.trimBoost`; when it returns 0, rate snaps to lock in the same tick
- Overlay moved to top-center (`styles-overlay.css`); native bottom clock restored
