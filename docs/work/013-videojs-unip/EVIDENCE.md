# W-013 evidence

## Source inspection

- Real player root: `.video-js`; media element: `video#video1_html5_api.vjs-tech`
- Real player is embedded from `tvweb3.unip.br` in the UNIP AVA page
- Observed player sizes: approximately 738×415 CSS px and 471×264.94 CSS px
- Observed `.vjs-control-bar`: approximately 30 CSS px high
- The course bundle parses WebVTT into `{start,end,text}` cues and switches native `TextTrack.mode`; it exposes no per-word onset data

## Static and unit evidence

Run from the canonical checkout:

```bash
node --check content/videojs-main.js
node --check content/videojs.js
node --check lib/videojs.js
npm test
node --test tests/integration/*.test.js
```

Expected load-bearing checks:

- exact `tvweb3.unip.br` all-frame manifest scope
- UNIP content-script list excludes every YouTube/No-Distractions module
- A cue is selected only by its real start/end interval
- two language vacancies do not evict an occupied slot
- adapter contains no interval, rAF, fetch/XHR interception, or word-timing synthesis

Observed on 2026-08-26:

- `node --check` passed for the MAIN bridge, isolated adapter, and shared helpers
- `npm test`: 87 tests passed, 0 failed
- `node --test tests/integration/*.test.js`: 9 tests passed, 0 failed
- `git diff --check`: passed

## Local browser interaction and layout evidence

The adapter scripts were exercised in the user's Chrome against the deterministic
Video.js fixture. The following interactions stayed synchronized between the media
element, pill, menu value, and slider:

- `+`: 1× → 1.25×
- `D`: 1.25× → 1.5×
- `A`: temporary neutral 1×; a second `A` restored 1.5×
- slider: 1.85× committed without storage writes on every drag event
- clearing Portuguese left English in slot 2; selecting German filled the exact
  primary vacancy; a third language remained blocked until a slot was cleared

Measured layout:

| Player | Pill | Menu | Native bar | Menu/bar gap |
| --- | --- | --- | --- | --- |
| 738×415 | 30px high, top 8px | 310×333, y 44–377 | starts y 385 | 8px |
| 471×265 | 30px high, top 8px | 300×183, y 44–227 | starts y 235 | 8px |

The source screenshot and fixture screenshot were inspected together in one
comparison image. This establishes local geometry and interaction behavior, not
acceptance on the authenticated course host.

## Freeze-risk controls

- UNIP scripts run only on the exact `tvweb3.unip.br` host and do not load the
  YouTube or No Distractions modules
- the MAIN bridge performs one initial global discovery, then uses bounded local
  observers and media/text-track events
- track-list inspection, cue serialization, payload size, and message frequency
  are capped; full metadata is returned only for one outstanding request ID
- both bridge halves start before page scripts; the bridge locks its first
  per-frame channel, rejects late hello messages, and does not let later hello
  messages reset serialization state
- full metadata requests and caption-mode commands each have an absolute
  1.2-second gate; commands coalesce to the latest state instead of being dropped
- a player/media replacement clears the local cue snapshot immediately, so a new
  lesson cannot briefly render subtitles from the previous lesson
- slider movement avoids synchronous persistence on each input event
- there is no network interception, interval, or animation-frame loop

## Real-host gate

Pending. Reload the unpacked extension from the canonical checkout, refresh the
existing UNIP course tab, and capture the same player at the wide and narrow
states. Source screenshots alone do not establish implementation fidelity.
