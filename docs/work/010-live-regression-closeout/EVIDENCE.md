# W-010 evidence

## Status

Implementation, both disposable-host diagnostics (`/watch` and `/shorts`), and
the ordinary-profile Chrome A → B/C acceptance are green. The strict CLI gate
remains intentionally red only in disposable Chromium, where the host returns
empty timedtext even without the extension. W-010 is `implemented` because the
same scenarios produced non-zero WPM from hidden source ASR in the user's normal
Chrome profile while preserving settings and CC state.

## Reproduced failures

- Hidden ASR acquisition changed CC OFF back to ON and produced 319 timedtext
  requests in 8 seconds.
- Bare `<timedtext>` was accepted despite parsing to zero cues.
- Current YouTube language rows have no `.ytp-menuitem-content`; Dual returned
  early, did not paint checks, and its `pointerdown` interception allowed the
  native `click` to close the menu.
- Delayed host rendering left `Playback speed` visible.
- Opening the Toolkit menu while native settings was open could close both.
- At media time 5:00, changing 1.5x to 2x changed only the total:
  `3:20 / 8:46` became the inconsistent `3:20 / 6:35`.
- Miniplayer could hide both clocks; class-mode transition could later show two.
- A hidden native 100 px caption was painted at 26 px.
- `/shorts/:id` was excluded from every pace scheduler, `pageVid()` only read
  `?v=`, and player response lookup preferred the hidden 0x0 `#movie_player`.
  Therefore no pace pill or ASR could mount on the active Short. An open Toolkit
  menu also survived navigation to the next Short.
- A slow ASR response from Short A could resolve after navigation and be adopted
  by Short B because timedtext payloads had no video identity or navigation
  generation.
- `kind=asr&tlang=pt` was classified as generated source material, so a saved
  translated caption could replace `QuietTube.cues` and change WPM, Pace Lock,
  Trim, and the clock even with CC off.
- An uploaded fallback arriving before `QT_TRACKS` could prevent the later ASR
  pull because the retry path only checked whether *any* cues existed.
- Manual speed was neither persisted nor reapplied to a replacement player;
  Pace Lock's computed rate also overwrote the in-memory value that should have
  remained the user's manual speed.
- CC had no explicit persisted preference. Clicking Off while Dual was enabled
  erased `qt_captionLangs`, and choosing a single native language with Dual off
  was not remembered by the Toolkit.
- Translated Highlight/Center advanced by an even split of translated words,
  rather than mapping their cadence to the irregular original-ASR word onsets.

Each case above now has a behavioral assertion under `tests/integration/`,
`tests/browser/`, or `tests/live/`.

## Commands

```sh
cd /Users/dnl_gentile/Projects/yt-toolkit

for f in background.js lib/*.js content/*.js content_script_*.js; do
  node --check "$f" || exit 1
done

npm test
npm run test:integration # Node integration plus browser fixtures
npm run test:browser
npm run test:visual
node docs/work/004-original-track/smoke.js
node docs/work/006-toggle-paint/check.mjs
node docs/work/008-captions-overlay/check.mjs
npm run test:live
# Strict acceptance in a Chrome environment that returns timedtext:
npm run test:live:strict
git diff --check
```

## Observed results

- Unit: 62/62 passed, including the persistent manual-speed/explicit-CC
  defaults and rejection of `kind=asr&tlang=...` as generated source.
- Runtime syntax: 13/13 JavaScript entry/module files passed `node --check`;
  the final comprehensive JS/MJS syntax sweep passed 28/28.
- Integration: 7/7 Node tests passed, including Shorts pathname video identity,
  active-player ASR fetch, zero caption-selection calls, CC invariance, and a
  deferred Short A response resolved only after navigation to Short B.
- Browser fixture: 15/15 passed. In addition to Dual mouse/keyboard/ARIA,
  translated language identity, menu exclusion, clock rebase, both miniplayer
  forms, native caption sizing, ND click isolation, and active Shorts geometry,
  it now proves: explicit CC restoration in both directions; a complete
  preference snapshot across A → B; manual speed on the replacement player;
  Lock-derived rates cannot overwrite manual speed; ASR-backed translations and
  uploaded cues cannot own WPM; an uploaded fallback cannot block later ASR; and
  translated Highlight/Center cadence follows original-ASR word onsets. The
  Shorts assertion still requires one pill, 12 px top inset, exact center, zero
  control overlap, working menu, no lower clock, SPA reparenting, menu close on
  the next Short, and rejection of stale A payloads.
