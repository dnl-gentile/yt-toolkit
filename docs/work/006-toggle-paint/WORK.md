# W-006 — toggle paint

Points at `docs/SPEC.md` **1.6.1** supersession (2026-08-20):

- Pace-lock / Trim / Dual / Color / Center toggles copy YouTube’s **on** colors (lighter track, white thumb)
- Dual / Color highlight / Center word rows align with **Off** (label left, small inset, toggle right)

Also `docs/SPEC.md` §3 (native chrome) and §7:

- Track thin grey, thumb larger near-white; toggle on the right
- Label inset matching Off — not glued, not centered
- No `:focus` blue/white ring on our rows or the speedometer

## Payload

`styles-toggles.css` (not `styles.css` — W-003 owns that file).

ON: track `rgba(255,255,255,0.55)`, thumb `#ffffff`.
OFF: track `rgba(255,255,255,0.15)`, thumb `#c8c8c8`.
Icon slot 24–40px (40px, min 24px) matching native `.ytp-menuitem-icon`.
