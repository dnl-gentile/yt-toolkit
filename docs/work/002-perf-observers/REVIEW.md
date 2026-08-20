# W-002 review (Thals Article VI, refutation)

Reviewer did not author this patch. `content_script_youtube.js` was not edited. Real-host was not run here either.

## Verdict

**FAIL**

The file no longer observes `document.body` and no longer uses `setInterval` hide loops. That is real progress. It is not enough. Remaining `subtree: true` targets are still huge (`#below`, `#comments`, `#secondary`, `#related`, `#panels`, `ytd-watch-metadata`, `#top-row` plus `ytd-masthead`), hide work still runs from those mutations, `EVIDENCE.md` states a `subtree` claim the file itself contradicts, and there is no test that would go red if the freeze sources returned. L-tier freeze work cannot close on grep of constructors.

## What did not refute

These claims hold in the file and are not findings:

- No `observe(document.body` (with or without `subtree`).
- No `setInterval` in `content_script_youtube.js`.
- Two `new MutationObserver` constructors in this file (`chromeObserver`, `watchObserver`). Function declarations are hoisted; the constructors are not undefined at init.
- `#movie_player` is `childList` + `subtree: false`. Caption/progress ticks nested under the player should not re-enter hide work. `watchMutationIsRelevant` further ignores player `childList` unless an added node looks like endscreen/videowall/autonav.
- `redirectToQuietApp` sets `isUnloading` / `isNavigating`, `clearPendingTimeouts`, `disconnectObservers` (including cancelled rAF), then `location.replace`. Logo capture handler `preventDefault` + `stopImmediatePropagation` before that.
- Hide path uses `shouldSkipDomWork()` (`isUnloading || isNavigating`) in `attachObservers`, chrome/watch rAF, `applyNoDistractionsToNavbar`, `collapseLeftSidebar`, `removeSuggestions`, `removeComments`, `hideActionButtons`, `removeEndScreenRecommendations`, `enableTheaterMode`, `replaceVerificationTags`.
- Guide click interceptor returns early when `e.target.closest('#end, #avatar-btn, ytd-topbar-menu-button-renderer, #buttons')`.
- `inThisVideoOpen` + capture-phase engagement click handler are present.
- Guide interceptor is single-bind (`guideButtonClickInterceptorAdded`). Logo and engagement listeners are registered once at IIFE end. Observers are `disconnect()`ed before re-`observe()`.

## Findings

### 1. HIGH — remaining freeze: `subtree: true` on huge watch trees, hide work on those mutations

`collectWatchInnerTargets` still attaches `#secondary`, `#related`, `#comments`, `#below`, `#panels`, `ytd-watch-metadata`, `#top-row`. `attachObservers` sets `subtree = node.id !== 'columns' && node.id !== 'primary'`, so every one of those is `subtree: true`.

YouTube still hydrates comments and related **while they are `display: none`**. Those mutations are not under `#movie_player`, so `watchMutationIsRelevant` returns `true` immediately. The rAF then runs `attachObservers`, `removeComments`, `removeSuggestions`, `removeEndScreenRecommendations`, `hideActionButtons`, and `replaceVerificationTags`. Coalescing to one frame does not make document-wide `querySelectorAll` + `getComputedStyle` cheap.

This is the same class of bug as `document.body { subtree: true }`, on a slightly smaller root. `#below` *is* the comments/description column. Observing both `#below` and `#comments` with subtree is redundant and still huge.

`ytd-masthead { childList, subtree: true }` remains. Search suggestions, menus, and chips live there. Every suggestion `childList` schedules chrome rAF: `ensureSearchAutocompleteVisible` (more `getComputedStyle`), `applyNoDistractionsToNavbar`, `collapseLeftSidebar` (forced layout on `#guide`), `updateIcon` → `isLightTheme` → `getComputedStyle(document.body)`.

