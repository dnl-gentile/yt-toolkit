<div align="center">

<img src="icons/icon128.png" width="88" height="88" alt="YouTube Toolkit" />

# YouTube Toolkit

**Watch YouTube at a constant *speaking* rate, not a constant playback rate.**

A Chrome extension that reads the video's captions, measures how fast the person is
actually talking, and moves `playbackRate` so the words arrive at the pace *you* picked.
Plus dual subtitles, word highlighting, and a No Distractions mode.

[![CI](https://github.com/dnl-gentile/yt-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/dnl-gentile/yt-toolkit/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4.svg)](manifest.json)
[![Version](https://img.shields.io/badge/version-1.6.1-informational.svg)](CHANGELOG.md)

[Install](#install) · [Features](#features) · [Wiki](https://github.com/dnl-gentile/yt-toolkit/wiki) · [Privacy](PRIVACY.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why

2× is a blunt instrument. A slow, thoughtful speaker at 2× is still slower than a fast
one at 1×, and the fast one at 2× is unintelligible. The number on the pill is the wrong
number — it describes the *file*, not the *speech*.

YouTube Toolkit locks the number you actually care about: **words per minute**. Set 180
WPM and the extension keeps the speaker there, easing the rate up on the slow stretches
and back down on the fast ones. A 90 WPM lecturer plays near 2×; an auctioneer plays
below 1×. You stop babysitting the speed control.

<!--
SCREENSHOTS — capture the four shots listed in docs/media/SHOTLIST.md, drop the PNGs
into docs/media/, then replace this comment with the table from that file.
-->

## Features

### Pace — the WPM engine

- **Live WPM readout** in a top-center pill on the player: `180 WPM · 1.75x`. Unlocked,
  the WPM is the *measured* local speaking rate. Pause in a silence and it reads `0` —
  it does not hold a stale number.
- **Pace lock** turns the speedometer into a target: 120–600 WPM, step 10, presets at
  120 · 180 · 250 · 400 · 600. The extension solves for the rate:
  `playbackRate = clamp(targetWpm / localWpm, 0.7, 2.5)`.
- **Trim silence** accelerates gaps of 1.2 s or longer (4×, or 8× past five seconds) and
  snaps back to your lock *on the first spoken word* — no seeking, so no decoder stutter.
- **Adjusted watch clock** next to the pill: how long the video will actually take you,
  `{adjusted current} / {adjusted total} ({original total})`. Stable, not a flickering
  live estimate.
- Measured from the video's **original-language** track, so switching the displayed
  subtitle to Arabic or Japanese never distorts the pace.

### Captions

Three rows added to YouTube's own **Subtitles/CC** menu, right under **Off**:

- **Dual subtitles** — permission to pick *two* languages, stacked and independently
  draggable. Portuguese plus auto-translated English gives you two different texts, not a
  clone. Each slot gets its own check color (`#3EA6FF`, `#FFCC00`).
- **Color highlight** — the word being spoken right now in the slot color, the rest dimmed
  to 28%. Reading along stops being work.
- **Center word** — Spritz-style RSVP pinned to a marker at the center of the player, with
  red ORP hairs. Works while paused, works alongside Dual.

Captions keep YouTube's native font size and its one-background-per-cue structure. The
extension never forces CC on, and never rewrites the native caption DOM.

### No Distractions

- A toggle on the masthead, right of the bell.
- On: theater mode; related videos, comments, endscreen, Create and the bell all hidden;
  the left guide collapsed.
- Home and the logo redirect to a quiet search page instead of the recommendation feed.
- **Your account menu still opens.** Chapters, "In this video" and the transcript panel
  still open. The point is to remove the pull, not to break the site.

## Install

Not on the Chrome Web Store yet — see [issue tracker](https://github.com/dnl-gentile/yt-toolkit/issues)
for the listing status. Until then, load it unpacked:

1. Download the latest [release ZIP](https://github.com/dnl-gentile/yt-toolkit/releases)
   and unzip it — or `git clone https://github.com/dnl-gentile/yt-toolkit.git`
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. **Load unpacked** → select the folder that contains `manifest.json`
5. Open any captioned video. The pace pill appears at the top of the player.

Chrome, Edge, Brave, Arc and other Chromium browsers all work — it is a standard
Manifest V3 extension. Firefox is not supported.

> **Heads up:** the pace engine needs captions. On a video with no captions of any kind
> there is nothing to measure, and the pill stays quiet. That is by design — the extension
> does not invent transcripts.

## Keyboard

| Keys | Pace lock off | Pace lock on |
|---|---|---|
| <kbd>Shift</kbd> + <kbd>,</kbd> | −0.25× | −10 WPM |
| <kbd>Shift</kbd> + <kbd>.</kbd> | +0.25× | +10 WPM |

Everything else stays YouTube's: <kbd>J</kbd> / <kbd>K</kbd> / <kbd>L</kbd>,
<kbd>,</kbd> / <kbd>.</kbd> frame-stepping, <kbd>Shift</kbd>+<kbd>P</kbd> /
<kbd>N</kbd>. The extension hides YouTube's native *Playback speed* row, because ours is
the source of truth and two speed controls that disagree is worse than one.

## Where the settings are

Deliberately, almost nowhere:

- **Pace lock** and **Trim silence** live in the pace menu, behind the speedometer.
- **Dual**, **Color highlight** and **Center word** live in YouTube's Subtitles/CC menu.
- The **options page** (`chrome://extensions` → Details → Extension options) holds only
  the privacy switch. Playback settings are not duplicated there.

## Privacy

The extension collects **anonymous, aggregate usage counts**: installs, No Distractions
toggles, homepage redirects. Never video IDs, titles, caption text, search terms, watch
history or account data.

It is **opt-out**: uncheck *Send anonymous usage statistics* on the options page and
nothing is sent — there is no code path around that switch, and
[a test enforces it](tests/integration/telemetry.test.js). Full detail in
[PRIVACY.md](PRIVACY.md).

## Development

```bash
git clone https://github.com/dnl-gentile/yt-toolkit.git
cd yt-toolkit
npm install
```

No build step. The repo *is* the extension — point `chrome://extensions` at the clone and
reload after edits.

```bash
npm test              # unit: WPM engine, timedtext, clock, language identity
npm run test:integration   # manifest wiring, menu injection, telemetry gate
npm run test:visual        # Playwright screenshots against blessed baselines
npm run test:live          # real YouTube, unpacked extension (manual/nightly)
npm run package            # build yt-toolkit.zip for a release
```

### Layout

| Path | What lives there |
|---|---|
| `manifest.json` | MV3 wiring. Script order matters — `lib/` before `content/` |
| `background.js` | Service worker: install defaults, homepage redirect, ND state |
| `lib/` | Pure, testable logic: `timedtext`, `wpm`, `clock`, `dual-lang` |
| `content/` | Player-facing: `pace`, `captions`, `yt-menu-patch`, `inject` |
| `content_script_youtube.js` | No Distractions and masthead toggle |
| `options.html` / `options.js` | Options page (privacy only) |
| `docs/` | Spec, quality bar, host-drift monitor, work items |
| `tests/` | Unit, integration, visual, live |

### The rules

This repo runs on a written contract, not vibes. Read these before changing anything:

- **[`docs/SPEC.md`](docs/SPEC.md)** — product law. Later sections supersede earlier ones.
- **[`docs/QUALITY.md`](docs/QUALITY.md)** — evidence, the test pyramid, work items.
  *Planned ≠ implemented ≠ tests green ≠ verified on a real host.*
- **[`docs/YOUTUBE-MONITOR.md`](docs/YOUTUBE-MONITOR.md)** — YouTube renames things without
  notice. This is how we find out before users do.
- **[`AGENTS.md`](AGENTS.md)** — contract for AI agents working in this repo.

The WPM math is load-bearing and has been wrong before. Anything touching it needs a
failing test first, plus a mutation check that the test is real. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Bug reports, host-drift reports and pull requests are welcome —
[CONTRIBUTING.md](CONTRIBUTING.md) has the shape of a good one. If YouTube's markup
shifted under the extension, the
[host drift issue template](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose)
tells you exactly what to capture.

Security issues: [SECURITY.md](SECURITY.md). Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Lineage

Continues [yt-no-distractions-ext](https://github.com/dnl-gentile/yt-no-distractions-ext),
which was No Distractions only. The pace engine, captions and clock are new here.

## License

[GNU General Public License v3.0 or later](LICENSE) — Copyright © 2025 Daniel Gentile.

You may use, study, share and modify it. If you distribute a modified version, it has to
stay free too.
