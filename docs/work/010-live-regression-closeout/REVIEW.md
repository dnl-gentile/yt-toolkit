# W-010 independent review

Date: 2026-08-20  
Tier: L (refutation review required)

## Refutation targets

Two read-only audits attacked the implementation from separate boundaries:

1. **Source authority:** prove that displayed translation/uploaded captions
   cannot become the WPM/Lock/Trim/clock source, including when CC is off and a
   translated language is restored on the next video.
2. **Preference continuity:** prove that A → B preserves the user's explicit CC,
   language(s), Dual/Color/Center, manual speed, target/Lock, and Trim, without
   persisting per-video ASR, computed Lock rate, or Trim boost.

## Findings and disposition

- **Confirmed, fixed:** `kind=asr&tlang=...` was treated as source ASR. URL
  provenance now rejects every `tlang`; a browser regression keeps source cues
  pinned while translated and uploaded payloads arrive.
- **Confirmed, fixed:** uploaded fallback cues could suppress a later ASR pull.
  Retry/adoption now keys on `_cuesAreAsr`, with a fallback-before-track-list
  regression.
- **Confirmed, fixed:** manual speed was not a preference and Lock rates could
  overwrite it. `qt_playbackRate` now stores only user/unlocked changes and is
  reapplied to replacement players; Lock/Trim remain ephemeral.
- **Confirmed, fixed:** CC was not explicit state; Off erased languages; Dual-off
  language selection was not stored. CC and language persistence are now
  independent and restoration uses the native CC button without selecting a
  track for harvesting.
- **Confirmed, fixed:** translated Highlight/Center used an even word split. The
  visible translated words now map their progress to source-ASR onsets.
- **Confirmed, fixed:** navigation could briefly retain old `_want`/Trim state.
  Navigation clears per-video timing state and reapplies the saved manual rate.
- **Coverage gap closed:** the live harness formerly initialized sync storage
  only even though local wins, and install defaults could race setup. It now
  initializes both areas twice around the install window.

## Acceptance disposition

The disposable YouTube host still returns HTTP 200 timedtext bodies with zero
cues, including in the no-extension control. `npm run test:live:strict`
therefore correctly remains red at `0 WPM · 1x`; that environment cannot prove
source-ASR availability.

The missing proof was closed independently in the user's ordinary Chrome
profile: A → B SPA and B → C full navigation kept CC off, produced non-zero
`400 WPM`, retained one cluster and all inspected caption/pace/trim preferences,
and kept Dual-on from changing CC. The original CC/Dual state was restored.
This is sufficient to mark W-010 `implemented` while retaining the disposable
strict failure as an explicit environment limitation rather than a false green.
