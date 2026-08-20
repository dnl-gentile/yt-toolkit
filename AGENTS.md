# YouTube Toolkit — agent contract

Canonical folder: **`~/Projects/yt-toolkit`**.

## Before changing anything

1. `docs/SPEC.md` — product law. Later sections in that file already incorporate superseded chat decisions
2. `docs/QUALITY.md` — evidence, pyramid, work items
3. `docs/YOUTUBE-MONITOR.md` if the change touches menus, captions, timedtext, or ND selectors
4. Neighboring implementation and `tests/`

Chat transcripts (including the long Grok thread that produced v1.5.24) are **not** a source of truth. If a user request in this session contradicts `docs/SPEC.md`, update the spec in the same change and note the supersession.

## Method (borrowed from Thals, scoped to this repo)

- Repository is the only resumable state
- Claims require a command that would fail if the change were reverted
- Planned ≠ implemented ≠ tests green ≠ real-host verified
- Concurrent writers declare `paths_owned` in `docs/work/NNN-slug/metadata.yaml`. Overlap is a bug
- WPM/lock/trim and anything that can freeze YouTube is **L**: tests first, independent review, mutation of the slow-speech invariant
- UI (pill, menus, captions) is **M**: screenshot or live probe when the layout changes

## Do not

- Reintroduce a per-word duration floor (`n * 0.28`, `n * 0.4`) in timedtext spreading
- `MutationObserver` on `document.body` with `subtree: true`
- Rewrite native caption DOM
- Force CC on to obtain timedtext
- Stack our pace menu on top of `.ytp-settings-menu`
- Block `#avatar-btn` / the account renderer as if it were `#guide-button`
