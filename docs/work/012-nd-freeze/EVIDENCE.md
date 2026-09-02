# W-012 — evidence

## 1. Symptom

Opening YouTube froze the whole browser. The console stayed completely clean,
which rules out an exception and points at a saturated main thread.

## 2. Reproduction, before any fix

`tests/browser/nd-freeze.spec.js` mounts a masthead close enough to
YouTube's for the real code path to run, then counts mutations the extension
causes with the host completely idle.

A first version of the fixture was **vacuous**: it had no
`ytd-masthead #end #buttons`, so the toggle button never mounted and
`updateIcon()` returned at its `if (!noDistractionsButton)` guard. The
freeze tests passed for the wrong reason. Adding the mount point exposed it:

    masthead mutations in 2s with an idle host: 1200
      attributes:src:quiet-mode-toggle-icon            240
      childList::yt-quiet-mode-tooltip                 240   <- self-feeding
      attributes:aria-label:quiet-mode-toggle-button   240
      attributes:aria-pressed:quiet-mode-toggle-button 240
      attributes:data-no-distractions-hidden:...       120

240 records per writer over 2 s is 120/s: one full pass per animation frame,
forever.

    theater size-button clicks: 53

## 3. Root causes

1. **Self-feeding observer.** `chromeObserver.observe(masthead, { childList:
   true, subtree: true })`. `onChromeMutations` schedules a rAF that calls
   `updateIcon()`, which assigned `tooltip.textContent` unconditionally.
   Assigning `textContent` replaces the text node — a childList mutation
   inside the observed subtree — so the observer re-fired itself. The
   `chromeRaf` guard bounds it to once per frame, not to zero.
2. **Forced layout every frame.** Each pass ran `collapseLeftSidebar()`,
   which called `getComputedStyle()` and read `offsetWidth` for five
   selectors and rewrote seven `!important` style properties. YouTube keeps
   the `opened` attribute on `#guide`, so `isExpanded` stayed true even after
   the width was set to 0 and the work repeated indefinitely.
3. **Theater click storm.** `enableTheaterMode()` clicked when
   `label.includes('theater') || !label.includes('fullscreen')`. The
   right-hand side is true for an empty or unknown label, so any matched
   button was clicked — on `yt-page-data-updated`, on `yt-navigate-finish`,
   and on the 0/100/400/1000 ms retry ladder.

`watchInners` — an observer over `#comments` / `#related` / `#secondary`
reported to exist on the GitHub `main` — is **not** present in this folder.
The local `content_script_youtube.js` already carries the restricted
`ytd-watch-flexy` + `#movie_player` version with the SPEC §9 comment. No
change was needed there.

## 4. Fix

- `setAttrOnce` / `setStyleOnce` / `hideOnce` helpers; every masthead writer
  now tests before writing.
- `isOwnChromeMutation()`: a batch consisting only of our own control's
  records never schedules a pass. Two independent barriers.
- `addToggleButtonToNavbar()` no longer calls `updateIcon()` on the
  existing-button path; `onChromeMutations` already does.
- `collapseLeftSidebar()` returns early on a cheap inline-style check before
  touching `getComputedStyle` / `offsetWidth`.
- `enableTheaterMode()` requires an explicit theater/cinema/teatro label and a
  1500 ms cooldown, on both the direct and the `ytd-size-toggle-renderer`
  fallback paths.

## 5. After

    masthead mutations in 2s with an idle host: 0      (was 1200)
    theater size-button clicks:                 2      (was 53)
    zero-delay task lag p95:                    4.6ms

Mutation check — removing the tooltip idempotence alone does **not**
reintroduce the loop, because `isOwnChromeMutation` still stops it. Removing
**both** barriers does:

    masthead mutations in 2s with an idle host: 120 — [["childList::yt-quiet-mode-tooltip",120]]
    2 failed / 3 passed
    (restored)  5 passed

That is the defence-in-depth working, and it confirms the test pins the real
mechanism.

## 6. Real host

The live probe could not have caught this: it asserted a request budget and a
visible `#qt-cluster`, both of which pass happily while the main thread is
pinned. A responsiveness gate was added — zero-delay task lag plus a masthead
mutation ceiling.

Against the **pre-fix** `content_script_youtube.js`, on real YouTube:

    [probe] main-thread lag p95=5.4ms max=5.6ms; masthead mutations in 2s=944
    Error: masthead mutation storm: 944 records in 2s
    1 failed / 1 passed

Against the fixed tree, three consecutive runs:

    RUN 1  lag p95=5.2ms  masthead mutations in 2s=0   watch 5 / Shorts 8    2 passed
    RUN 2  lag p95=4.8ms  masthead mutations in 2s=0   watch 5 / Shorts 8    2 passed
    RUN 3  lag p95=5.0ms  masthead mutations in 2s=0   watch 5 / Shorts 10   2 passed

## 7. Gates on the final tree

    syntax      55/55
    unit        62/62
    integration  8/8
    browser     45/45
    visual       1/1
    checkers    W004, W006, W008 all pass
    git diff --check  clean
    live        3 consecutive runs, 2/2 each
