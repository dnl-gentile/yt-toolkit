# YouTube host-drift monitor

YouTube changes class names, menu trees, caption windows, and timedtext tokens without notice. Two patches in this extension are **cat-and-mouse by design** (spec §3):

1. Hide native **Playback speed**
2. Inject **Dual / Color highlight / Center word** into watch Subtitles/CC,
   and **Color highlight / Center word** into the distinct Shorts captions
   surface

Everything else (WPM math, trim, ND hide-lists) is also host-coupled, but those two break the loudest.

This document is the automation plan. The first shipped slice is the **probe + fixtures**. Auto-PR patches come after the probe is boringly green.

## 1. What we watch

| Signal | How | Breaks |
|---|---|---|
| `.ytp-settings-menu .ytp-menuitem` labels | Live probe | Speed-hide, Dual inject |
| `.ytp-panel-title` / panel header text | Live probe | Captions-panel detection |
| `.ytp-menuitem-toggle-checkbox` metrics | Screenshot + computed style | Toggle clone |
| Selected language label background/SVG | Live probe + computed style | Native Dual check geometry/mask |
| `.caption-window` / `.ytp-caption-segment` | Live probe | Overlay size/position |
| `/api/timedtext` json3 shape (`events[].segs[].utf8`, `tOffsetMs`) | Fixture captured from a known video | WPM engine |
| `yt-navigate-finish` still fires | Live probe | Video change / home freeze |
| `#guide-button` vs avatar | Live probe | ND must not swallow the account menu |
| Time display `.ytp-time-current` / `.ytp-time-duration` | Live probe | Clock pill sibling |
| `.ytp-left-controls .ytp-volume-area` (fallback `.ytp-chapter-title`) | Live probe + computed style | Toolkit chip background, radius, height, shadow and blur |
| Legacy `ytd-shorts-player-controls` or current `ytd-shorts-player-controls-cow.ytdShortsPlayerControlsHost`; `#left-controls` / `.ytdShortsPlayerControlsLeftControls`; `#right-controls` / `.ytdShortsPlayerControlsRightControls`; `volume-controls` | Live probe + rendered geometry/effective opacity | Shorts pace-chip lane, native height, volume compression, fade and fail-closed behavior |
| Visible document-level Shorts `[role="menu"]` + `[role="menuitemradio"]` rows headed `Captions` | Live probe + structure/paint snapshot | Shorts Highlight/Center injection; this surface is outside `#shorts-player` and is not a `.ytp-settings-menu` |

Selectors we currently bind are listed in `tests/host/selectors.json`. A probe that cannot find a required selector is a **red**, not a skip.

## 2. Nightly probe (planned)

`tests/live/probe.spec.js` — Playwright, Chrome, unpacked extension:

1. Open a video from `tests/live/videos.json`
2. Dump the settings-menu item labels (open the gear)
3. Dump the Subtitles/CC submenu labels
4. Record caption-window computed `fontSize`
5. Record the native selected-language check source and the native chip paint used by Toolkit
6. On Shorts, hover the volume surface and then move away; record left/right lane geometry plus native/Toolkit effective opacity and interactivity in expanded and faded states. Open the external Captions surface and assert exactly the two Shorts Toolkit rows, with native row geometry/paint and no Dual row
7. Fetch one timedtext url from `ytInitialPlayerResponse` and save under `tests/fixtures/timedtext/<videoId>.json` if the schema hash changed
8. Click `#guide-button` and the avatar; assert only the guide is blocked when ND is on
9. Write `output/youtube-probe/<date>.json`

A schema hash change on timedtext or a missing selector opens a draft issue titled `host-drift: <signal>`.

## 3. Auto-patch (not yet)

After the probe has a week of baselines:

- Speed-hide: if a new localized label appears for playback speed, append it to `SPEED_LABELS` via a generated `content/host-labels.json`
- Caption panel: same for `CAPTIONS_LABELS`; keep watch `.ytp-panel` and the
  external Shorts role-based surface as separate host contracts
- Never auto-merge. A human (Daniel) approves. The bot’s job is a failing test + a suggested label list

## 4. Manual tripwire

If a live session shows Dual in the **root** settings panel or in the Shorts
Captions surface, Playback speed visible, or WPM stuck at 0 until CC is
toggled: that is host-drift until proven otherwise. Capture:

- video id
- screenshot of the menu
- `document.querySelector('.ytp-settings-menu')?.innerText`
- network line for `/api/timedtext`

Drop them in `output/youtube-probe/manual/`.

## 5. What we will not do

- Scrape YouTube at high rate
- Depend on unofficial InnerTube clients as the only timedtext path (the player hook stays primary)
- Treat a mock player in a local HTML file as real-host evidence
