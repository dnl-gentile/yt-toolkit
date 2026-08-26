# W-007 evidence

All commands run from the repo root on this commit.

## 1. Unit suite unaffected

```
$ npm test
✔ baseWpm median (0.713416ms)
ℹ tests 35
ℹ suites 11
ℹ pass 35
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1182.816666
```

## 2. Integration suite, including the new telemetry gate

```
$ npm run test:integration
> node --test tests/integration/*.test.js

✔ manifest loads dual-lang before menu/captions (8.303916ms)
✔ pace menu switch is qt-switch only (not YouTube checkbox class) (2.589375ms)
✔ no network call when the user opted out (7.8385ms)
✔ sends when the key is absent (documented default: on) (6.674458ms)
✔ sends when explicitly opted in (9.327875ms)
✔ no storage at all means no reporting (6.536166ms)
✔ resetClientId forgets the installation id (14.399708ms)
✔ the opt-out has a surface: manifest declares an options page that exists (1.439166ms)
✔ install defaults declare qt_telemetry (9.253709ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## 3. Mutation of the telemetry gate (QUALITY.md §5)

The opt-out is only real if a test fails when it is removed. Gate deleted from
`Analytics.sendEvent`, suite re-run, gate restored.

```
$ # gate removed from Analytics.sendEvent
$ npm run test:integration
✔ manifest loads dual-lang before menu/captions (1.6395ms)
✔ pace menu switch is qt-switch only (not YouTube checkbox class) (7.043167ms)
✖ no network call when the user opted out (9.526667ms)
✔ sends when the key is absent (documented default: on) (7.467625ms)
✔ sends when explicitly opted in (4.358875ms)
✖ no storage at all means no reporting (3.563542ms)
✔ resetClientId forgets the installation id (3.996291ms)
✔ the opt-out has a surface: manifest declares an options page that exists (9.338375ms)
✔ install defaults declare qt_telemetry (1.225458ms)
ℹ tests 9
ℹ pass 7
ℹ fail 2
✖ failing tests:
✖ no network call when the user opted out (9.526667ms)
✖ no storage at all means no reporting (3.563542ms)

$ # gate restored
$ npm run test:integration
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

The gate is load-bearing: removing it turns two tests red.

## 4. Release package builds and every shipped script parses

```
$ npm run package
dist/yt-toolkit-1.6.1.zip
  31 files,  92K
Load unpacked from the repo root for development.
Upload this ZIP for a GitHub release or a Chrome Web Store submission.
```

## 5. Licence is declared where tools look for it

```
$ head -2 LICENSE
                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

$ node -p "require(\"./package.json\").license"
GPL-3.0-or-later

$ grep -rl "SPDX-License-Identifier" --include="*.js" --include="*.css" --include="*.html" . | grep -v node_modules | sort
analytics.js
background.js
options.css
options.html
options.js
```

## 6. Real-host verification of the options page (QUALITY.md §1)

Not a mock: Chromium launched with `--load-extension` pointed at the repo, the real
service worker running, the options page opened at its `chrome-extension://` URL.

```
$ EXT="$(pwd)" node optcheck.mjs
extension id: eeilpiaeeehlfmaibmffjalpghkcbajm
title           : YouTube Toolkit — Options
version shown   : 1.6.1
checkbox exists : true
checked default : true
after click     : false
status text     : "Usage statistics off. Nothing is sent."
storage         : {"qt_telemetry":false}
reset status    : "Installation ID reset."
errors          : none
```

The line that matters is `storage`. The click did not merely flip a checkbox in the DOM —
it wrote `qt_telemetry: false` into `chrome.storage.sync`, which is the same key
`Analytics.isEnabled()` reads. The surface and the gate are connected.

`checked default : true` confirms the documented default; `errors : none` covers both
`pageerror` and console errors.

Screenshot: `docs/media/options.png` (tier M, `QUALITY.md` §2 — a new visible surface).
