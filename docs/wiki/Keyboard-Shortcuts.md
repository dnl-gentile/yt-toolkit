# Keyboard shortcuts

The extension claims **two** key combinations. Everything else stays YouTube's.

## Ours

| Keys | Pace lock **off** | Pace lock **on** |
|---|---|---|
| <kbd>Shift</kbd> + <kbd>,</kbd> (i.e. <kbd><</kbd>) | −0.25× | −10 WPM |
| <kbd>Shift</kbd> + <kbd>.</kbd> (i.e. <kbd>></kbd>) | +0.25× | +10 WPM |

They only fire on `/watch` pages, and never while you are typing in a search box, a
comment field, or any other text input.

## YouTube's, untouched

| Keys | What |
|---|---|
| <kbd>Space</kbd> / <kbd>K</kbd> | Play / pause |
| <kbd>J</kbd> / <kbd>L</kbd> | Back / forward 10 s |
| <kbd>,</kbd> / <kbd>.</kbd> (no Shift, paused) | Previous / next frame |
| <kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>Shift</kbd>+<kbd>N</kbd> | Previous / next video |
| <kbd>←</kbd> / <kbd>→</kbd> | Back / forward 5 s |
| <kbd>C</kbd> | Toggle captions |
| <kbd>T</kbd> | Theater mode |
| <kbd>F</kbd> | Fullscreen |
| <kbd>M</kbd> | Mute |
| <kbd>0</kbd>–<kbd>9</kbd> | Jump to 0%–90% |

Note that <kbd>,</kbd> and <kbd>.</kbd> **without** Shift still frame-step. Only the
shifted versions are ours — which is exactly the pair YouTube itself used for playback
speed before we hid that row.

## Why so few

Every shortcut claimed is one taken from YouTube, or from another extension, or from your
muscle memory. Two is enough for the only thing you adjust mid-video. The rest is a click
away in the pace menu.

## No custom bindings yet

There is no remapping UI. If you want one, say so in a
[feature request](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose) — describe
the conflict you are hitting, since that is what would justify the surface area.

Chrome's own `chrome://extensions/shortcuts` page does not apply here: these are handled by
the content script on the page, not registered as browser commands.
