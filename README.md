# YouTube Toolkit (yt-toolkit)

Chrome extension: No Distractions + constant WPM pace, dual captions, word highlight.

Continues [yt-no-distractions-ext](https://github.com/dnl-gentile/yt-no-distractions-ext). Spec: [`docs/SPEC.md`](docs/SPEC.md). Quality: [`docs/QUALITY.md`](docs/QUALITY.md).

```bash
npm test
npm run test:integration
```


## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (or unzip `yt-toolkit.zip` first)

## What it does

- Masthead **No Distractions** toggle
- Homepage still redirects to the quiet search app
- Account / avatar menu is **not** blocked
- Overlay on the video: WPM + rate, same chrome pill as YouTube
- **Pace lock** turns the speedometer into a 120–600 WPM target
- **Trim silence** skips caption gaps
- Native **Playback speed** is hidden; ours is the source of truth
- **Dual subtitles** checkbox in the Captions menu
- **Color highlight** + dim unread words
- **Center word** (Spritz-style focus with context)

Shift+, / Shift+. adjust WPM when locked, × when unlocked.
