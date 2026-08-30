# Quality, testing, delivery — YouTube Toolkit

Adapted from the Thals quality bar (`thals.ai/docs/08-quality-delivery.md`, constitution Articles I–II, VI). This file is engineering law for this repo. Product law lives in `docs/SPEC.md`.

## 1. Claims need evidence

No claim about behavior is accepted without output from a command that would **fail if the change were reverted**. “Looks right in my head” is not evidence.

States are separate:

| State | Meaning |
|---|---|
| Planned | In `docs/SPEC.md` or a work item |
| Implemented | Code in this repo |
| Tests green | `npm test` (and live proof, when required) passed on this commit |
| Real-host verified | Playwright (or a recorded manual session) against the relevant YouTube `/watch`, `/shorts/:id`, or allow-listed UNIP Video.js host with the unpacked extension loaded |

A unit suite that never talks to YouTube cannot close a visual/menu item. A Playwright screenshot cannot close a WPM invariant.

## 2. Pyramid

### Unit (every PR)

Pure functions, no Chrome, no network:

- timedtext XML + json3 parse
- ASR rolling-window dedupe
- local WPM, silence → 0, median base WPM
- lock rate = target / local, clamped
- trim gap detection (1.2 s floor)
- clock `format` + stable adjusted duration
- language token identity (`en` ≡ `tlang:en`)

These tests must include a **regression that fails** if the old `n × 0.28 s` / `n × 0.4 s` duration floor returns (that floor made ~80–120 WPM speech read as ~180–214).

### Integration (every PR that touches captions/menu/ND)

jsdom or a fixture player-chrome:

- Dual injects only into the Subtitles/CC panel
- Playback speed row is hidden
- CC Off hides our overlay
- A → B navigation preserves explicit CC, language(s), caption toggles, manual speed, target/Lock, and Trim while resetting per-video cues
- Fixed 1x survives player replacement, `/watch` ↔ `/shorts` navigation and
  reload without overwriting the saved custom profile; S/D and committed
  multiplier edits persist the explicit exit
- A same-video player-response replacement with a refreshed signed ASR URL
  re-arms rhythm and word paint without a CC toggle and without a fetch loop
- `kind=asr&tlang=...` is rejected as source rhythm; translated/uploaded cues cannot replace an adopted ASR source
- An uploaded fallback arriving before the track list cannot block the later ASR pull
- Pace Lock and Trim rates never overwrite the saved manual speed
- With a translated display language, Highlight/Center word changes follow irregular original-ASR word onsets rather than an even cue split
- ND does not match the avatar button as `#guide`
- The Shorts captions surface contains exactly Color highlight and Center word
  Toolkit rows, inherits the native Shorts row/popup paint, and never injects
  Dual Subtitles there

### Live / real-host (before calling a pace or captions slice “done”)

Playwright against Chrome with `--load-extension=<repo>`. Videos in `tests/live/videos.json` (public, captioned, known speech). Assert:

- overlay text matches `/^(?:\d+|—) WPM/` — a number when an original-language ASR source exists, and the `—` marker when the video has none (2026-08-23: `0 WPM` means a real pause per `docs/SPEC.md` §4, so it may not double as "no transcript"). `REQUIRE_WPM=1` still demands a real number
- measured WPM while paused in a known silent lead-in is 0
- no `pageerror` / extension exception
- navigate to `/` with ND on does not leave the tab unresponsive (timeout the next click)
- on `/shorts/:id`, the singleton pill is a child of the active
  `#shorts-player`, matches the rendered top/height and effective visibility of
  `ytd-shorts-player-controls`, shows only `{target} WPM` while Pace Lock is
  effectively active or only `{rate}x` otherwise, and stays centered in the
  collapsed-volume lane. Expanded volume produces one native-height
  speedometer square anchored to the lane's right edge, with zero overlap
  against `#left-controls` / `#right-controls`,
  becomes hidden/inert when the native controller or minimum square lane is
  unavailable, and injects no lower Toolkit clock
- with Shorts CC on, Highlight/Center is a singleton child of the active
  path-matching `#shorts-player`, follows the next Short without a CC toggle,
  and leaves the prior Short and native caption DOM untouched; with CC off it
  stays hidden and does not click the CC control
- enter fixed 1x on one video, navigate to another watch video and a Short,
  and verify both actual rate and persisted state stay at fixed 1x before an
  explicit S/D or manual-speed edit exits it

Record traces under `output/playwright/`.

For `tvweb3.unip.br`, real-host acceptance additionally asserts:

- the content scripts attach inside the matching iframe and never inject No Distractions or any YouTube-only module
- the pill is 30px-high, top-centered at 8px, and hides/inerts with the native `vjs-user-inactive` playing state
- the menu stays inside both the observed ~738×415 and ~471×265 players, scrolls above the control bar, and does not stack with the native settings menu
- `A`/`Shift+Backquote`, `S`/`D`, slider, presets, native settings speed, and adjusted time stay synchronized without freezing the host
- Dual uses existing cue-level `TextTrack` data, two non-evicting colored slots, and restores native primary captions when disabled
- WPM/Pace Lock/Trim/Color/Center never activate from cue-level WebVTT alone

### Visual

When CSS/menu/caption layout changes: screenshot the pace pill, pace menu, Subtitles/CC panel, caption overlay — desktop 1280×800. Compare against `tests/visual/baselines/` once a baseline is blessed.

### Performance

Budget on `/watch` and `/shorts/:id`:

- ≤ 2 `MutationObserver` instances attached at idle
- no `subtree: true` observer on `document.body`
- content-script intervals on a watch page: pace+captions ≤ 1 watchdog + rAF; menu patch only while `.ytp-settings-menu` is open
- pace rhythm work is throttled to at most once per 80 ms and UI paint to at most once per 140 ms; Shorts has no second geometry loop
- after the pill stabilizes, repeated UI passes create zero child-list mutations when the visible text is unchanged
- `localWpm` and `trimBoost` stay bounded on a 20k-word transcript instead of scanning the full array per update
- logo click to quiet-app (or cancelled navigation) < 2 s to a responsive document
- the UNIP adapter has no interval, animation-frame loop, fetch/XHR hook, or permanent document-subtree observer after player discovery; steady updates are media events plus one root-class observer, bounded child-list observers on the player ancestor chain, and one `ResizeObserver`

## 3. Work items

Every non-trivial change is a folder `docs/work/NNN-slug/` with:

- `metadata.yaml` — id, tier, `paths_owned`, status
- `SPEC.md` or `WORK.md` pointing at `docs/SPEC.md` sections
- `EVIDENCE.md` — command + observed output (not a paraphrase)

Two concurrent writers may not own the same path.

Tiers:

- **S** — bug with a failing test, single module
- **M** — user-visible UI, captions, ND, menu injection (independent review of the diff)
- **L** — WPM/lock/trim math, anything that can freeze YouTube (refutation review + mutation of the invariant tests)

## 4. CI (when GitHub is wired)

1. `npm test`
2. lint of `lib/` + `tests/`
3. Playwright live job is **manual / nightly**, not a required PR check (YouTube is not a stable CI host). Failures open an issue; they do not silently skip

Until CI exists, the coordinator runs `npm test` before claiming a slice done.

## 5. Mutation of WPM invariants

At least once per WPM change, invert the assertion in `tests/wpm.test.js` (“slow 80 WPM speech must not read as ≥ 150”) and confirm the suite goes red, then restore. Record that in `EVIDENCE.md`. That is how we know the test is load-bearing (Thals constitution Article II).
