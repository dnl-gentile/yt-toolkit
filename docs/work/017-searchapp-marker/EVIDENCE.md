# W-017 evidence

## The problem

The old `yt-no-distractions-ext` injects the *same* `#quiet-mode-toggle-button` into
`yt-search-bar.web.app`. The page therefore cannot use the button to tell which extension
a visitor has, and an update notice keyed on the button alone would nag people who are
already on YouTube Toolkit.

`content_script_searchapp.js` now stamps `data-yt-toolkit="<version>"` on `<html>` before
building the toggle, wrapped in try/catch — the marker is advisory, the toggle is not.

## 1. Integration suite

```
$ npm run test:integration
✔ the script sets data-yt-toolkit on the document element
✔ the marker carries the extension version
✔ the marker is set before the toggle is built, and cannot break it
✔ the manifest still runs this script on the quiet page
ℹ pass 13
ℹ fail 0
```

## 2. Real host — the live quiet page, extension loaded

Chromium with `--load-extension`, against `https://yt-search-bar.web.app` as it is
deployed today:

```
$ EXT="$(pwd)" node markercheck.mjs
marker on <html>  : 1.6.1
toggle injected   : true
page errors       : none
```

The marker carries the shipped version, and the toggle this script exists for still
appears — the addition did not displace it.

## 3. Mutation

```
$ # marker line removed from content_script_searchapp.js
$ npm run test:integration
✖ the script sets data-yt-toolkit on the document element
✖ the marker carries the extension version
✖ the marker is set before the toggle is built, and cannot break it
ℹ pass 10
ℹ fail 3
```
