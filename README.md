# YouTube Toolkit (yt-toolkit)

Chrome extension: No Distractions + constant WPM pace, dual captions, word highlight,
plus an allow-listed Video.js adapter for UNIP course videos.

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
- **Pace lock** turns the speedometer into a 120–800 WPM target (pills up to 600; slider to 800)
- **Trim silence** skips caption gaps
- Native **Playback speed** is hidden; ours is the source of truth
- CC, caption language(s), Dual/Color/Center, manual speed, Pace Lock target/state, and Trim persist to the next video
- WPM/Lock/Trim always follow hidden original-language auto-generated captions, even when CC is off; display translations never change the timing engine
- **Dual subtitles** checkbox in the Captions menu
- **Color highlight** + dim unread words
- **Center word** (Spritz-style focus with context)

### (`tvweb3.….br`)

- Manual speed pill, slider and presets follow the player’s 30px Video.js chrome
- `A` / `Shift+Backquote` toggle temporary 1×; `S` / `D` change speed by 0.25×
- The native clock is replaced by adjusted watch time while preserving the original total
- Dual subtitles use the Video.js caption tracks already loaded by the course player; primary is yellow and secondary is blue
- The Toolkit controls disappear with `vjs-user-inactive`, and the menu remains bounded inside narrow 471×265 players
- No Distractions is intentionally YouTube-only
- UNIP supplies cue/sentence timing rather than per-word timestamps. Pace Lock, Trim silence, Color highlight, Center word, and WPM remain visibly unavailable there instead of fabricating word timing

`A` / `Shift+Backquote` toggle between neutral 1× (Pace Lock and Trim off)
and the current custom pace settings. `S` / `D` and Shift+, / Shift+. decrease
or increase the active pace by 10 WPM with Lock, or by 0.25× in manual mode.
