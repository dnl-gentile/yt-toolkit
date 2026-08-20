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
| Real-host verified | Playwright (or a recorded manual session) against `https://www.youtube.com/watch` with the unpacked extension loaded |

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
- ND does not match the avatar button as `#guide`

### Live / real-host (before calling a pace or captions slice “done”)

Playwright against Chrome with `--load-extension=<repo>`. Videos in `tests/live/videos.json` (public, captioned, known speech). Assert:

- overlay text matches `/^\d+ WPM/`
- measured WPM while paused in a known silent lead-in is 0
- no `pageerror` / extension exception
- navigate to `/` with ND on does not leave the tab unresponsive (timeout the next click)

Record traces under `output/playwright/`.

### Visual

When CSS/menu/caption layout changes: screenshot the pace pill, pace menu, Subtitles/CC panel, caption overlay — desktop 1280×800. Compare against `tests/visual/baselines/` once a baseline is blessed.

### Performance

Budget on `/watch`:

- ≤ 2 `MutationObserver` instances attached at idle
- no `subtree: true` observer on `document.body`
- content-script intervals on a watch page: pace+captions ≤ 1 watchdog + rAF; menu patch only while `.ytp-settings-menu` is open
- logo click to quiet-app (or cancelled navigation) < 2 s to a responsive document

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
