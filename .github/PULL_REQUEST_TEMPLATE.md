## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

Closes #

## Tier

<!-- docs/QUALITY.md §3 -->

- [ ] **S** — bug with a failing test, single module
- [ ] **M** — user-visible UI, captions, No Distractions, menu injection
- [ ] **L** — WPM / lock / trim math, or anything that can freeze a YouTube tab

## State reached

<!-- These are separate. Check honestly — an unchecked box is fine, a wrong one is not. -->

- [ ] Implemented
- [ ] `npm test` green on this commit
- [ ] `npm run test:integration` green on this commit
- [ ] Verified on a real `youtube.com/watch` page with the extension loaded

## Evidence

<!--
Paste the actual command output — not a paraphrase, not "all tests pass".
docs/QUALITY.md §1: a claim needs a command that would fail if this change were reverted.
-->

```
$ npm test

```

## For L-tier changes: mutation check

<!--
Invert the invariant assertion, confirm the suite goes red, restore it, paste both.
This is how we know the test is load-bearing.
-->

```

```

## Spec and docs

- [ ] Behavior matches `docs/SPEC.md` — or the spec gains a **dated supersession note** in this PR
- [ ] `CHANGELOG.md` updated
- [ ] `PRIVACY.md` updated (**required** if anything about telemetry changed)
- [ ] Work item added under `docs/work/NNN-slug/` (non-trivial changes)

## Checklist

- [ ] No `MutationObserver` on `document.body` with `subtree: true`
- [ ] No per-word duration floor (`n * 0.28`, `n * 0.4`) reintroduced in timedtext spreading
- [ ] Native caption DOM is read, not rewritten
- [ ] CC is not forced on to obtain timedtext
- [ ] Our menu does not stack on `.ytp-settings-menu`
- [ ] The account / avatar menu still opens with No Distractions on
- [ ] No player setting duplicated onto the options page