SPEC §9 forbids body+subtree and overlapping hide intervals. It **allows** one observer on `#movie_player` / `ytd-masthead` / `ytd-watch-flexy` as they appear. Extra inner observes with subtree are not on that allow-list.

**Rule/test that would fail:** a static parse of `content_script_youtube.js` (or a jsdom observer spy) asserting:

- the only `subtree: true` observe is `ytd-masthead`;
- `#below`, `#comments`, `#secondary`, `#related`, `#panels` are never observed with `subtree: true`;
- a fixture that appends 50 child nodes under `#comments` / `#related` does not invoke `removeComments` / `replaceVerificationTags`.

`grep -n "subtree:" content_script_youtube.js` already fails the EVIDENCE sentence “The only `subtree: true` is `ytd-masthead`” (see finding 2). That command is the mutation that should be in `EVIDENCE.md` and is not.

### 2. HIGH — `EVIDENCE.md` claims the listed greps do not prove; one claim is false

Commands actually run:

- `MutationObserver|setInterval|document.body`
- `observe(document.body`
- `grep -c "new MutationObserver"`
- `grep -n setInterval`
- `node --check`

Those prove: two constructors in this file, no `setInterval` here, no `observe(document.body`, the file parses. They do **not** prove:

| Claim | Why the grep does not prove it |
|---|---|
| “The only `subtree: true` is `ytd-masthead`” | `subtree` was not grepped. The claim is **false** (finding 1). The pasted `observe(` excerpt even truncates `watchObserver.observe(node, {` so the `subtree: subtree` line is hidden. |
| “Two MutationObserver instances at most” / QUALITY idle budget ≤ 2 | Constructor count in one file ≠ instances attached on a watch page. `content/yt-menu-patch.js` constructs `playerObs` at boot on `#movie_player` and `menuObs` while settings are open. Idle watch page ≥ 3 observers. |
| “Hide/restore bail out while `isUnloading` / `isNavigating`” | Not grepped. Hide does. Restore does **not** check `isNavigating` (finding 4). `handlePageDataUpdated` clears `isNavigating` before finish (finding 3). |
| “Guide intercept still ignores `#end` / `#avatar-btn`” | Not in the command list. Present in code; untested (finding 6). |
| “`inThisVideoOpen` + engagement-panel click interceptor kept” | Not in the command list. Present in code; interceptor is narrower than SPEC (finding 7). |
| “logo click < 2 s / avatar menu / In this video” | EVIDENCE itself says real-host was **not** run. QUALITY §1: not verified. |

QUALITY §1: a claim needs a command that would **fail if the change were reverted**. Re-introducing `subtree: true` on `#below` would still leave every listed command green. Re-introducing `observe(document.body` would fail `observe(document.body` — that one command is load-bearing for the body ban only.

**Rule/test:** evidence commands must include `grep -n "subtree:" content_script_youtube.js` (must not match `#below`/`#comments`/`#secondary` with true) and `grep -n "new MutationObserver" content_script_youtube.js content/yt-menu-patch.js` (idle budget). A reviewer re-running the current EVIDENCE script cannot distinguish this patch from one that observes `#comments` with subtree.

### 3. HIGH — `yt-page-data-updated` undoes the navigate skip and re-enters hide mid-SPA

```
function handlePageDataUpdated() {
  if (isUnloading) return;
  isNavigating = false;
  attachObservers();
  ... collapseLeftSidebar / applyNoDistractionsToVideoPage ...
}
```

`handleNavigateStart` sets `isNavigating = true` and disconnects. `isUnloading` is set only when `pathFromNavigateEvent` yields `/` or `/feed`. If detail.url is empty (common), home navigation does **not** set `isUnloading`. Then `yt-page-data-updated` (often before `yt-navigate-finish`) clears `isNavigating` and runs attach + hide against a DOM YouTube is still tearing down. That is the logo/home freeze class: hide/restore during navigate.

