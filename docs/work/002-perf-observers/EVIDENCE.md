# W-002 evidence

## Change

Rewrote `content_script_youtube.js` observer/interval wiring. ND hide/restore, theater, logo redirect, guide-vs-avatar, and “In this video” behavior are unchanged; the freeze sources are gone.

- Two `MutationObserver` instances at most (`chromeObserver`, `watchObserver`).
- Targets: `ytd-masthead`, `#guide`, `ytd-watch-flexy`, `#movie_player` (plus `<html>` theme attrs and watch-flexy inners that are **not** the player).
- No `observe(document.body` at all. The only `subtree: true` is `ytd-masthead`.
- `#movie_player` and player-wrapping ancestors (`#columns`, `#primary`) are `subtree: false` so caption/progress ticks do not re-enter hide work.
- `yt-navigate-start` disconnects; `yt-navigate-finish` / `yt-page-data-updated` reattach. `pagehide` / `beforeunload` / `unload` teardown.
- Logo/home: `preventDefault` + `location.replace` after disconnect. Hide/restore bail out while `isUnloading` / `isNavigating`.
- Removed overlapping `setInterval` hide/collapse loops (1000 ms + 300 ms and the rest).
- Guide intercept still ignores `#end` / `#avatar-btn` / `ytd-topbar-menu-button-renderer`.
- `inThisVideoOpen` + engagement-panel click interceptor kept.

`rg` is not on PATH in this shell; `grep -nE` is the same pattern.

## Commands (would fail if reverted)

```
cd /Users/dnl_gentile/Projects/yt-toolkit
grep -n -E "MutationObserver|setInterval|document.body" content_script_youtube.js
grep -n "observe(document.body" content_script_youtube.js
grep -c "new MutationObserver" content_script_youtube.js
grep -n "setInterval" content_script_youtube.js
node --check content_script_youtube.js
```

## Observed output

```
=== MutationObserver|setInterval|document.body ===
36:  // At most two MutationObserver instances (QUALITY.md / SPEC §9).
39:  const chromeObserver = new MutationObserver(onChromeMutations);
40:  const watchObserver = new MutationObserver(onWatchMutations);
56:    const body = document.body;
921:                         document.body.classList.contains('watch-stage-mode') ||
922:                         document.body.classList.contains('watch-wide-mode');
=== observe( ===
284:        chromeObserver.observe(masthead, { childList: true, subtree: true });
287:        chromeObserver.observe(guide, {
292:      chromeObserver.observe(html, {
318:        watchObserver.observe(watchFlexy, {
327:        watchObserver.observe(node, {
336:        watchObserver.observe(moviePlayer, { childList: true, subtree: false });
=== observe(document.body ===
PASS: no observe(document.body)
=== setInterval ===
PASS: no setInterval
=== MutationObserver constructors ===
2
PASS: syntax
```

`document.body` remains only for theme detection and theater-class checks, not as an observer target.

Reverting to the previous body-wide observers would make `grep -n "observe(document.body"` print matches (seven sites, several with `subtree: true`) and `grep -c "new MutationObserver"` would be greater than 2.

Real-host: not run in this slice (logo click < 2 s, avatar menu, In this video).
