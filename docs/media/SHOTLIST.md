# Screenshot shot list

Four captures for the README, the wiki and eventually the Chrome Web Store listing.
The store requires **1280×800**, so shoot everything at that size and the same images work
everywhere.

Setup for all shots:

- Chrome, 1280×800 window, dark theme (YouTube's default dark)
- A captioned video with a clearly visible speaker
- Nothing personal on screen: no avatar close-up, no subscription list, no email in the
  masthead. Sign out or use a fresh profile if easier
- No other extension's UI in frame

## 1. `pace-pill.png` — the hero shot

The player with the pace pill at top center, showing a real measured value and rate, e.g.
`142 WPM · 1.75x`, with the adjusted watch clock beside it. Pace lock on.

This is the one that goes at the top of the README. It has to make the idea legible in one
glance, so pick a moment where the number is interesting — not 180 exactly, not 1.0×.

## 2. `pace-menu.png` — the WPM velocimeter

The pace menu open below the pill, pace lock on: the large WPM number, the slider, the
preset pills (120 · 180 · 250 · 400 · 600), and the Pace lock / Trim silence rows.

Frame it so YouTube's own chrome is visible around it — the point is that it looks native.

## 3. `captions-menu.png` — the injected rows

YouTube's gear → Subtitles/CC panel, showing **Dual**, **Color highlight** and **Center
word** directly under **Off**, with their toggles in the on state.

Proof that they live in YouTube's menu rather than in a panel of ours.

## 4. `dual-captions.png` — dual subtitles with highlight

The player showing two stacked caption lines in different languages, with the current word
highlighted in each line's color (blue and gold).

Pick a frame where the two lines clearly say the same thing in different languages — that
is what sells the feature.

## Optional

- `no-distractions.png` — the same watch page with No Distractions on and off, side by
  side. Best as a single composed image.
- `center-word.png` — the RSVP strip mid-word, with the red ORP hairs visible.
- `options.png` — the options page, for the privacy section.

## After capturing

1. Drop the PNGs in this folder.
2. In `README.md`, replace the `SCREENSHOTS` comment block with:

```markdown
<div align="center">

<img src="docs/media/pace-pill.png" width="720" alt="The pace pill showing measured WPM and playback rate" />

</div>

| | |
|---|---|
| <img src="docs/media/pace-menu.png" width="380" alt="Pace menu with the WPM velocimeter" /> | <img src="docs/media/captions-menu.png" width="380" alt="Dual, Color highlight and Center word in the Subtitles/CC menu" /> |
| The WPM velocimeter | Our rows in YouTube's own captions menu |
```

3. Add the same images to the wiki pages they illustrate — `Pace-and-WPM.md`,
   `Captions.md`, `Installation.md`.

Keep the alt text. Someone reading the README with a screen reader should still get the
idea.
