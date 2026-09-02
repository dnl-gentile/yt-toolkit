# W-013 review

## Independent refutation review

Three independent passes covered performance/root-cause risk, state regression,
and narrow/wide visual behavior. The review focused on:

- page-freeze risk and observer/event budgets
- loss or duplication of native captions when toggling Dual
- restoring manual speed after temporary 1×
- slider persistence without rebuilding the active range during drag
- iframe match scope and absence of No Distractions on UNIP
- visual containment at 471×265

### Findings resolved

- repeated document-wide discovery was removed from added-node callbacks
- track-list traversal, cue traversal, payload size, message frequency, storage
  writes, and native-menu close retries are bounded
- full bridge payloads require one outstanding request ID and an absolute
  1.2-second request window; both bridge halves start before page scripts, hello
  cannot reset an established channel, and caption commands coalesce behind their
  own absolute 1.2-second window without generation-based budget resets
- stale `TextTrackList` listeners are aborted and media generations invalidate on
  `loadstart`, `emptied`, and DOM-track `load`
- temporary 1× is transient and restores the saved manual speed after reattach
- saved caption preferences remain distinct from per-course fallback languages;
  clearing a slot does not evict or shift the other slot
- native captions are hidden only after every selected custom track has real cues,
  and native CC Off suppresses the custom overlay
- the menu maintains an 8px gap above the 30px native control bar at 738×415 and
  471×265; caption bounds and z-order prevent overlap with Toolkit chrome
- the trigger exposes `aria-expanded`/`aria-controls`, and the menu has dialog
  semantics

### Remaining acceptance gate

No P1 remained in static, unit, integration, or local-browser review. Tier-L
closeout is still pending a reload of the unpacked extension and visual/behavioral
verification in the authenticated UNIP player. This review does not infer live
host acceptance from the fixture.
