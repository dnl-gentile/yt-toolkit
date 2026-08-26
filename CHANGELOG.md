# Changelog

All notable changes to YouTube Toolkit are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The extension version in
`manifest.json` is the one that ships.

History before 1.6.1 lives in the predecessor repository,
[yt-no-distractions-ext](https://github.com/dnl-gentile/yt-no-distractions-ext), which
carried only the No Distractions feature.

## [Unreleased]

### Added

- `LICENSE` — GPL-3.0-or-later, matching the header already carried by `background.js`.
  SPDX identifiers on the source files.
- **Options page** (`chrome://extensions` → Details → Extension options) holding the
  privacy switch and an installation-ID reset. Playback and caption settings deliberately
  stay in the player.
- **Telemetry opt-out**: `qt_telemetry` in `chrome.storage.sync`, default on, enforced at a
  single choke point in `Analytics.sendEvent`. A missing or throwing storage layer means
  no reporting. Covered by `tests/integration/telemetry.test.js`, which was mutation-checked.
- `PRIVACY.md` — every event, field, storage key and network destination, written to match
  the code.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, this changelog.
- Issue templates (bug, feature, host drift) and a pull request template built around the
  evidence bar in `docs/QUALITY.md`.
- `npm run package` — reproducible release ZIP with only the files the extension needs.
- Wiki sources under `docs/wiki/`, published with `npm run wiki:publish`.

### Changed

- README rewritten for a public audience: what the WPM engine actually does, install,
  keyboard, privacy, layout, and where the rules live.
- `docs/SPEC.md` gains §11 (telemetry and privacy, options page) and §12 (licence), plus a
  dated supersession note for 2026-08-26.

### Security

- Documented in `SECURITY.md` that the GA4 Measurement Protocol secret is public by
  construction in an open-source client, what it can and cannot do, and the rotation plan.

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

[Unreleased]: https://github.com/dnl-gentile/yt-toolkit/compare/v1.6.1...HEAD
[1.6.1]: https://github.com/dnl-gentile/yt-toolkit/releases/tag/v1.6.1
