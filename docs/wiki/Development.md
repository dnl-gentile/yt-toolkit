# Development

## Setup

```bash
git clone https://github.com/dnl-gentile/yt-toolkit.git
cd yt-toolkit
npm install
```

There is **no build step**. The repository is the extension. Load it at
`chrome://extensions` → Developer mode → **Load unpacked** → the repo root.

After an edit:

| Changed | What to reload |
|---|---|
| `content/`, `lib/`, `content_script_*.js`, CSS | Refresh the YouTube tab |
| `background.js`, `analytics.js`, `manifest.json` | Reload icon on the extension card, then refresh the tab |
| `options.html` / `options.js` / `options.css` | Reopen the options page |

## Tests

```bash
npm test                  # unit — pure functions, no Chrome, no network
npm run test:integration  # manifest wiring, menu injection, telemetry gate
npm run test:visual       # Playwright screenshots vs blessed baselines
npm run test:live         # real YouTube, unpacked extension
```

The first two must pass before a pull request. CI runs both on every push, plus a syntax
check across every script that ships.

### Live probe

```bash
npx playwright install chromium
npm run test:live
```

It loads the unpacked extension from the repo root and opens a public captioned video
from `tests/live/videos.json`.

| Variable | Effect |
|---|---|
| `YT_TOOLKIT_EXT=/abs/path` | Load the extension from elsewhere |
| `PW_CHANNEL=chrome` | Use installed Chrome instead of bundled Chromium |
| `HEADED=1` | Watch the window |

This job is **manual/nightly**, never a required pull request check — YouTube is not a
stable CI host. A clear block/consent/login message is an acceptable skip; a missing
`#movie_player` is treated as a host block, not a product failure.

## The evidence bar

The one rule, from
[`docs/QUALITY.md`](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/QUALITY.md):

> A claim about behavior needs a command that would fail if the change were reverted.

Four separate states, and a pull request says which one it reached:

| State | Meaning |
|---|---|
| Planned | Written in the spec or a work item |
| Implemented | Code exists |
| Tests green | `npm test` passed on this commit |
| Real-host verified | Checked on a live watch page with the extension loaded |

A unit suite that never touches YouTube cannot close a visual or menu item. A screenshot
cannot close a WPM invariant.

## Tiers

| Tier | Scope | Required |
|---|---|---|
| **S** | Bug with a failing test, one module | The failing test, then the fix |
| **M** | UI, captions, No Distractions, menu injection | Independent review of the diff; screenshot if layout moved |
| **L** | WPM / lock / trim math, anything that can freeze a tab | Tests first, refutation review, mutation of the invariant tests |

## Mutating the WPM tests

Required at least once per change to the WPM engine. Invert the invariant assertion in
`tests/wpm.test.js` — the "slow 80 WPM speech must not read as ≥ 150" one — confirm the
suite goes red, restore it, and paste both outputs into your `EVIDENCE.md`.

A test that stays green when you break the thing it guards is decorative. This is how we
find out.

The same discipline applies to the telemetry gate in
`tests/integration/telemetry.test.js`: remove the `isEnabled()` check and two tests must
go red.

## Work items

Non-trivial changes get `docs/work/NNN-slug/`:

```
docs/work/007-my-change/
  metadata.yaml   # id, tier, paths_owned, status
  WORK.md         # what and why, pointing at docs/SPEC.md sections
  EVIDENCE.md     # commands and their actual output
```

`paths_owned` exists so two concurrent contributors do not both edit `content/pace.js`.
Overlap is a bug, not a merge conflict to sort out later.

## The performance budget

On a watch page:

- At most **2** `MutationObserver` instances attached while idle
- **No** `subtree: true` observer on `document.body`
- One rAF/watchdog pair for pace and captions; the menu patch runs only while
  `.ytp-settings-menu` is open
- Logo click to a responsive document in **under 2 s**

These are not aspirations. Each corresponds to a bug that once froze the tab.

## Never do these

- Reintroduce a per-word duration floor (`n * 0.28`, `n * 0.4`) in timedtext spreading
- `MutationObserver` on `document.body` with `subtree: true`
- Rewrite the native caption DOM
- Force CC on to obtain timedtext
- Stack the pace menu on `.ytp-settings-menu`
- Treat `#avatar-btn` or the account renderer as `#guide-button`
- Duplicate a player setting onto the options page

Each one is a bug that already shipped once.

## Packaging

```bash
npm run package   # -> dist/yt-toolkit-<version>.zip
```

Copies only what the extension loads, syntax-checks every script in the staged copy, and
refuses to build if `manifest.json` and `package.json` disagree on the version.

## Editing this wiki

**Do not edit pages in the GitHub wiki UI.** The sources live in
[`docs/wiki/`](https://github.com/dnl-gentile/yt-toolkit/tree/main/docs/wiki) and are
published with:

```bash
npm run wiki:publish
```

An edit made in the wiki UI is overwritten by the next publish.
