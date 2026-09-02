# Changelog

All notable changes to YouTube Toolkit are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The extension version in
`manifest.json` is the one that ships.

History before 1.6.1 lives in the predecessor repository,
[yt-no-distractions-ext](https://github.com/dnl-gentile/yt-no-distractions-ext), which
carried only the No Distractions feature.

## [Unreleased]

Nothing yet.

## [1.6.2] — 2026-09-02

Shorts support, a playback speed that stays where you put it, and the repository opened to
the public.

### Added

- **YouTube Shorts.** The pace pill sits in the native control lane and shows a single
  value — your target WPM under Pace lock, otherwise the rate — because the lane has no
  room for two. **Colour highlight** and **Center word** appear in the Shorts captions
  sheet. Dual subtitles deliberately does not: a Short has room for one line.
- **A fixed 1× you can leave on.** <kbd>A</kbd> (or <kbd>Shift</kbd>+<kbd>`</kbd>) drops
  everything to plain 1× and back. It is a *global* state, not a per-video one: set it,
  open a different video tomorrow, and you are still at 1×. Your pace target and trim
  setting wait underneath, untouched.
- <kbd>S</kbd> and <kbd>D</kbd> step the speed by 0.25×.
- **Settings follow you to the next video** — pace target and state, trim, manual speed,
  caption languages, and the Dual/Highlight/Center toggles.
- Pace lock now reaches **800 WPM** on the slider (presets still stop at 600).
- **Playback controls on one allow-listed course player**, the Video.js player at
  `tvweb3.unip.br`: speed pill, adjusted clock, and dual subtitles built from tracks the
  page already loaded. No caption fetching happens there, so the features that need word
  timing stay visibly unavailable rather than guessing.
- **An options page** holding the privacy switch and an installation-ID reset. Playback and
  caption settings stay in the player, deliberately.
- **Telemetry is opt-out**, enforced at a single point that cannot be bypassed.
- `LICENSE` (GPL-3.0-or-later), `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, issue and pull-request templates, and a 14-page wiki.
- `npm run package`, `npm run icons`, `npm run icons:check`, `npm run wiki:publish`.

### Changed

- The card icon is rendered from a vector source instead of being a bitmap composite, and
  now uses the official YouTube badge silhouette with a toolbox glyph that survives 16px.
- CI runs the unit and browser suites on **Windows as well as Linux**. The browser suite
  serves every page itself, so a Windows-only failure means a real platform difference.
- README rewritten for someone who has never seen the project.

### Fixed

- **No Distractions turned itself back on after every page load.** The toggle wrote to one
  storage area while the read merged two of them the other way round, so switching it off
  never survived a reload.
- **WPM and Center word no longer need you to toggle captions off and on.** The engine
  needs a proof token that was only ever picked up by overhearing a request YouTube makes
  when captions are on. It now reads the same token from the player response.
- **Shorts caption rows kept their own content.** They were built by instantiating
  YouTube's own list component, whose render replaced the label we had just put in.
- **The Shorts pace menu is painted from the Shorts sheet**, not the watch menu, so it
  stops looking more transparent than the surface it sits on.
- Trim boost is visible on the pill and never feeds the watch clock.
- No Distractions no longer freezes the tab through a self-feeding masthead observer.
- One player-lifecycle observer instead of two, rooted on the reel list rather than on
  every sibling reel — measured 3 observers over 7 roots, now 2 over 2.

### Security

- The GA4 Measurement Protocol secret is documented in `SECURITY.md` as public by
  construction in an open-source client, with what it can and cannot do.

## [1.6.1] — 2026-08-20

The release that established the current pace and caption behavior, and the quality gates
around it. Decisions recorded as the 2026-08-20 supersession in `docs/SPEC.md`.

### Added

- **Pace overlay** at the top center of the player: measured WPM and the current rate,
  hiding with `.ytp-autohide` like YouTube's own chrome.
- **Pace lock** — a 120–600 WPM target that drives `playbackRate` instead of the reverse.
- **Trim silence** — accelerates gaps of 1.2 s or longer without seeking.
- **Adjusted watch clock** — `{adjusted current} / {adjusted total} ({original total})`,
  stable rather than tracking the live oscillating rate.
- **Dual subtitles**, **Color highlight** and **Center word** (Spritz-style RSVP), injected
  into YouTube's native Subtitles/CC menu directly under **Off**.
- CI: unit, integration and visual jobs; live probe kept manual/nightly because YouTube is
  not a stable CI host.

### Changed

- WPM, pace lock, trim and the clock now always read the video's **original-language**
  track. Switching the displayed subtitle to Arabic, Chinese or an auto-translation no
  longer distorts the pace.
- Overlay moved from top-right to **top-center**, so it stops covering YouTube's info
  cards. The native bottom time display is left alone.
- Clock divisor is the × shown on the pill, so the two can no longer disagree.
- Pace, trim, dual, highlight and center toggles adopt YouTube's on-state colors and row
  alignment.
- Native **Playback speed** row is hidden; ours is the single source of truth.

### Fixed

- Trim boost now ends on the first spoken word instead of riding 4×/8× into speech.
- Slow speech no longer reads as 150–214 WPM — the per-word duration floor
  (`n × 0.28 s`) is gone, and a regression test fails if it returns.
- Silence threshold raised to ~1.15 s, so an 80 WPM speaker's natural gaps are no longer
  treated as silence.
- Adjusted total no longer collapses to ~2 minutes on a 57-minute video, and no longer
  flickers.
- The account and avatar menu is never swallowed by No Distractions.

[Unreleased]: https://github.com/dnl-gentile/yt-toolkit/compare/v1.6.2...HEAD
[1.6.2]: https://github.com/dnl-gentile/yt-toolkit/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/dnl-gentile/yt-toolkit/releases/tag/v1.6.1
