# W-013 — UNIP Video.js adapter

Implement the 2026-08-26 supersession in `docs/SPEC.md` for the allow-listed
`tvweb3.unip.br` course player.

Acceptance surfaces:

- wide ~738×415 and narrow ~471×265 Video.js roots
- paused, playing/user-active, playing/user-inactive, settings-open, and Toolkit-menu-open states
- manual multiplier, neutral 1×, S/D stepping, native rate change, adjusted clock
- zero, one, and two-or-more loaded caption tracks
- Dual slot clear/fill/no-eviction behavior and native caption restoration
- no word-rhythm activation from cue-only WebVTT
