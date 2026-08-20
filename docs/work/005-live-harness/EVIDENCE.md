# W-005 evidence

## Unit script untouched

```
npm test
```

Observed (excerpt):

```
> yt-toolkit@1.6.1 test
> node --test tests/*.test.js

ℹ tests 25
ℹ pass 25
ℹ fail 0
```

`package.json` still has `"test": "node --test tests/*.test.js"`. Name remains `yt-toolkit`.

## Live probe (real host)

```
npx playwright install chromium
npx playwright test tests/live/probe.spec.js --project=chromium
```

Observed 2026-08-20, repo root, Playwright `@playwright/test@1.62.1`, channel `chromium`, headless:

```
[probe] extension /Users/dnl_gentile/Projects/yt-toolkit service worker: chrome-extension://adiknojcedfoifbgjcelohhoofajlbhi/background.js
[probe] settings-menu labels: ["Stable Volume","Annotations","Subtitles/CC English","Sleep timer Off","Playback speed Normal","Quality Auto (240p)"]
  ✓  1 [chromium] › tests/live/probe.spec.js:87:3 › live YouTube probe › loads unpacked extension and #qt-cluster on a watch URL (5.0s)

  1 passed (10.8s)
```

Would fail if reverted: `npx playwright test tests/live/probe.spec.js --project=chromium` (missing spec / config / `@playwright/test`).

This slice does not patch menus. Native **Playback speed** still appearing in the dump is expected.

## Harness files

- `tests/host/selectors.json` — YOUTUBE-MONITOR.md §1
- `tests/live/videos.json` — TED `iG9CE55wbtY`, MrBeast `Af6i6ChAVTw`, short `jNQXAC9IVRw`; all `hasAsr: true`
- `tests/live/probe.spec.js` — persistent Chromium, `--disable-extensions-except` + `--load-extension` = repo root
- `tests/live/README.md` — commands above
- `tests/fixtures/.gitkeep`
- `playwright.config.js` — `chromium` project
- `package.json` `test:live`
