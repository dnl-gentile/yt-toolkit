# W-004 evidence

## Change

`content/inject.js` only. MAIN-world timedtext feed now pins one original track per video.

- Original track: `kind === "asr"` from `getPlayerResponse()` / `ytInitialPlayerResponse`, else `captionTracks[0]`. Remembered as `{ languageCode, baseUrl, videoId }`.
- That track is fetched as json3 with `tlang` stripped on boot, `yt-navigate-finish`, and `QT_NEED_TRACKS`. Posted `{ type: "QT_TIMEDTEXT", lang: languageCode, original: true }`.
- Player fetch/XHR of a `tlang` or a different `lang` is still posted for dual (`original: false`). If this video has no original payload yet, the ASR is fetched.
- `lastTimedOriginal` is assigned only when `payload.original === true`. `QT_NEED_TRACKS` re-posts it first.
- `QT_TRACKS`, `QT_FETCH_TRACK`, fetch hook, and XHR hook kept.

## Commands (would fail if reverted)

```
cd /Users/dnl_gentile/Projects/yt-toolkit
node --check content/inject.js
grep -n "payload.original === true" content/inject.js
grep -n "if (lastTimedOriginal) post" content/inject.js
grep -n 'tracks.find((t) => t.kind === "asr")' content/inject.js
grep -n "lastTimed[^O]" content/inject.js ; echo "exit: no catch-all lastTimed"
node --test tests/*.test.js
```

Vm smoke (original vs zh / tlang; `QT_NEED_TRACKS` order). Run from repo root:

```
node docs/work/004-original-track/smoke.js
```

A revert to `lastTimed = any QT_TIMEDTEXT` and posting without `original` fails `payload.original === true`, the `lastTimedOriginal` re-post, and the smoke flags.

## Observed output

```
PASS: syntax

content/inject.js:14:    if (payload.type === "QT_TIMEDTEXT" && payload.original === true) {
content/inject.js:332:      if (lastTimedOriginal) post({ ...lastTimedOriginal });
content/inject.js:236:    const asr = tracks.find((t) => t.kind === "asr") || tracks[0];
exit: no catch-all lastTimed

PASS: original ASR posted original:true lang=en no tlang
PASS: zh and tlang:ar posted original:false
PASS: lastTimedOriginal not replaced by translation
PASS: QT_NEED_TRACKS re-posts original first
PASS: QT_FETCH_TRACK dual translation original:false
original fetches: [
  'https://www.youtube.com/api/timedtext?v=VIDEO1&lang=en&kind=asr&fmt=json3'
]
timedtext flags: [
  { lang: 'en', original: true, tlang: false },
  { lang: 'zh', original: false, tlang: false },
  { lang: 'tlang:ar', original: false, tlang: true },
  { lang: 'en', original: true, tlang: false },
  { lang: 'tlang:pt', original: false, tlang: true }
]

> yt-toolkit@1.6.1 test
> node --test tests/*.test.js
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

Real-host: not run in this slice (switch CC to Arabic/Chinese on a spoken English video; trim must snap back on the first spoken word).
