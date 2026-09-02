# W-019 — closing out the Codex handoff

## Why

A ~3.5 h session by another agent ran out of credit mid-flight. Its work was **entirely
uncommitted**, in the main checkout, on a base nine commits behind `main`: 92 files, 20,678
insertions. One `git checkout` would have taken all of it. That was the first thing fixed —
committed verbatim as `6717cfc`, before anything was reviewed or changed, so that the rest of
this could be done without the work being at risk.

Its own summary reported everything green. The numbers it quoted were true — unit 99/99,
browser 86/86 — but the conclusion was not, and the gap between the two is the theme of this
work item.

## What the reported-green state actually was

**CI had never run on that branch, and it was red.** `docs/work/008-captions-overlay/check.mjs`
had been added to the CI unit job by that same session and never executed: none of `npm test`,
`test:browser` or `test:integration` invoke it. It exits 1 on 5 failed assertions. The first CI
run of the work came back red on both operating systems.

None of the 5 were behaviour regressions. That checker asserts by regex against the *source
text* of `content/captions.js`, which the session had refactored to 1207 lines, so every
assertion pinning an exact statement shape broke while the behaviour it stood for survived
elsewhere. The one genuine change — captions.js gained a player-lifecycle observer — failed an
assertion that was stricter than SPEC §9 rather than a rule the code broke.

**The suite was flaky**, and blaming machine load was wrong: three runs with the machine quiet,
all at the normal ~100 s, gave 86/86, 85/86, 85/86 with failures in ~550 ms. Fast assertion
failures at normal duration are not contention. Two tests read the pace pill with a one-shot
`page.evaluate` after a fixed 400 ms sleep, while `content/pace.js` paints the label from a
280 ms interval.

**A test was written to pass in exactly the case it existed to catch.** The live probe asserted
WPM > 0 only when some timedtext body came back non-empty, and otherwise logged and passed —
but "every body empty" is the precise shape of the reported bug. `W-010`'s evidence records the
strict variant going red and attributes it to the environment, while the non-strict variant
passed and counted toward green.

## What was fixed

| | Evidence |
|---|---|
| No Distractions reverted itself on every page load | failing-first, mutation removes the fix → 2 of 3 red |
| The stale CI gate | 3 mutations, each caught |
| Caption re-arm needs no CC toggle | fixture endpoint that answers only with a token; mutation → red |
| Suite flakiness | 6/6 isolated, 5/5 full runs |
| Shorts caption rows losing their content | measured defined vs undefined element |
| Shorts pace menu painted from the watch surface | reproduced, mutation |
| Observer budget 3/7 → 2/2 | live count on a three-reel page, both halves mutated |
| PRIVACY.md silently omitted a whole host | new gate, 2 mutations |

## What is deliberately still open

- The caption re-arm fix is proven against a fixture and mutation-checked, but **not validated
  live**: a headless Chromium receives empty timedtext bodies regardless, so whether YouTube
  accepts the player-response token in a real signed-in session is untested here.
- `W-013` and `W-015` remain `implemented_pending_live_acceptance` by their own declaration.

## Spec sections

- `docs/SPEC.md` supersession 2026-08-31 — allow-listed third-party players (§2), captions on
  Shorts (§9), the one-value Shorts pill
- `docs/SPEC.md` §5 invariant 8, §7 — the re-arm fix acquires without touching caption state
- `docs/SPEC.md` §9, `docs/QUALITY.md` §2 — the observer budget
- `docs/QUALITY.md` §1 — the evidence bar this work item exists to satisfy
