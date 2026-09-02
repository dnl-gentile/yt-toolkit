# W-002 evidence

## Change

Rewrote `content_script_youtube.js` observer/interval wiring. ND hide/restore, theater, logo redirect, guide-vs-avatar, and “In this video” behavior are unchanged; freeze sources (body observer, hide intervals, huge-tree subtree) are gone.

- Two `MutationObserver` constructors in this file (`chromeObserver`, `watchObserver`). Idle `/watch` page count is not claimed here: `content/yt-menu-patch.js` `playerObs` is outside `paths_owned`.
- Allowed observe targets only: `ytd-masthead` (`subtree: true`), `#guide` (attrs), `ytd-watch-flexy` (`subtree: false`), `#movie_player` (`subtree: false`), `<html>` attrs.
- No `observe(document.body`. The only `subtree: true` is `ytd-masthead`. `#below` / `#comments` / `#secondary` / `#related` / `#panels` / `ytd-watch-metadata` / `#top-row` are not observed.
- `#movie_player` and `ytd-watch-flexy` are `subtree: false` so caption/progress ticks and comment/related hydration do not re-enter hide work.
- `yt-navigate-start` disconnects, clears pending timeouts, and sets `isNavigating`. Empty `detail.url` falls back to `location.pathname`; `/` or `/feed` still sets `isUnloading`. `handlePageDataUpdated` does **not** clear `isNavigating` and returns via `shouldSkipDomWork()` until `yt-navigate-finish`.
- Logo/home: `preventDefault` + `location.replace` after disconnect. Hide **and** restore bail out on `shouldSkipDomWork()` (`isUnloading || isNavigating`).
- `replaceVerificationTags` is not called from `onWatchMutations`; it runs from `applyNoDistractionsToVideoPage` (navigate-finish / retries), not on every watch mutation.
- Removed overlapping `setInterval` hide/collapse loops.
- Guide intercept still ignores `#end` / `#avatar-btn` / `ytd-topbar-menu-button-renderer`.
- `inThisVideoOpen` + engagement-panel click interceptor kept.

`rg` is not on PATH in this shell; `grep -nE` is the same pattern.

## Commands (would fail if reverted)

Re-introducing `subtree: true` on `#comments` / `#below` / `#secondary` makes `grep -n "subtree:"` show extra `true` lines and makes the inner-tree pipeline exit 1. Re-introducing `observe(document.body` fails that grep. Clearing `isNavigating` in `handlePageDataUpdated` fails the page-data pipeline. Restoring `replaceVerificationTags()` inside `onWatchMutations` fails the caller grep / node invariant.

```
cd /Users/dnl_gentile/Projects/yt-toolkit
grep -n "subtree:" content_script_youtube.js
grep -n "subtree: true" content_script_youtube.js
test "$(grep -c 'subtree: true' content_script_youtube.js)" = 1
! grep -n "collectWatchInnerTargets" content_script_youtube.js
! grep -n "subtree:" content_script_youtube.js | grep -E "#comments|#below|#secondary|#related|#panels|ytd-watch-metadata|#top-row"
grep -n "observe(document.body" content_script_youtube.js
grep -n "setInterval" content_script_youtube.js
grep -c "new MutationObserver" content_script_youtube.js
! grep -A12 "function handlePageDataUpdated" content_script_youtube.js | grep "isNavigating = false"
grep -n -A1 -E "function restore|function showActionButtons" content_script_youtube.js
grep -n "replaceVerificationTags" content_script_youtube.js
grep -n -A10 "function pathFromNavigateEvent" content_script_youtube.js
node --check content_script_youtube.js
```

Node invariant (exits 1 if `#comments` subtree, `collectWatchInnerTargets`, `handlePageDataUpdated` clearing `isNavigating`, restore without `shouldSkipDomWork`, or `replaceVerificationTags` in `onWatchMutations` return):

