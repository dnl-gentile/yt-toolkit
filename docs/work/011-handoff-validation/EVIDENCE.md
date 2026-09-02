# W-011 — evidence

Commands and observed output. Nothing here is paraphrased from memory; each
block is the output of a command that fails if the change is reverted.

Base: branch `main`, HEAD `c1fe446`, working tree deliberately dirty.
A recoverable snapshot of the entry state (tracked diff, untracked tarball and
a full file copy) was taken before any edit.

## 1. Entry baseline, before any edit

    $ while IFS= read -r f; do node --check "$f" || exit 1; done < <(find . -path ./node_modules -prune -o \( -name '*.js' -o -name '*.mjs' \) -print)
    syntax checked: 50 files, fail=0

    $ npm test
    ℹ tests 62 / pass 62 / fail 0

    $ node --test tests/integration/*.test.js
    ℹ tests 7 / pass 7 / fail 0

    $ npm run test:browser
    1 failed
      [browser] tests/browser/ui-interactions.spec.js:489
      an uploaded fallback cannot block a later ASR pull
      Expected: "real asr"   Received: "uploaded fallback"
    14 passed

    $ npm run test:visual
    1 passed

    $ git diff --check
    (clean)

The handoff claimed browser 15/15 from an earlier round. On the tree as
handed over it is 14/15: the late provenance edits regressed it.

## 2. P0 — an uploaded fallback permanently blocked a late ASR promotion

`content/inject.js` `identifyOriginal()` returned early whenever an
`originalTrack` already existed for the video, so a track picked before
YouTube published the auto-generated one was never upgraded. `hasPostedOriginal()`
then reported "done" for the uploaded payload, so no later tick re-fetched.

Reproduced over the real transport (inject.js as fetcher, not the removed
`bgPull`) in `tests/browser/asr-provenance.spec.js`:

    $ npx playwright test tests/browser/asr-provenance.spec.js --project=browser
    2 failed
      an uploaded original is replaced when the ASR track appears late
      a video with no ASR track keeps the timedtext fetch budget bounded
    1 passed

After the fix (upgrade branch in `identifyOriginal`, provenance-aware
`hasPostedOriginal`):

    3 passed (11.8s)

## 3. P0 — QT_TRACKS <-> QT_NEED_TRACKS feedback loop (fetch storm)

`inject.js` announces `QT_TRACKS` on a 3 s interval and again from its
`QT_NEED_TRACKS` handler. `pace.js` answered *every* announcement with
`QT_NEED_TRACKS` whenever `_cuesAreAsr` was false. With no ASR track the pair
has no fixpoint. Measured on a fixture whose fetch stub resolves immediately
(counts are page fetches plus posted messages):

    before:
      t=1000ms fetches=32771  QT_TRACKS=61051   QT_TIMEDTEXT=61051   QT_NEED_TRACKS=32770
      t=3000ms fetches=262179 QT_TRACKS=381582  QT_TIMEDTEXT=381580  QT_NEED_TRACKS=262178

    after:
      t=1000ms fetches=2 QT_TRACKS=3 QT_TIMEDTEXT=4 QT_NEED_TRACKS=2
      t=3000ms fetches=2 QT_TRACKS=4 QT_TIMEDTEXT=4 QT_NEED_TRACKS=2
      t=5000ms fetches=2 QT_TRACKS=4 QT_TIMEDTEXT=4 QT_NEED_TRACKS=2

Flat from 1 s to 5 s: a fixpoint, not a slower loop. This is the same
signature as the "319 timedtext requests in 8 seconds" recorded in W-010 and
the Shorts budget flake (22 requests against a budget of 12) in the handoff.

Fix: `pace.js` asks at most once per distinct tracklist signature per video
(`QT._tracksAskSig`), and `inject.js` rate-limits the forced re-fetch
(`needTracksForceAt`) and no longer double-posts `QT_TRACKS`.

## 4. Second fetch authority removed

`pace.js` `bgPull()` was dead code (defined, never called) that fetched
timedtext through the service worker. Two authorities are why the live probe's
page-level request count could not see the real total. It was deleted, and a
guard was added to `tests/integration/asr-invariance.test.js`:

    ✔ only the MAIN world inject fetches timedtext

Mutation check (QUALITY.md §5) — re-add a `QT_FETCH` sender to pace.js:

    ✖ only the MAIN world inject fetches timedtext
    ℹ pass 3 / fail 1
    (restored)  ℹ pass 4 / fail 0

## 5. P0 — no original ASR: degrade, do not invent

Implemented per HANDOFF §2 and recorded as a dated supersession in
`docs/SPEC.md` (2026-08-23), as AGENTS.md requires when a session decision
narrows product law. `QT.state.*` stays the persisted preference;
`lockOn()` / `trimOn()` / `highlightOn()` / `centerOn()` gate behavior.

    $ npx playwright test tests/browser/no-asr-mode.spec.js --project=browser
    6 passed

Covering: manual speed still applies; Lock/Trim do not move the rate; saved
preferences are not erased; disabled rows carry the tooltip and refuse
activation; a late ASR track re-arms Lock and Trim without touching CC; with
ASR present the controls are live.

Mutation check — drop the `&& asrRhythm()` from `lockOn()`/`trimOn()`:

    3 failed / 3 passed
    (restored)  6 passed

## 6. Dual Subtitles

`tests/browser/dual-subtitles.spec.js` — 7 passed, including the full
acquisition chain (captions.js `requestLang` -> `QT_FETCH_TRACK` ->
inject.js fetch -> `QT_TIMEDTEXT` -> `cuesByLang` -> two painted lines) and
geometry assertions (both lines connected, visible, different text, zero
vertical overlap) in normal, Color highlight and Center word.

Status is **not** "closed". What is proven is that the renderer stacks two
lines whenever two usable cue buffers exist, and that the acquisition chain
works against a stub host. The user's report ("two checks, one line") is
therefore upstream of the renderer. See the open item in section 8.

## 7. Live / real host

    $ npm run test:live
    [probe] cluster after hidden ASR acquisition: 0 WPM  ·  1x
    [probe] host returned only empty timedtext bodies; CC invariant and
            request budget still enforced (1 requests)
    ✓ loads unpacked extension and #qt-cluster on a watch URL (18.7s)
    [probe] Shorts host returned only empty timedtext bodies; geometry,
            CC invariant and request budget passed (3 requests)
    ✓ pins the Toolkit cluster in the active Shorts top-center lane (12.9s)
    2 passed (37.9s)

Watch used 1 request and Shorts 3, against a budget of 12. The disposable
Chromium still receives HTTP 200 with empty bodies, so WPM is 0 there; that is
the known host limitation recorded in the handoff, not a product result.

## 9. P1 — caption menu flicker and self-inflicted mutation storm

Both halves of the recorded reproduction were reproduced first, in
`tests/browser/menu-flicker.spec.js`, sampling every animation frame:

    before:
      peak [data-qt-cap] nodes during a delayed Auto-translate transition: 3
      self-inflicted MutationRecords in 2 s with an idle host:            120

    after:
      peak [data-qt-cap] nodes during the same transition:                0
      self-inflicted MutationRecords in 2 s with an idle host:            0

Root causes, both in `content/yt-menu-patch.js`:

1. `restoreNativeLangRow()` and `paintLangChecks()` called `classList.remove()`
   / `classList.add()` unconditionally on every native row on every pass.
   Those calls re-serialise the `class` attribute even when the token set does
   not change, and `class` was in the observer's `attributeFilter`, so each
   pass fed the observer its own writes and scheduled the next pass. Fixed
   with `setClass` / `setAttr` helpers that test before writing, by dropping
   `class` from the filter, and by ignoring records whose target is one of our
   own nodes (`isHostMutation`).
2. YouTube reuses one panel for Subtitles/CC and Auto-translate, swapping the
   rows before renaming the title, and `characterData` was not observed, so
   the in-place rename was invisible. Injection and removal now wait for a
   panel to hold one identity (kind + title + row labels) for
   `STABLE_MS = 160`; any change restarts the window. `hideSpeed` stays
   immediate, because the native Playback speed row may not show even for a
   frame.

Mutation check — remove the `syncCaptionToggles(menu)` call:

    2 failed / 3 passed
    (restored)  5 passed

## 10. Findings from the adversarial review pass

A four-lens read-only review ran over the tree. Three of its findings
described the pre-session code and were already fixed here (the deleted
`bgPull`, the `identifyOriginal` pin, the missing `QT_NEED_TRACKS` cooldown).
One more was refuted against the current source: the ratechange "fightback"
no longer pins to 1x without ASR, because it now reads `lockOn()`; the
"manual speed still applies without ASR" test covers it.

Three were real and are fixed:

- **Reused toggle rows never re-synced.** `injectCaptionsToggles()` returns as
  soon as a `[data-qt-cap]` row exists, so a row kept the value it was built
  with. A preference changed in another tab left the row stale and the next
  click wrote the stale value back; a row built while no ASR existed stayed
  disabled after the auto-generated track arrived. Now `syncCaptionToggles()`
  re-applies the live preference and the ASR state on every pass, the click
  reads the stored value rather than the DOM, and a `qt-cues` listener
  repaints the open menu.
- **captions.js asked on every frame.** `requestLang()` posted
  `QT_NEED_TRACKS` unthrottled while the track list was empty — at the ~7 Hz
  overlay tick — and retried an unresolvable language every 3 s forever. The
  resulting *fetches* were already bounded by the `needTracksForceAt` cooldown
  added earlier in this session, so this was not a second request storm; what
  it did cost was a player-response re-parse per frame. Now throttled to
  2.5 s, with geometric backoff per language (3 s to 60 s) that resets when the
  language resolves, and both cleared on navigation. Bounded to <= 3 asks per
  3 s of ticking by test.
- **The pill invented a number.** Without a rhythm source it printed either
  `0 WPM` (which SPEC section 4 reserves for a real pause) or, with Lock on,
  the Lock target as though it were a measurement. It now prints the em-dash
  marker plus the manual speed. `docs/SPEC.md` and `docs/QUALITY.md` section 2
  were updated, along with the two `/^\d+ WPM/` assertions that encoded the
  old state.

## 11. Confirmed but NOT fixed — adjusted clock over-credits trimmed silence

`lib/wpm.js` `silenceCut()` charges every trimmable gap as **fully removed**,
but `trimBoost()` accelerates gaps to 4x/8x and SPEC section 5.6 forbids
seeking. A gap therefore costs `gap/4` or `gap/8` of real time, not zero.
Measured on a 57 min video whose ASR ends at 5 min:

    duration              : 3420.0 s
    ASR ends at           :  299.5 s
    silenceCut removed    : 3120.3 s
    adjusted (current)    :  299.8 s  ->   5.0 min
    tail played at 8x     :  390.1 s
    realistic adjusted    :  689.6 s  ->  11.5 min

A 2.3x underestimate. This is pre-existing, sits in tier-L WPM/clock math, and
reconciling it means choosing between two models — SPEC section 6 currently
defines the adjusted total as `(duration - trimmed silence) / lockRate`. Not
changed here: it is outside the priorities named for this session and the
model is the user's call. Recommended next step is to charge each gap at its
actual boost divisor and update SPEC section 6 in the same change.

## 7b. Live / real host — three consecutive runs on the final tree

    $ npm run test:live   (x3, sequential)

    ===== LIVE RUN 1 =====
    [probe] cluster after hidden ASR acquisition: — WPM  ·  1x
    [probe] host returned only empty timedtext bodies; CC invariant and
            request budget still enforced (5 requests)
    [probe] Shorts host returned only empty timedtext bodies; geometry,
            CC invariant and request budget passed (4 requests)
    2 passed (21.6s)   EXIT=0

    ===== LIVE RUN 2 =====   watch 5 requests, Shorts 4 requests
    2 passed (19.6s)   EXIT=0

    ===== LIVE RUN 3 =====   watch 5 requests, Shorts 8 requests
    2 passed (20.8s)   EXIT=0

Three consecutive green runs, no flake. Every run stayed well inside the
budget of 12; the Shorts overrun recorded in the handoff (22 against 12) did
not recur. The pill reads the em-dash marker rather than `0 WPM`, which is the
correct state for a host that returns empty timedtext bodies.

`PW_CHANNEL=chrome` was also attempted, to get closer to a real-profile run:

    [probe] extension /Users/dnl_gentile/Projects/yt-toolkit service worker: none
    1 failed

Installed Google Chrome no longer starts the unpacked extension via
`--load-extension` on this machine, so that path cannot stand in for the
normal-profile check. The bundled Chromium runs above are unaffected.

## 12. Two findings from the tree-pinned review pass (both fixed)

A second adversarial review pass surfaced two defects that survived
refutation, each independently reproduced by the verifier:

- **`content/inject.js` — stale boot-retry timers.** The `yt-navigate-finish`
  reset branch scheduled an uncancelled, ungenerationed
  `setTimeout(() => sendTracks(true), 400)`. N navigations inside that window
  left N live timers, all firing against whichever video was current when they
  landed. `forceFetch` skips the `hasPostedOriginal()` guard and a successful
  pull leaves the backoff cleared, so each stale timer re-downloaded a track
  already fetched, posted and adopted — and each redundant payload re-entered
  `adoptOriginalCues()`, which clears `_tw`, `_baseWpm`, `_smoothWpm`,
  `_dispCur` and `_durKey` even for byte-identical cues, resetting the
  smoothed-WPM state Pace Lock derives its rate from. Now one pending timer,
  cleared on the next navigation and guarded by generation and video id.

      six Shorts advances 50 ms apart, fetches for the final Short:
        before: 7        after: <= 2 (measured 1)

  The existing suites could not see it: the integration harness stubs
  `setTimeout` to run synchronously, so a stale timer cannot exist there.

- **`content/captions.js` — a termination condition that could never be met.**
  `requestLang`'s `have` check required an exact tlang/non-tlang key match,
  but the auto-translate fallback in the same function stores its result under
  `tlang:<code>`. A display language with no dedicated track on the current
  video therefore never registered as acquired and was re-requested for the
  life of the page. `have` now accepts a translated bag entry for a bare
  token when the video publishes no dedicated track for that language — never
  for the original language, where a translation must not stand in for the ASR
  source.

Three further findings from the first pass described the committed HEAD rather
than the working tree: that run's agents inherited the clean worktree
checkout at `.claude/worktrees/` as their working directory, so relative reads
returned pre-session code. The second pass was pinned to an absolute path with
a tree-identity assertion.

## 13. Tree-pinned review — five confirmed findings, all fixed

The second review pass was pinned to the canonical path with a tree-identity
assertion. Ten findings were filed, five survived adversarial refutation, each
with an independent reproduction. Two were regressions in this session's own
no-ASR work:

- **`content/pace.js` — no repaint on ASR to no-ASR navigation.**
  `adoptOriginalCues` repaints on the false-to-true transition, but nothing
  repainted true-to-false. Navigating from a video with ASR to one without
  left Pace lock and Trim silence rendered enabled; clicking one passed the
  `aria-disabled` guard and wrote the persisted preference the contract
  protects. `yt-navigate-finish` now calls `renderMenu()` and
  `renderCluster()`.
- **`content/pace.js` — `renderMenu()` chose its body from the persisted
  `st.paceLock` rather than `lockOn()`.** On a no-ASR video with the default
  Pace lock on, the menu rendered the Lock body: a WPM slider that cannot
  drive anything, and no manual speed presets — while the native Playback
  speed row stays hidden. The user had no way to change speed at all. Now
  driven by `lockOn()`.

Three were pre-existing:

- **`content/pace.js` — `qt_captionPos` written on every navigation.** The
  same-video early return only fires when the new page HAS a video id, so
  home, search and channel navigations each wrote to `chrome.storage.sync`,
  burning the write quota. Now only for a real video, and only when the value
  is not already zero.
- **`content/yt-menu-patch.js` — `activePlayer()` unhardened for Shorts.** It
  was the only one of the repo's three Shorts resolvers with no
  `[is-active]` preference and an unclipped bounding box, so an off-screen
  reel (same width and height as the visible one) could win the largest-area
  tie-break and receive a CC restore. Aligned with the other two.
- **`content/yt-menu-patch.js` — misplaced closing brace.** `highlightOn =
  next`, `centerOn = next`, `scheduleDisplayRestore()` and
  `paintOpenLangPanels()` all sat inside the `qt_dualCaptions` branch, so
  Color highlight and Center word never updated their module mirrors. In
  practice the storage `onChanged` listener masked it, which is exactly why it
  survived; the structure is now correct.

Mutation check on the two regressions — revert the `renderMenu()` call and the
`lockOn()` body selection:

    2 failed / 8 passed
    (restored)  10 passed

## 14. Gates on the final tree

    syntax        55/55
    unit          62/62
    integration    8/8
    browser       47/47
    visual         1/1
    checkers      W004, W006, W008 all pass
    git diff --check  clean

    live, three consecutive runs:
      RUN 1  lag p95=4.8ms  masthead mutations 2s=0  watch 5 / Shorts 4   2 passed
      RUN 2  lag p95=5.3ms  masthead mutations 2s=0  watch 5 / Shorts 6   2 passed
      RUN 3  lag p95=5.1ms  masthead mutations 2s=0  watch 5 / Shorts 8   2 passed

## 8. Open — not closed by this work item

- **Dual on the real profile.** The handoff asks for a per-click recording of
  storage, bags, provenance, responses and computed styles in the user's own
  Chrome. Not done. Hypothesis worth testing first: `lastSignedTimedtext` is
  only populated from a timedtext request the *player itself* makes, so with
  CC off there is no `pot`/`potc` to merge and the second (translation) fetch
  can come back empty — the same empty-body signature the live probe reports.
- CJK segmentation for zh / ja / th.
- Shorts pill and menu geometry against the current host.
- Computed-style fidelity for pills, tooltips and menus in light and dark.
- The objective pace / Trim benchmark (fixtures plus real corpus).
- Toolkit section in the native shortcuts modal; official PiP.

## 15. Temporary neutral 1x and pace-step shortcuts (2026-08-24)

The dated SPEC supersession now defines one reversible profile toggle:
`A` and `Shift+Backquote` enter/leave temporary 1x, while `S` / `D` and the
existing Shift+, / Shift+. shortcuts decrement/increment the active pace.
Neutral mode makes Pace Lock and Trim effectively off without writing over
the saved Lock flag, Trim flag, WPM target, or manual speed.

Test-first reproduction against the old behavior:

    $ npx playwright test tests/browser/ui-interactions.spec.js \
        --project=browser --grep "A and Shift\+Backquote"
    1 failed
      expected neutral=true, lock=false, trim=false
      received neutral=undefined, lock=true, trim=true

The completed fixture covers the full state transition, including a custom
Lock profile whose computed rate already happens to be 1x; persistence; menu
and adjusted-clock state; both toggle chords in both directions; S/D from
neutral; 10 WPM Lock steps; 0.25x manual steps; open- and closed-shadow input
guards; visible native-dialog guards; and recovery from a transient 4x/8x
Trim boost to the saved manual rate.

Adversarial review found and the implementation fixed three important edge
paths before acceptance: S/D must step from the saved manual rate rather than
the transient player/Trim rate; disabled neutral-mode controls must reject
even synthetic input; and Trim recovery must calculate its stable rate before
clearing the boost marker. A final independent pass reported no blocking
finding.

QUALITY §5 WPM mutation check:

    inverted the slow-speech assertion (<150 -> >=150)
    node --test tests/wpm.test.js: 1 failed / 24 passed
    restored source assertion:     25 passed

Final automated gates for this delta:

    syntax (pace + browser/live probes)  pass
    unit                                62/62
    integration                          8/8
    neutral shortcut target              1/1
    full browser suite                   48/48
    git diff --check                     clean

Real-host acceptance uses a disposable Chromium with the unpacked extension.
The probe writes a 1.5x manual preference to local and sync storage, observes
`A -> 1x`, observes `Shift+Backquote -> 1.5x`, and then asserts that the saved
preference is still 1.5. The long watch fixture avoids a previous host flake
where the 19-second video ended during setup and autoplay replaced the player.

    $ npm run test:live
    [probe] cluster after hidden ASR acquisition: — WPM  ·  1.5x
    [probe] main-thread lag p95=6.2ms max=12.8ms; masthead mutations in 2s=0
    [probe] watch timedtext requests: 7 / budget 12
    [probe] Shorts timedtext requests: 8 / budget 12
    2 passed (1.5m)

The host again returned HTTP 200 with empty timedtext bodies, so this live run
accepts keyboard/profile behavior, CC invariance, responsiveness, geometry,
and request budgets; it does not claim non-zero live WPM or normal-profile
Chrome acceptance.

## 16. Stale Color highlight / Center word availability (2026-08-24)

The user capture is internally contradictory in a useful way: the cluster
shows numeric WPM (`342 WPM`) and the overlay is already painting the current
word in gold with the center marker, while the Subtitles/CC rows still carry
the no-ASR tooltip. The rhythm authority was therefore live; the disabled DOM
state was stale. Inspection of the exact video (`2QL4G54O8Kk`) also found the
normal original-language ASR metadata (`kind=asr`, `vssId=a.pt`), refuting a
track-classification fix for this reproduction.

Five browser regressions were added around that stale-state boundary. Each
new failure was observed against the pre-fix implementation:

- an already-open row misses the one-shot ASR adoption event;
- a stale disabled row is clicked after live ASR becomes authoritative;
- a hidden duplicate settings menu precedes the visible menu;
- the duplicate menu's own style is visible but an ancestor is `display:none`;
- an inline preview player precedes the canonical `#movie_player`.

The fix now reconciles connected caption rows from the live ASR authority on
the normal Toolkit frame, revalidates availability at click time in both
directions, chooses a genuinely rendered/intersecting menu scoped to the
active player, and gives the canonical watch player priority over inline
previews. The steady-state reconciliation is idempotent: an independent
100-frame probe measured zero mutations after the rows reached the correct
state. A separate no-ASR probe confirmed that a stale-looking click still
cannot change the saved Highlight/Center preferences when `_cuesAreAsr` is
false.

Final automated gates for this correction:

    syntax                                pass
    unit                                 62/62
    integration                           8/8
    menu stale-state regressions          10/10
    full browser suite                    53/53
    visual                                 1/1
    git diff --check                      clean

    $ npm run test:live
    main-thread lag p95=5.4ms max=11.9ms; masthead mutations in 2s=0
    watch timedtext requests: 7 / budget 12
    Shorts timedtext requests: 8 / budget 12
    2 passed (1.1m)

The disposable live host again returned only empty timedtext bodies, so that
run proves extension boot, CC invariance, responsiveness, geometry and request
budgets, not non-zero live WPM. The app's separate YouTube tab did not have YT
Toolkit installed. Normal-profile acceptance remains one explicit final gate:
reload the unpacked extension and the existing YouTube tab, then confirm on
the same video that both tooltips are gone, both rows are clickable, and the
submenu remains stable across close/reopen.

## 17. Manual pace uses playback multipliers (2026-08-24)

The user capture showed an effectively unlocked Pace menu whose body still
presented a WPM target (`120`, `180`, `250`, `400`, `600`) and a large `1x`
player value. That mixed two distinct controls. The dated SPEC supersession
now requires one coherent unit system: Pace Lock on uses WPM; Pace Lock off,
neutral 1x, and no-original-ASR mode use playback multipliers throughout the
large value, slider, and presets.

The first regression reproduced the stale source of truth before the fix:

    expected unlocked slider: 1.5
    received unlocked slider: 3

The implementation now restores the saved manual rate when Lock turns off and
renders `1x`, `1.25x`, `1.5x`, `2x`, `3x` presets with a Playback speed slider.
External rate changes are reflected while effectively unlocked. A Lock/ASR
transition replaces the entire connected body rather than leaving WPM under
an off toggle.

The slider preview is transactional. `pointerup` plus the browser's following
`change` writes once; `pointercancel`, popup rebuild, same-video navigation,
miniplayer entry, and menu close restore the saved value. A late `change` from
a detached cancelled range is ignored. External Pace/Trim state still repaints
the connected toggle rows during a drag without rebuilding the range, and an
unchanged open WPM menu produced zero MutationObserver records over 500 ms.

Final automated gates for this correction:

    syntax + git diff --check              pass
    unit                                  62/62
    integration                            8/8
    focused manual-unit regression         1/1
    full browser suite                    53/53
    visual                                 1/1
    independent final review      no P0/P1/P2

    $ npm run test:live
    [probe] main-thread lag p95=6.1ms max=13.5ms; masthead mutations in 2s=0
    [probe] cluster after hidden ASR acquisition: — WPM  ·  1.5x
    [probe] watch empty timedtext request budget: 9 / 12
    [probe] Shorts empty timedtext request budget: 10 / 12
    2 passed (2.1m)

The real-host probe explicitly stored Pace Lock off and manual speed 1.5x,
opened the connected menu, asserted the Playback speed heading, absence of a
WPM range, `aria-valuetext=1.5x`, and the five multiplier presets, and attached
a rendered menu capture to the Playwright test record. The host returned only
empty timedtext bodies, which does not weaken this unlocked/manual-unit gate;
it does mean this run still cannot claim non-zero live WPM. The user's installed
normal Chrome profile still needs an extension reload and YouTube tab refresh
before the changed files can be judged there.

## 18. Persistent Dual slots and native chip paint (2026-08-25)

The supplied screenshots exposed reversed slot colors, silent replacement by
a third language, and Toolkit chips much darker than YouTube. Live computed
style measured the native chip at `rgba(0,0,0,.3)`, 40px high, 28px radius,
with no blur or shadow.

The implementation now preserves two explicit vacancies, blocks a third
choice while both are occupied, and fills only a vacancy the user creates.
Primary is yellow; secondary is blue. The colored indicator is the host's
captured check asset, not a Unicode glyph. Both chips copy native computed
paint with a throttled, idempotent `.3 / 40px / 28px` fallback; transparent
candidate sources are rejected.

Current gates:

    syntax                                pass
    focused slot unit                     12/12
    full unit                             67/67
    node integration                       8/8
    git diff --check                      clean
    independent review findings           fixed

Browser/visual regressions were added but not run in the final closeout
because browser-run permission was not received. The previous 56px time-pill
snapshot is intentionally stale. Normal-profile Chrome reload, same-state
screenshots, and the combined visual comparison remain open; `design-qa.md`
therefore records `final result: blocked` rather than visual acceptance.

## 19. Neutral-rate editing and responsive Shorts controls (2026-08-25)

The supplied captures showed two independent regressions: after `A` entered
transient 1x, the multiplier controls were disabled and their handlers still
returned to the 1x watchdog; on Shorts the Toolkit chip remained visible after
native controls faded, used the watch fallback height/top, overlapped the right
controls, and did not yield when the native volume lane expanded.

Read-only inspection of the user's existing Chrome state established the host
contract before implementation. On the active Short, the native controller is
outside `#shorts-player`, under the active `ytd-reel-video-renderer`:

    ytd-shorts-player-controls
      #left-controls -> 48px rendered height; width grows with volume
      #right-controls -> 48px rendered height; native pill paint

At the observed 452px player width, the collapsed left/right groups measured
116px/144px. Hovering the volume surface expanded the left group to 224px.
Native autohide was expressed by effective ancestor opacity, not by removing
child boxes; the transition was 250ms.

The neutral implementation now leaves multiplier buttons, presets, and slider
enabled. `−`/`+` step from the displayed 1x value; a preset or committed slider
value exits neutral, persists fixed manual speed, and turns Pace Lock off while
preserving Trim. Slider cancellation restores the latest persisted profile,
including concurrent storage changes to Pace Lock and manual speed.

The Shorts implementation now resolves the controller from the active reel,
measures one cached free lane, mirrors native top/height/effective opacity, and
never crosses either native group. Its label degrades full -> rate-only -> a
native-height square icon; an absent controller or insufficient square lane
closes the menu and makes the chip hidden, inert, and unfocusable. Menu geometry
is not read while the menu is closed.

Final automated gates run in this closeout:

    node --check content/pace.js                         pass
    node --check tests/browser/ui-interactions.spec.js pass
    node --check tests/live/probe.spec.js               pass
    npm test                                            67/67
    node --test tests/integration/*.test.js              8/8
    git diff --check                                    clean
    independent neutral review                          clean
    independent Shorts/regression findings              fixed

Browser fixtures were expanded for neutral drag cancellation with production
`lib/prefs.js`, collapsed/mid/edge/exhausted Shorts lanes, 48px and 56px native
heights, volume expansion, native fade, missing controller, hidden keyboard
focus, open-menu fail-close, and SPA reparenting. The final browser suite was
not run by the primary agent because explicit browser-run permission was not
received. No final browser-green or visual-acceptance claim is made.

The remaining real-host gate is exact: reload the unpacked extension from the
canonical checkout, refresh the existing YouTube tab, then capture the updated
states for (1) `A` followed by each multiplier control, (2) collapsed Shorts
chrome, (3) expanded volume, and (4) native controls hidden. Compare those
captures together with the supplied source screenshots at the same viewport.

## 20. Main-thread, caption ownership, and constrained-menu stabilization (2026-08-28)

The follow-up audit separated stale installed-extension behavior from defects
in the current checkout. Five implementation issues were corrected:

1. The lower clock no longer rewrites stable class, style, and ARIA attributes
   on every polling frame. A fixture that previously observed 140 attribute
   mutations per second now observes zero.
2. Caption overlays resolve the canonical active `#movie_player`, keep their CC
   lookup and font source inside that player, and rebind if YouTube replaces the
   player. A preview/miniplayer earlier in document order can no longer steal
   the overlay.
3. Highlight and Center word can use the ordinary native/ASR track when no Dual
   slot is selected. An intentionally empty primary slot with an occupied blue
   secondary slot remains empty, so this fallback does not violate slot choice.
4. Automatic speed writes yield while YouTube is showing an ad and restore the
   saved manual rate after the ad. Caption-position reset now uses the persisted
   `bottom` schema instead of the obsolete `y` field.
5. The native subtitle popup grows only within the available player/viewport
   height. If all three Toolkit rows still do not fit, only the panel menu gets
   internal vertical scrolling; width, paint, padding, and host-owned later
   writes are preserved. Original inline height/overflow values are restored on
   submenu transition, close, removal, and navigation.

Direct extension-storage reads in the YouTube navbar button were also routed
through the safe preferences boundary. The search-app exit button now survives
an SPA body remount and an invalidated extension context without throwing into
the host page.

Final automated gates for this stabilization batch:

    syntax + git diff --check              pass
    unit                                  98/98
    node integration                       9/9
    browser                               69/69
    visual                                 2/2

The sole initial visual failure was a stale 56px time-pill snapshot. The
behavioral paint contract already asserted the native 40px height, 28px radius,
and `rgba(0,0,0,.3)` background; only that snapshot was regenerated, after
which the visual suite passed twice.

Normal-profile Chrome was inspected read-only on a real YouTube watch page.
The currently loaded extension is demonstrably stale: its subtitle panel
rendered 352px of menu content inside a 266px popup, with Highlight and Center
word still disabled. Those are the pre-fix signatures, while the current
checkout passes the constrained-height and ordinary-ASR fixtures. Browser-use
security does not permit opening `chrome://extensions`, so current-code live
acceptance remains pending the user's manual unpacked-extension reload and tab
refresh. No real-host acceptance claim is made for this batch yet.

## 21. Single local source path (2026-08-28)

The two local extension directories were audited before consolidation.
`Downloads/yt-toolkit` was a non-Git 1.5.24 distribution with 18 useful files;
every one also existed in the canonical checkout. Eight were identical and all
ten differing files were older than their canonical counterparts. There was no
Downloads-only source to merge.

The old directory was moved recoverably to:

    /Users/dnl_gentile/.Trash/yt-toolkit-downloads-1.5.24-backup-2026-08-28

The matching old distribution archive was also removed from Downloads and
moved recoverably to:

    /Users/dnl_gentile/.Trash/yt-toolkit-1.5.24-archive-2026-08-28.zip

A separate 26 August full-project ZIP was not a clean release artifact: it
contained `.git`, `node_modules`, tests, output, and an earlier 1.6.1 source
snapshot. It was removed from Projects and moved recoverably to:

    /Users/dnl_gentile/.Trash/yt-toolkit-1.6.1-full-copy-2026-08-26.zip

`/Users/dnl_gentile/Downloads/yt-toolkit` is now a symbolic link to
`/Users/dnl_gentile/Projects/yt-toolkit`. `realpath`, manifest version, and
source hashes were verified through both paths; both resolve to the same 1.6.1
working tree. The canonical dirty Git state was preserved unchanged. Chrome
is already using the unpacked extension ID derived from the Projects path, so
no reinstall or ID migration is needed. It still needs one manual extension
reload and YouTube-tab refresh to discard the already-injected stale scripts.
