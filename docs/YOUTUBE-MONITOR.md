# YouTube host-drift monitor

YouTube changes class names, menu trees, caption windows, and timedtext tokens without notice. Two patches in this extension are **cat-and-mouse by design** (spec §3):

1. Hide native **Playback speed**
2. Inject **Dual / Color highlight / Center word** into Subtitles/CC

Everything else (WPM math, trim, ND hide-lists) is also host-coupled, but those two break the loudest.

This document is the automation plan. The first shipped slice is the **probe + fixtures**. Auto-PR patches come after the probe is boringly green.

## 1. What we watch

| Signal | How | Breaks |
|---|---|---|
| `.ytp-settings-menu .ytp-menuitem` labels | Live probe | Speed-hide, Dual inject |
| `.ytp-panel-title` / panel header text | Live probe | Captions-panel detection |
| `.ytp-menuitem-toggle-checkbox` metrics | Screenshot + computed style | Toggle clone |
| `.caption-window` / `.ytp-caption-segment` | Live probe | Overlay size/position |
| `/api/timedtext` json3 shape (`events[].segs[].utf8`, `tOffsetMs`) | Fixture captured from a known video | WPM engine |
| `yt-navigate-finish` still fires | Live probe | Video change / home freeze |
| `#guide-button` vs avatar | Live probe | ND must not swallow the account menu |
| Time display `.ytp-time-current` / `.ytp-time-duration` | Live probe | Clock pill sibling |

Selectors we currently bind are listed in `tests/host/selectors.json`. A probe that cannot find a required selector is a **red**, not a skip.

## 2. Nightly probe (planned)

`tests/live/probe.spec.js` — Playwright, Chrome, unpacked extension:

1. Open a video from `tests/live/videos.json`
2. Dump the settings-menu item labels (open the gear)
3. Dump the Subtitles/CC submenu labels
4. Record caption-window computed `fontSize`
5. Fetch one timedtext url from `ytInitialPlayerResponse` and save under `tests/fixtures/timedtext/<videoId>.json` if the schema hash changed
6. Click `#guide-button` and the avatar; assert only the guide is blocked when ND is on
7. Write `output/youtube-probe/<date>.json`

A schema hash change on timedtext or a missing selector opens a draft issue titled `host-drift: <signal>`.

## 3. Auto-patch (not yet)

After the probe has a week of baselines:

- Speed-hide: if a new localized label appears for playback speed, append it to `SPEED_LABELS` via a generated `content/host-labels.json`
- Caption panel: same for `CAPTIONS_LABELS`
- Never auto-merge. A human (Daniel) approves. The bot’s job is a failing test + a suggested label list

## 4. Manual tripwire

If a live session shows Dual in the **root** settings panel, or Playback speed visible, or WPM stuck at 0 until CC is toggled: that is host-drift until proven otherwise. Capture:

- video id
- screenshot of the menu
- `document.querySelector('.ytp-settings-menu')?.innerText`
- network line for `/api/timedtext`

Drop them in `output/youtube-probe/manual/`.

## 5. What we will not do

- Scrape YouTube at high rate
- Depend on unofficial InnerTube clients as the only timedtext path (the player hook stays primary)
- Treat a mock player in a local HTML file as real-host evidence