```
node -e '
const fs=require("fs");
const s=fs.readFileSync("content_script_youtube.js","utf8");
const names=["restoreNavbarButtons","restoreLeftSidebar","restorePrimaryColumn","restoreSuggestions","restoreComments","restoreEndScreenRecommendations","showActionButtons","restoreAllHiddenElements"];
let bad=[];
for (const name of names) {
  const re=new RegExp("function "+name+"\\(\\) \\{([\\s\\S]*?)\\n  function ");
  const m=s.match(re);
  const body=m?m[1]:s.slice(s.indexOf("function "+name));
  if (!body.slice(0,180).includes("shouldSkipDomWork()")) bad.push(name);
}
if (bad.length) process.exit(1);
if (/\bcollectWatchInnerTargets\b/.test(s)) process.exit(1);
const trues=[...s.matchAll(/subtree:\s*true/g)];
if (trues.length!==1) process.exit(1);
if (!/observe\(masthead,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*\}/.test(s)) process.exit(1);
const watchFn=s.slice(s.indexOf("function onWatchMutations"), s.indexOf("function redirectToQuietApp"));
if (watchFn.includes("replaceVerificationTags")) process.exit(1);
const pd=s.slice(s.indexOf("function handlePageDataUpdated"), s.indexOf("function teardown"));
if (pd.includes("isNavigating = false")) process.exit(1);
if (!pd.includes("shouldSkipDomWork()")) process.exit(1);
const nav=s.slice(s.indexOf("function pathFromNavigateEvent"), s.indexOf("function handleNavigateStart"));
if (!nav.includes("window.location.pathname")) process.exit(1);
console.log("PASS: node invariant checks");
'
```

## Observed output

```
=== grep -n subtree: ===
260:        chromeObserver.observe(masthead, { childList: true, subtree: true });
293:          subtree: false,
300:        watchObserver.observe(moviePlayer, { childList: true, subtree: false });
=== grep -n subtree: true ===
260:        chromeObserver.observe(masthead, { childList: true, subtree: true });
=== comments/below/secondary/related/panels with subtree true ===
PASS: no inner-tree subtree observes
=== collectWatchInnerTargets ===
PASS: no collectWatchInnerTargets
=== observe(document.body ===
PASS: no observe(document.body)
=== setInterval ===
PASS: no setInterval
=== MutationObserver constructors ===
2
=== handlePageDataUpdated must not clear isNavigating ===
PASS: handlePageDataUpdated does not clear isNavigating
=== restore* / showActionButtons guards ===
757:  function restoreNavbarButtons() {
758-    if (shouldSkipDomWork()) return;
840:  function restoreLeftSidebar() {
841-    if (cachedNoDistractionsEnabled || shouldSkipDomWork()) return;
964:  function restorePrimaryColumn() {
965-    if (shouldSkipDomWork()) return;
1018:  function restoreSuggestions() {
1019-    if (shouldSkipDomWork()) return;
1111:  function restoreComments() {
1112-    if (shouldSkipDomWork()) return;
1219:  function restoreEndScreenRecommendations() {
1220-    if (shouldSkipDomWork()) return;
1299:  function showActionButtons() {
1300-    if (shouldSkipDomWork()) return;
1383:  function restoreAllHiddenElements() {
1384-    if (cachedNoDistractionsEnabled || shouldSkipDomWork()) return;
=== replaceVerificationTags callers ===
660:    replaceVerificationTags();
1462:  function replaceVerificationTags() {
=== pathFromNavigateEvent fallback ===
478:    if (!raw) return window.location.pathname || '';
=== node --check ===
PASS: syntax
=== node invariant checks ===
PASS: every restore*/showActionButtons returns on shouldSkipDomWork()
PASS: node invariant checks
```

`document.body` remains only for theme detection and theater-class checks, not as an observer target.

Reverting inner `subtree: true` on `#comments` would make `grep -n "subtree:"` list more than masthead `true` + flexy/player `false`, and the node invariant would exit 1. Reverting `observe(document.body` would make `grep -n "observe(document.body"` print matches.

Real-host: not run in this slice (logo click < 2 s, avatar menu, In this video). QUALITY idle observer budget on a live `/watch` page is not claimed (menu-patch `playerObs` is out of this item).