`later()` callbacks only skip on `isUnloading`, not `isNavigating`. `scheduleAttachRetries` wrappers check `shouldSkipDomWork`, so those are fine **until** finding 3 clears the flag early. `handleNavigateStart` does not `clearPendingTimeouts` unless the path looked like home, so video→video retries from the previous page remain armed.

**Rule/test:** dispatch `yt-navigate-start` then `yt-page-data-updated` before `yt-navigate-finish`; assert observers stay disconnected and hide functions are not called while start has fired and finish has not. A second case: `yt-navigate-start` with empty `detail.url` while `location.pathname === '/'` must still set `isUnloading` / skip hide.

### 4. MED — restore is not skipped during navigate

`restoreNavbarButtons` has no unload/navigate guard. `restoreLeftSidebar`, `restoreSuggestions`, `restoreComments`, `restoreEndScreenRecommendations`, `showActionButtons`, `restoreAllHiddenElements` check `isUnloading` only.

Logo/home sets both flags, so that path is covered **if** `redirectToQuietApp` ran. SPA video→video and the empty-path home case (finding 3) leave `isUnloading` false. Restore from `scheduleRestoreAfterDisable` / `applyCurrentMode` can then `querySelectorAll` + `getComputedStyle` + synthetic `resize` + `guideButton.click()` while YouTube is swapping the watch tree.

**Rule/test:** every restore\* function must return when `shouldSkipDomWork()` is true. Unit: set `isNavigating`, call restore, assert no `querySelectorAll` / no `click()` on `#guide-button`. Why a test, not “looks right”: this is exactly the freeze QUALITY live item (“navigate to `/` with ND on does not leave the tab unresponsive”).

### 5. MED — QUALITY idle observer budget is still missed on a real watch page

QUALITY.md Performance: “≤ 2 MutationObserver instances attached at idle”.

At idle `/watch` with ND on:

1. `chromeObserver` (masthead + `#guide` + `<html>`)
2. `watchObserver` (flexy + inners + player)
3. `yt-menu-patch.js` `playerObs` on `#movie_player` (`childList` only, always on after boot)

`menuObs` is extra while `.ytp-settings-menu` is open (allowed). `playerObs` is not.

This slice did not own `yt-menu-patch.js`. That does not make the budget true. EVIDENCE presents constructor count `2` as the budget.

**Rule/test:** live or jsdom count of `MutationObserver` objects with active registrations after `yt-navigate-finish` + 1 s, settings menu closed, `document.hidden === false`. Must be ≤ 2. Why not waive: QUALITY states the budget as an invariant; W-002’s tier rationale is that budget.

### 6. MED — avatar / guide: code looks right; QUALITY-required test is absent

Interceptor matches `#guide-button` (and EN/PT `aria-label`) then **excludes** `#end` / `#avatar-btn` / `ytd-topbar-menu-button-renderer` / `#buttons`. Static read: avatar clicks in the masthead end cluster should not `preventDefault`.

QUALITY §2 Integration, every ND PR: “ND does not match the avatar button as `#guide`”. `tests/` has no such case. `tests/host/selectors.json` lists both selectors; `tests/live/probe.spec.js` never clicks them. AGENTS.md: do not block `#avatar-btn` as `#guide-button`. Without a test, a one-line deletion of the `#end` guard would ship.

Guide `aria-label` fallback is only English/Portuguese. Other locales still have `#guide-button`; that is not an avatar bug.

**Rule/test:** jsdom (or live probe item 6 in `docs/YOUTUBE-MONITOR.md`): fixture `ytd-masthead #end #avatar-btn` click with ND on → default not prevented, no `collapseLeftSidebar`. Sibling `#start #guide-button` click → prevented. Must live under `tests/` so `npm test` fails if the exclusion is removed.

### 7. MED — “In this video” still unproven; click interceptor can miss the control

