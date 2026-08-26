# Captions

Three features, all of which live in **YouTube's own** Subtitles/CC menu — not in a panel
of ours. Open the gear, choose **Subtitles/CC**, and they are the three rows immediately
below **Off**.

They are in YouTube's menu on purpose. A separate settings panel floating over the player
is a
[stated non-goal](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/SPEC.md).

**All three require captions to be on.** If CC is off, our overlay is off too. The
extension never forces subtitles on to make its own features work.

## Dual subtitles

Two languages at once, stacked.

Turn **Dual** on and the language list becomes a *permission to pick two* — not an
auto-duplicate. Pick one language and you get one line, exactly as before. Pick a second
and you get two.

- Slot 1 gets a **blue** check (`#3EA6FF`), slot 2 a **gold** one (`#FFCC00`).
- The check appears on the language row you actually chose — including a child of
  **Auto-translate**, like *Albanian*. It never sits on the parent "Auto-translate" row.
- Auto-translate genuinely fetches the translation, so you see translated text, not the
  source repeated.
- English and auto-translated-to-English are recognised as the *same language*. They cannot
  occupy both slots — that would give you the same text twice.

**The pairing worth trying:** the original language in one slot, your own language in the
other. You follow along in the original, glance down when you lose the thread.

Both lines are draggable, independently. Drag either one anywhere in the player. Positions
reset on every new video, so a video with a persistent lower-third does not leave your
captions permanently displaced.

## Color highlight

The word being spoken right now shows in its slot color; the rest of the line dims to 28%.

With two languages, each line highlights in its own color — blue and gold — so your eye
knows which line it is on. With a single track the highlight is gold.

Off, every word is plain white, exactly as YouTube renders it.

This is what makes fast pace targets survivable. At 250 WPM, reading a static block of
text is work; following a moving highlight is not.

## Center word

Spritz-style RSVP. One word at a time, pinned to a marker at the center of the player,
with red ORP hairs above and below marking the optimal recognition point.

- Takes about 28% of the player width.
- **Works while paused** — step through with the arrow keys and it keeps up.
- **Works with Dual** — you get two stacked RSVP strips, one per language.
- With Color highlight off, the center word renders **white**.
- Caps at 24px so YouTube's caption-size <kbd>+</kbd> cannot blow the strip out of the
  player.

It is an acquired taste and it is very effective above 300 WPM, where normal reading
saccades stop keeping up.

## Sizing and appearance

The overlay copies **YouTube's own caption font size**. Use YouTube's caption size controls
(<kbd>+</kbd> / <kbd>−</kbd> with captions focused, or the caption settings panel) and our
overlay follows. There is no separate size setting to get out of sync.

The extension keeps YouTube's structure of one background per cue. It never draws a box per
word, and it never rewrites the native caption DOM — an early version did, and that loop
froze the tab.

## Combinations

| Dual | Highlight | Center | What you get |
|---|---|---|---|
| off | off | off | Plain YouTube captions |
| off | **on** | off | One line, current word colored gold, rest dimmed |
| **on** | **on** | off | Two lines, each highlighting in its own color |
| off | off | **on** | One white RSVP strip at center |
| off | **on** | **on** | One colored RSVP strip |
| **on** | **on** | **on** | Two stacked RSVP strips, blue and gold |

## Known limits

- **Character-based scripts** (Chinese, Japanese, Thai) display fine, but word-level
  highlighting is approximate — those languages do not delimit words with spaces. Pace
  measurement is unaffected, because it always reads the original-language track.
- **Live streams** have caption tracks that arrive incrementally. Behavior is unpredictable
  and untested.
- **Burned-in subtitles** — text baked into the video image — are invisible to the
  extension. There is no caption track to read.

## If the rows are not there

See [Troubleshooting](Troubleshooting#the-captions-menu-has-no-dual--highlight--center-rows).
Usually it means YouTube changed its menu markup, which is
[host drift](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/YOUTUBE-MONITOR.md)
and worth reporting.
