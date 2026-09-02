# W-019 evidence

All commands from the repo root on this commit.

## 1. Suites

```
$ npm test
ℹ tests 99
ℹ pass 99
ℹ fail 0

$ node --test tests/integration/*.test.js
ℹ tests 27
ℹ pass 27
ℹ fail 0

$ npm run test:browser
  89 passed (1.9m)

$ node docs/work/004-original-track/smoke.js   # ok
$ node docs/work/006-toggle-paint/check.mjs    # ok
$ node docs/work/008-captions-overlay/check.mjs # ok
$ npm run icons:check
icons ok
```

## 2. The CI gate that had never run

`docs/work/008-captions-overlay/check.mjs` was in the CI unit job and exits 1. The first CI run
of the branch, on both operating systems:

```
FAIL  slot identity via Dual.uniqueLangs
FAIL  requestLang(langs[1]) fires whenever a second slot is set
FAIL  zero qt_captionPos / new video resets to defaults
FAIL  CC Off always hides our overlay
FAIL  no MutationObserver
5 check(s) failed
##[error]Process completed with exit code 1.
```

All five were stale regexes against refactored source text. Repaired to assert the property
rather than the syntax, and mutation-checked so the repair is not a tautology:

```
break the CC-off gate                     -> FAIL CC Off always hides our overlay (SPEC §7)
add a document.body subtree observer      -> FAIL no document-root subtree observer
drop a normalizePos on a stored position  -> FAIL every qt_captionPos read is normalised
```

## 3. No Distractions reverting itself

Failing first, against the real `background.js` in a VM with genuinely separate storage areas:

```
AssertionError: No Distractions turned itself back on: the write did not reach
chrome.storage.local, so the stale `true` there outranks sync on the next page load
```

After the fix, 3/3. Mutation — remove the added local write:

```
ℹ pass 1
ℹ fail 2
```

## 4. Suite flakiness: measured, not guessed

First conclusion (machine load) was wrong. Three runs with the machine quiet:

```
run 1: 86 passed (100.08s)
run 2: 85 passed (99.17s)   ✘ no-asr-mode:309  (533ms)
run 3: 85 passed (101.13s)  ✘ no-asr-mode:296  (554ms)
```

Normal duration, sub-second failures — assertion races, not contention. After converting both
one-shot reads to retrying assertions, and then removing a read-after-check race introduced by
that first attempt:

```
isolated: 6/6      full suite: 5/5 (88 passed each)
```

Mutation — force `asrRhythm()` true so the unavailable state can never render:

```
✘ the pill marks WPM unavailable instead of inventing a number (5.5s)
```

so the retry did not make the assertion vacuous.

## 5. Caption re-arm

Red first, against a fixture endpoint that answers only when the request proves origin:

```
AssertionError: no request carried the player-response proof token:
["…&kind=asr&signature=TARGET&fmt=json3","…&kind=asr&signature=TARGET"]
```

Green after reading `serviceIntegrityDimensions.poToken`, with the same test asserting
`setOptions.length === 0` and CC still off. Mutation — remove the fallback: 4 pass, 1 fail.

**Not live-verified.** A headless Chromium receives empty timedtext bodies with or without the
extension, so this needs one real signed-in browser before it can be called done.

## 6. Shorts custom element

Measured directly, driving the same construction `makeShortsToggle` used:

```
element UNDEFINED (what every fixture has): {"labelSurvived":true,  "visibleText":"Color highlight"}
element DEFINED   (what real YouTube has):  {"labelSurvived":false, "visibleText":"native"}
```

`customElements.define` appears nowhere under `tests/`, which is why the suite could not see it.

## 7. Observer budget

Counted on a live three-reel Shorts page with the real content scripts loaded and nothing
happening:

```
before: {"instancesAttachedAtIdle":3,"totalRoots":7}   // six reel subtrees, in duplicate
after:  {"instancesAttachedAtIdle":2,"totalRoots":2}
```

`docs/QUALITY.md` §2 allows 2 at idle and already named `/shorts/:id`, so the budget did not
need relaxing. Mutation on both halves: restoring per-reel roots fails the browser budget test;
removing the broadcast fails the integration test.

## 8. PRIVACY.md accuracy

The policy claims to match the code. It had stopped: `manifest.json` grants
`https://tvweb3.unip.br/*` and injects two content scripts there, and the policy did not mention
the host at all. It also listed 10 of 23 storage keys.

Both corrected, and a gate added so it cannot drift again silently:

```
mutation A: add an undisclosed host to the manifest  -> 1 fail
mutation B: drop one disclosed key from the policy   -> 1 fail
             "stored but undisclosed: qt_vjs_slotsChosen"
```

## 9. Windows

`integration (windows-latest)` passes. The browser suite serves every page from `http://yt.test`
via Playwright route interception, so it never touches the real YouTube — which is what makes a
Windows result meaningful rather than a coin flip.

```
unit / smoke (ubuntu-latest)    pass
unit / smoke (windows-latest)   pass
integration (ubuntu-latest)     pass
integration (windows-latest)    pass
visual baselines                pass
icons                           pass
```
