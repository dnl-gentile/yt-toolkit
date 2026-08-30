# W-010 work contract

Acceptance requires behavioral evidence, not source grep:

1. Loading ASR never changes the user's CC state or selected displayed track.
2. Empty timedtext is rejected and retries are deduplicated/backed off.
3. Dual Subtitles handles the current label-only YouTube rows, mouse and
   keyboard activation, two colored slots, Auto-translate, and ARIA restore.
4. Opening either speed menu closes the other without closing both.
5. The player rate, top pill, and open Toolkit menu show the same live rate.
6. Live probe asserts hidden Playback speed and records WPM/CC/request budget.
7. The adjusted current clock is recomputed when its manual divisor changes.
8. Miniplayer hides Toolkit overlays while preserving exactly one native clock.
9. Caption paint copies the computed native font size, including hidden and
   high-scale native captions.
10. Idle observer and pace/captions scheduler budgets match `docs/QUALITY.md`.
11. No Distractions never intercepts the account cluster as Guide, and current
    YouTube chips can open In this video/Transcript panels.
12. `/shorts/:id` mounts one pace pill in the active player's free top-center
    lane, follows SPA navigation without duplication, closes its open menu on
    the next Short, derives ASR from the pathname/player response without
    changing CC, and never injects the lower watch clock.

The final evidence file must separate unit, DOM fixture, disposable live host,
and real Chrome results.
