# Troubleshooting

Work down the list. Most reports resolve in the first section.

## First, the two-minute check

1. **Reload the extension.** `chrome://extensions` → the reload icon on the YouTube
   Toolkit card. Then refresh the YouTube tab. This fixes most things after an update.
2. **Confirm the video has captions.** Click the CC button. If YouTube itself offers no
   track, the pace engine has nothing to measure — by design.
3. **Disable other extensions.** Other YouTube extensions, ad blockers and userscripts
   modify the same DOM. Turn them off, retest, turn them back on one at a time.
4. **Check the console.** F12 → Console on the watch page. Also
   `chrome://extensions` → Details → **Inspect views: service worker** for background
   errors. Anything red is worth pasting into a report.

---

## Nothing appears at all

**No pill, no masthead toggle, no new caption rows.**

- Is the extension actually enabled on the card at `chrome://extensions`?
- Are you on `https://www.youtube.com`? The extension does not run on `m.youtube.com`,
  `music.youtube.com`, `youtube-nocookie.com`, or embedded players on other sites.
- Did Chrome disable it on restart? Unpacked extensions sometimes get switched off after
  a browser update. The card will say so.
- Did the folder move or get deleted? Chrome loads it from that path every start. Load
  unpacked again.

## The pill is there but WPM stays 0

- **You are in a silence.** That is the correct reading. Wait for speech.
- **The video has no captions.** Nothing to measure.
- **The video is a live stream.** Live caption tracks arrive incrementally; behavior is
  untested.
- **Captions are burned into the image**, as on many re-uploads. There is no track to
  read.
- **You had to toggle CC to make it work.** That is a bug, not expected behavior — the
  extension is supposed to fetch the track without touching CC. Report it as
  [host drift](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose).

## Pace lock is on but the speed does not change

- **Check fixed 1× first.** If you pressed <kbd>A</kbd> (or <kbd>Shift</kbd>+<kbd>`</kbd>) at
  some point, everything is pinned to plain 1× and Pace lock is deliberately not driving the
  rate. That state is **global and persistent** — it survives the video ending, navigating
  away, and closing the browser — so it is easy to turn on, forget, and then wonder why the
  pace engine looks broken days later. The pill shows `1x`. Press the same key to leave it.
- The rate is clamped to **0.7×–4×**. If the speaker is already near your target, the correct
  rate is near 1× and nothing visibly happens.
- Rate changes ease in at ±0.05× per tick during speech. Give it a few seconds; it does
  not jump.
- Check whether another extension is also writing `playbackRate`. Two controllers fighting
  produces exactly this symptom.

## The video is stuck at 4× or 8×

Trim silence boosted for a gap and did not come back down. It is supposed to snap back on
the first spoken word.

Immediate workaround: turn **Trim silence** off in the pace menu.

Then please report it, with the video URL and roughly where in the video it happened.
This is a defect the project takes seriously — a boost riding into speech is explicitly
against the spec.

## The captions menu has no Dual / Highlight / Center rows

Or they appear in the **root** settings panel instead of under Subtitles/CC.

That is **host drift**: YouTube changed its menu markup and the injection is binding
wrongly. It is expected to happen occasionally — see
[`docs/YOUTUBE-MONITOR.md`](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/YOUTUBE-MONITOR.md).

Use the [host drift issue template](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose)
and include:

- the video URL
- **your YouTube interface language** — localized menu labels are a frequent cause
- a screenshot of the open menu
- the output of, with the gear menu open:

```js
document.querySelector('.ytp-settings-menu')?.innerText
```

## YouTube's Playback speed row is back

Same thing: host drift. The extension hides that row because its own speedometer is the
source of truth. Report it the same way.

## Our menu is stacked on top of YouTube's

Opening the pace menu should close YouTube's settings menu, and the reverse. If they
overlap, report it — that is a defect against the native-chrome contract.

## The account menu will not open with No Distractions on

A regression, and a serious one. Report it immediately with your extension version.

The extension is explicitly required to collapse only `#guide-button` and never to treat
the avatar as the guide.

## A YouTube tab froze

Report it with what you did just before — logo click, SPA navigation, settings click. The
performance budget says a logo click reaches a responsive document in under two seconds,
so a freeze is a budget violation, not a quirk.

## The watch clock flickers or shows a wrong total

The adjusted total is supposed to be stable, computed from the median base speaking rate
rather than the live oscillating one. Flickering, or a 57-minute video showing a two-minute
total, is a bug worth reporting with the video URL and your pace settings.

## Captions overlap the video's own on-screen text

Drag either caption line where you want it. Positions reset on each new video by design.

## My settings disappeared

Settings live in `chrome.storage.sync`, tied to your Chrome profile. They are lost if you
uninstall the extension, sign out of a different Chrome profile, or clear browsing data
including hosted app data. Reloading or replacing the extension folder does **not** lose
them.

## Still stuck

Open an issue with:

- the video URL where it reproduces
- extension version (`chrome://extensions`) and browser version
- console output, both page and service worker
- whether it survives with every other extension disabled

[File it here.](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose)
