# Contributing to YouTube Toolkit

Thanks for wanting to help. This repo has a written contract and a real test suite, and
following them makes review fast.

## Before you write code

Read, in this order:

1. **[`docs/SPEC.md`](docs/SPEC.md)** — product law. If your change contradicts it, the
   spec gets a dated supersession note *in the same pull request*. Do not rewrite earlier
   decisions; append.
2. **[`docs/QUALITY.md`](docs/QUALITY.md)** — the evidence bar. Read §1 even if you read
   nothing else.
3. **[`docs/YOUTUBE-MONITOR.md`](docs/YOUTUBE-MONITOR.md)** — if your change touches menus,
   captions, timedtext, or the No Distractions selectors.
4. The neighboring code and its tests.

Chat transcripts, issue threads and commit messages are **not** sources of truth. The
files above are.

## Setup

```bash
git clone https://github.com/dnl-gentile/yt-toolkit.git
cd yt-toolkit
npm install
```

There is no build step. Load the clone at `chrome://extensions` → Developer mode → **Load
unpacked**, and hit the reload icon on the card after each edit. Content script changes
also need a page reload; service worker changes need the card reload.

## The one rule

> **A claim about behavior needs a command that would fail if the change were reverted.**

"Looks right on my machine" is not evidence. These four states are separate and a pull
request should say which one it reached:

| State | Meaning |
|---|---|
| Planned | Written in the spec or a work item |
| Implemented | Code exists |
| Tests green | `npm test` passed on this commit |
| Real-host verified | Checked against a live `youtube.com/watch` with the extension loaded |

A unit suite that never talks to YouTube cannot close a visual or menu item. A screenshot
cannot close a WPM invariant.

## Tests

```bash
npm test                  # unit — pure functions, no Chrome, no network
npm run test:integration  # manifest wiring, menu injection, telemetry gate
npm run test:visual       # Playwright screenshots vs blessed baselines
npm run test:live         # real YouTube (manual/nightly, not a required check)
```

`npm test` and `npm run test:integration` must pass before you open a pull request. CI runs
both plus a syntax check on every content script.

### What needs which

| Change | Minimum |
|---|---|
| A pure function in `lib/` | Unit test |
| Captions, menus, No Distractions selectors | Integration test |
| CSS or layout | Screenshot |
| WPM / pace lock / trim math | Unit test **first**, plus the mutation check below |
| Anything that could freeze a YouTube tab | Live probe evidence |

### Tiers

From `docs/QUALITY.md` §3:

- **S** — a bug with a failing test, one module. Just fix it.
- **M** — user-visible UI, captions, No Distractions, menu injection. Expect review of the
  diff.
- **L** — WPM/lock/trim math, or anything that can freeze YouTube. Expect a refutation
  review and a mutation of the invariant tests.

Non-trivial changes get a work item folder: `docs/work/NNN-slug/` with `metadata.yaml`
(id, tier, `paths_owned`, status), a `WORK.md`, and an `EVIDENCE.md` holding the actual
command output — not a paraphrase of it. Two concurrent contributors may not own the same
path.

## Touching the WPM engine

This is the part that has been wrong across many versions. It is load-bearing and it gets
extra process.

The invariants are `docs/SPEC.md` §5. The two that keep breaking:

1. **WPM = unique spoken words ÷ real spoken time.** No per-word duration floor. A
   `n × 0.28 s` floor is what made 80–120 WPM speech read as 180–214 WPM. Do not
   reintroduce it under any name.
2. **A pause of ~1.15 s or more with no word → displayed rate 0.** A 0.6 s threshold
   treats slow speech as silence and leaves trim boost stuck at 4×/8×.

Before claiming a WPM change works, **mutate the test**: invert the assertion in
`tests/wpm.test.js` (the "slow 80 WPM speech must not read as ≥ 150" one), confirm the
suite goes red, then restore it. Paste that output into your `EVIDENCE.md`. That is how we
know the test is load-bearing and not decorative.

## Never do these

From [`AGENTS.md`](AGENTS.md) — each one is a bug we already shipped once:

- Reintroduce a per-word duration floor (`n * 0.28`, `n * 0.4`) in timedtext spreading
- Put a `MutationObserver` on `document.body` with `subtree: true`
- Rewrite the native caption DOM (that loop froze the tab)
- Force CC on to obtain the timedtext track
- Stack our pace menu on top of `.ytp-settings-menu`
- Treat `#avatar-btn` or the account renderer as if it were `#guide-button` — the account
  menu must always open
- Duplicate a player setting onto the options page

## Performance budget

On a watch page (`docs/QUALITY.md` §2):

- At most 2 `MutationObserver` instances attached while idle
- No `subtree: true` observer on `document.body`
- One rAF/watchdog pair for pace and captions; the menu patch runs only while
  `.ytp-settings-menu` is open
- Logo click to a responsive document in under 2 s

## Pull requests

- Branch off `main`. One concern per pull request.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org) —
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- Fill in the pull request template. The evidence section is the point of it.
- If you changed behavior, update `docs/SPEC.md` and `CHANGELOG.md` in the same PR.
- If you changed what telemetry does, update `PRIVACY.md` in the same PR. Non-negotiable.

## Reporting bugs

Use the [issue templates](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose).

If YouTube's markup moved under the extension — Dual showing up in the wrong panel, the
native Playback speed row reappearing, WPM stuck at 0 until you toggle CC — that is
**host drift**, and it has its own template. Capture the video ID, a screenshot of the
menu, `document.querySelector('.ytp-settings-menu')?.innerText`, and the network line for
`/api/timedtext`. That turns a vague report into a one-line fix.

## Licence

By contributing you agree your contributions are licensed under
**GPL-3.0-or-later**, matching the project. New source files should carry:

```js
// SPDX-License-Identifier: GPL-3.0-or-later
```