- Visual: 1/1 passed against the two current cluster/lower-time baselines.
- Original-track smoke: 5/5; W-006 checker: 26/26; W-008 checker: 34/34.
- Disposable YouTube diagnostic: 2/2 passed. The recorded `/watch` run kept CC
  off, hid custom captions and native Playback speed, bounded timedtext to 9
  requests, and kept Dual selection open with the available persisted slots.
  The final Shorts run attached the singleton directly to the active
  `#shorts-player`, used 8 timedtext requests (budget ≤12), preserved CC,
  injected no lower clock, and proved the pill/menu remain centered, inside the
  player, and clear of the native top controls. It then advanced with ArrowDown,
  required the URL/player to change, and proved the same singleton reparented
  while the Toolkit menu closed.
- Live Shorts geometry at 1280x800: player `508.5x904` at `(537.8,64)`, pill
  center delta `0 px`, top offset `12 px`; no `pageerror`. Advancing to the next
  Short kept the same singleton centered on the reused active player.
- The host returned only empty timedtext bodies in both headless and headed
  disposable Chromium. A no-extension control did the same, so this is an
  environment limitation, not evidence that the patch fails; it also means the
  disposable run cannot prove WPM greater than zero.
- `npm run test:live:strict` is the hard acceptance gate: unlike the diagnostic
  probe, it fails if the host leaves the cluster at 0 WPM.
- Final strict `/watch` result in this disposable environment: expected RED,
  exact label `0 WPM · 1x` and 9 bounded requests, with
  `strict live acceptance requires non-zero WPM`.
- The live harness now writes setup to both sync and local storage (local is the
  preference authority) and repeats the write after `onInstalled`, so a stale
  local value or install-time default cannot create a false-green strict run.

## Load-bearing mutations

- Reintroducing the old ASR track-selection path makes
  `tests/integration/asr-invariance.test.js` fail because CC changes OFF to ON.
- Moving the Dual listener out of capture makes the DOM test fail because the
  native click runs and closes the menu.
- Removing video generation/identity from the ASR fetch makes the deferred
  navigation test fail because Short A's cues cross into Short B.
- Treating `kind=asr&tlang=...` as generated again makes the source-authority
  browser assertion fail because translated cues take ownership.
- Preventing the ASR retry when uploaded fallback cues exist makes the fallback
  promotion assertion fail because `_cuesAreAsr` never becomes true.
- Letting an internal Lock rate persist makes the manual-speed isolation test
  fail: `qt_playbackRate` changes from the saved 1.5x instead of returning to it
  when Lock is disabled.
- Inverting the slow-speech invariant (`rate >= 150`) exited 1 with:

```text
mutant assertion: slow WPM >= 150; observed 80
EXPECTED RED: inverted slow-WPM invariant failed
```

## Real-profile gate closed

The user's normal Chrome profile was exercised in a temporary YouTube tab, then
returned to its original state:

1. Video A `jRbjdeNuIAI`: CC was set off; player/native caption classes stayed
   off while the Toolkit continued at `400 WPM · 1x`.
2. A visible recommendation was clicked through the YouTube SPA to video B
   `q-upw0HZxnQ`. After navigation: exactly one cluster, `400 WPM · 1x`, CC
   false, native/custom captions hidden.
3. B retained target 400, Pace Lock on, Trim on, Color on, Center on, Dual off,
   and Portuguese auto-generated as the available/saved source language.
4. Dual was enabled temporarily: Portuguese immediately received slot 0 while
   CC remained false. This refutes the old coupling that forced CC on.
5. A full navigation to video C `xlDL-VsGVxU` again produced one cluster at
   `400 WPM · 1x`, CC false, and the same target/Lock/Trim/Color/Center/Dual and
   Portuguese slot state.
6. Cleanup restored the user's original Dual off, Color on, Center on, and CC
   on. The original tab remained at non-zero WPM (`400 WPM · 1.66x`).

Browser security correctly blocked `chrome://extensions`; no workaround was
used. Reload was unnecessary for acceptance because the patched behavior itself
was present: Dual-on no longer changed CC, and the full preference/source-rhythm
contract survived both SPA and full navigation.
