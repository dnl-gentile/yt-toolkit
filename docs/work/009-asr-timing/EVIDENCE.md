# W-009 evidence

## Commands (fail if reverted)

```
cd /Users/dnl_gentile/Projects/yt-toolkit
node --check lib/timedtext.js content/inject.js content/pace.js content/captions.js
node --test tests/*.test.js
node docs/work/004-original-track/smoke.js
```

A revert that treats uploaded `lang=en` as original while ASR exists fails:

- `isOriginalTrack(..., { requireAsr: true })` → false
- smoke: uploaded listed first, original URL still `kind=asr`, uploaded fetch `original:false`
- `wordIndexAt` at t=2.0 on stamps 0.1/0.3/2.5 → index 1, not even-split 2

## Observed output

```
ℹ tests 51
ℹ pass 51
ℹ fail 0

PASS: original ASR posted original:true lang=en no tlang
PASS: zh and tlang:ar posted original:false
PASS: lastTimedOriginal not replaced by translation
PASS: QT_NEED_TRACKS re-posts original first
PASS: QT_FETCH_TRACK dual translation original:false
```

Smoke fixture lists uploaded English before ASR. Original payload URL still has `kind=asr`.

## Mutation (Article II)

Inverted `tests/wpm.test.js` slow-speech `rate < 150` → `rate >= 150`. Suite went red:

```
✖ measures ~80 WPM slow speech (must NOT read as ≥150)
  AssertionError [ERR_ASSERTION]: MUTATION: inverted slow-speech invariant
ℹ fail 1
```

Assertion restored to `rate < 150`.

## Real-host

Not run in this slice. Close YouTube tabs (including miniplayer), reload unpacked, confirm highlight and × follow auto-generated word times on a video that also has uploaded captions.