`bindEngagementPanelClicks` only walks `closest('button, a, yt-button-shape, ytd-button-renderer, .ytp-button')`. YouTube’s “In this video” / chapters entry is often a chip (`yt-chip-cloud-chip-renderer`) or infocard row, not those tags. If the click never unhides `#secondary`, and YouTube also does not set `visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"` on a `ytd-engagement-panel-section-list-renderer` while the parent is `display: none !important`, the panel never opens.

The mutation path (`inThisVideoOpen` → `clearSecondaryHiddenStyles`) can recover **if** YouTube still flips the attribute on a hidden tree. That is an assumption, not evidence. SPEC §8 / acceptance 8 require the panel to open. EVIDENCE: real-host not run.

**Rule/test:** live: ND on, click “In this video” (or chapters / transcript). Assert `[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]` visible (width > 10 / not `display: none`). jsdom minimum: click a `yt-chip-cloud-chip-renderer` whose text is “In this video” must unhide `#secondary` the same as a `button`. If the chip path is declared out of scope, write that as a spec supersession — do not claim the interceptor “kept” the behavior.

### 8. MED — `replaceVerificationTags` is document-wide work on every relevant watch mutation

Called from `onWatchMutations` rAF. Selectors include `[class*="badge"]`, `[class*="chip"]`, `[class*="verified"]` over the **whole document**, then `textContent` on each match. Comment/related hydration (finding 1) therefore scans the player chrome for badges every frame while those trees fill.

Not caption-DOM rewrite (the forbidden loop), but it is “work on every [non-player] mutation” of the same cost class.

**Rule/test:** after a `#comments` childList, `document.querySelectorAll('[class*="chip"]')` must not be part of the observer callback. Gate tag rewrite on added nodes that already look like badges, or drop it from the watch observer entirely. A spy on `querySelectorAll` in a jsdom mutation test would fail today.

### 9. LOW — no L-tier tests at all; live logo budget not measured

QUALITY §3 L: tests first, independent review, mutation of the invariant. The freeze invariant here is “no huge-tree subtree observer + no hide during navigate + logo < 2 s to a responsive document”. `npm test` does not mention observers, ND, logo, or avatar. Reverting this entire rewrite would still leave `tests/*.test.js` green.

EVIDENCE records that logo < 2 s, avatar, and In this video were not run.

**Rule/test:** QUALITY live: ND on, click logo, next click on the quiet-app document (or cancelled `/`) succeeds in < 2 s with no `pageerror`. Plus finding 1’s static subtree test so unit CI fails without YouTube. Why both: a unit suite that never talks to YouTube cannot close this item (QUALITY §1); grep of `new MutationObserver` cannot close it either.

## Non-findings (checked, not charged)

- Syntax: `node --check` is a valid smoke, not a behavior proof.
- `#movie_player` caption filtering: intended and, on a static read, correct. Do not add a test that only greps the comment.
- Double-bind of logo/engagement: single IIFE registration. Not a leak.
- Unused `lastUrl`: dead state, not a freeze.
- `content/pace.js` / `captions.js` intervals: out of this file; they violate the “≤ 1 watchdog + rAF” line of the same QUALITY paragraph. Out of W-002 `paths_owned` except that EVIDENCE must not imply the page budget is met.

## Close criteria (for a later PASS)

1. Finding 1 static test red if `#below`/`#comments`/`#secondary` regain `subtree: true`.
2. `EVIDENCE.md` commands actually cover `subtree`, restore/`isNavigating`, and page-level observer count — and those commands fail on the current tree until the code changes.
3. `handlePageDataUpdated` does not clear `isNavigating` or attach/hide before `yt-navigate-finish`; restore\* uses `shouldSkipDomWork()`.
4. QUALITY avatar integration test exists and fails if the `#end` / `#avatar-btn` guard is deleted.
5. Live (or recorded) logo < 2 s and In this video opens, as already required by SPEC §8–10 and QUALITY §2.

Until then this slice stays **implemented**, not **tests green**, not **real-host verified**.
