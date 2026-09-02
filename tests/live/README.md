# Live / real-host Playwright probe

Loads the **unpacked extension from the repo root** and probes both a public
captioned YouTube watch URL from `videos.json` and a public `/shorts/:id` player.
The Shorts gate checks active-player ownership, top-center geometry, native
control clearance, menu interaction, CC invariance, request budget, and the
absence of the lower watch clock. It also advances to the next Short and
requires singleton reparenting plus menu close.

This job is **manual / nightly**, not a required PR check (see `docs/QUALITY.md` §4). A skip with a clear YouTube block/consent/login message is acceptable; a missing `#movie_player` is treated as a host block, not a product failure.

## Daniel's Mac

From the repo root (`~/Projects/yt-toolkit`):

```
npx playwright install chromium
npx playwright test tests/live/probe.spec.js --project=chromium
```

Or, after `npm install`:

```
npm run test:live
```

- Extension path = **repo root** (directory that contains `manifest.json`). Override with `YT_TOOLKIT_EXT=/absolute/path`.
- Default browser is Playwright's bundled Chromium (`channel: 'chromium'`), which still accepts `--load-extension`.
- Installed Chrome at `/Applications/Google Chrome.app` may be used via `channel: 'chrome'`:

```
PW_CHANNEL=chrome npx playwright test tests/live/probe.spec.js --project=chromium
```

Headed (watch the window):

```
HEADED=1 npx playwright test tests/live/probe.spec.js --project=chromium
```

Unit tests are unchanged: `npm test` → `node --test tests/*.test.js`.
