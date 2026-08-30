# YouTube Toolkit

**Watch YouTube at a constant *speaking* rate, not a constant playback rate.**

YouTube Toolkit reads the captions of the video you are watching, measures how fast the
person is actually talking, and moves `playbackRate` so the words arrive at the pace you
picked. It also adds dual subtitles, word highlighting, and a No Distractions mode.

This wiki is the user manual. The repository holds the engineering contract:
[`docs/SPEC.md`](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/SPEC.md) is
product law and this wiki must never contradict it.

## Start here

| | |
|---|---|
| **[Installation](Installation)** | Load it unpacked in five steps |
| **[Pace and WPM](Pace-and-WPM)** | The main event — what the numbers mean and how the lock works |
| **[Captions](Captions)** | Dual subtitles, color highlight, center word |
| **[No Distractions](No-Distractions)** | What it hides, and what it deliberately does not |
| **[Keyboard shortcuts](Keyboard-Shortcuts)** | Two keys, and why the rest stay YouTube's |
| **[Troubleshooting](Troubleshooting)** | The pill is missing, WPM reads 0, the menu looks wrong |
| **[FAQ](FAQ)** | Short answers |
| **[Privacy and telemetry](Privacy-and-Telemetry)** | What is sent, and how to send nothing |

For contributors: **[Development](Development)** · **[Architecture](Architecture)** ·
**[Release process](Release-Process)**

## The idea in one paragraph

2× is a blunt instrument. It describes the *file*, not the *speech*. A slow, thoughtful
lecturer at 2× is still slower than an energetic YouTuber at 1×, and that YouTuber at 2×
is a blur. So you end up riding the speed control all day, and you still never listen at
a consistent rate.

Words per minute is the number that actually describes your experience. Set 180 WPM and
the extension solves for whatever playback rate keeps the speaker there — near 2× for the
lecturer, below 1× for the auctioneer, adjusting continuously as the speaking rate
changes within a single video.

## Requirements

- Chrome, Edge, Brave, Arc, or another Chromium browser. Manifest V3. Firefox is not
  supported.
- **The video needs captions.** Auto-generated ones are fine — that is what most videos
  have, and what the engine is tuned for. On a video with no captions of any kind there is
  nothing to measure, and the pace features stay quiet. The extension does not invent
  transcripts.
- No account, no login, no server. Everything runs in your browser.

## Status

Version **1.6.1**, not yet on the Chrome Web Store — install
[unpacked](Installation). Source and issue tracker:
[github.com/dnl-gentile/yt-toolkit](https://github.com/dnl-gentile/yt-toolkit).

Licensed **GPL-3.0-or-later**. It continues
[yt-no-distractions-ext](https://github.com/dnl-gentile/yt-no-distractions-ext), which was
the No Distractions half only.
