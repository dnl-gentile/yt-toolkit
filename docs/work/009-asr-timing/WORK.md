# W-009 — always time from auto-generated captions

Points at `docs/SPEC.md` §5.8 and the 2026-08-20 generated-caption supersession.

## Defect

Uploaded captions (kind empty, vssId `.en`) share `lang=en` with ASR (`a.en`).
The first payload or a later same-span adopt replaced `QT.cues` with line-level
cues. Word highlight then even-split the line; lock/trim saw coarse onsets.

Auto-generated json3 has `segs[].tOffsetMs` per word. That is the clock.

## Change

1. `identifyOriginal` / `trackIsAsr`: ASR first, never `tracks[0]` when ASR exists.
2. `isOriginalPayload`: if original is ASR, only `kind=asr`/`caps=asr` is original.
3. `adoptOriginalCues(cues, fromAsr)`: ASR always wins; uploaded cannot overwrite.
4. `pickCues` for the spoken language returns `QT.cues` (ASR).
5. `wordIndexAt` uses timestamps when they span the cue; even split only for `tlang`.
