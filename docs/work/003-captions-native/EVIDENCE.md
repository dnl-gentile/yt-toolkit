# W-003 evidence — Dual / highlight / center + native Subtitles/CC toggles

Tier **M**. Real-host Playwright against `https://www.youtube.com/watch` is still required to close this slice (QUALITY.md §2 Visual / Live). Commands below would fail if the change were reverted.

## Commands

```text
$ node --check content/captions.js && node --check content/yt-menu-patch.js
syntax: ok
```

```text
$ grep -n "setInterval" content/yt-menu-patch.js || echo "no setInterval in yt-menu-patch.js"
no setInterval in yt-menu-patch.js
```

(Reverting the 800ms always-on loop would put `setInterval(..., 800)` back.)

```text
$ grep -n "document.body" content/captions.js content/yt-menu-patch.js || echo "no document.body"
no document.body
```

```text
$ grep -n "observe(" content/yt-menu-patch.js
590:    menuObs.observe(m, {
630:    playerObs.observe(p, { childList: true });
```

`m` is `.ytp-settings-menu` (only while open). `p` is `#movie_player` / `.html5-video-player` with **no** `subtree`.

```text
$ grep -n "document.hidden\|onWatch\|ccEnabled\|stopTicks" content/captions.js
47:  function onWatch() {
393:  function ccEnabled() {
404:    if (document.hidden || !onWatch()) {
417:    if (!ccEnabled() || !wantPaint) {
523:  function stopTicks() {
530:    if (document.hidden || !onWatch()) stopTicks();
```

```text
$ grep -n "en ≡ tlang:en\|sameLang\|sameText\|uniqueLangs" content/captions.js content/yt-menu-patch.js
```

Hits include `uniqueLangs`, `sameLang`, `sameText`, and the comment `en ≡ tlang:en — cannot occupy both slots`.

```text
$ grep -n "if (!isCaptionsPanel" content/yt-menu-patch.js
412:        if (!isCaptionsPanel(panel) && !isAutoXlPanel(panel)) return;
460:    if (!isCaptionsPanel(root)) return;
475:        if (!isCaptionsPanel(root)) return;
512:      if (!isCaptionsPanel(panel)) el.remove();
```

```text
$ grep -n "top: 68px\|rgba(15, 15, 15, 0.82)\|background: #f1f1f1\|height: 14px\|width: 28%" styles.css
454:  top: 68px;
458:  background: rgba(15, 15, 15, 0.82);
566:  height: 14px;
587:  background: #f1f1f1;
598:  background: #f1f1f1;
656:  width: 28% !important;
```

## Behaviors implemented

### Dual
- Dual ON is permission to pick up to two languages. One selected → one overlay line (`langs.length > 1` gates the second). Zero selected + highlight/center off → native captions, no clone.
- `langBase` treats `en` and `tlang:en` (and region tags) as one language. `uniqueLangs` drops the duplicate before paint or storage write. Clicking the other form does not fill slot 2.
- Same live text on both packs hides the second line (`sameText` / same cue array).
- Language clicks (native list or Auto-translate children) toggle into slot 1 then slot 2. Capture handler runs only inside the captions or Auto-translate **panel**, not the root settings list.
- Colored ✓ on the chosen row: slot 1 `#3EA6FF`, slot 2 `#FFCC00`. Auto-translate **parent** is skipped (`isAutoXlItem && !inXl`). Children (Albanian, Portuguese, …) get `tlang:` tokens and the check.
- Auto-translate fetches `tlang=` via `postMessage({ source: "quiettube-iso", type: "QT_FETCH_TRACK", url, lang })` and paints `window.QuietTube.cuesByLang["tlang:xx"]`. Source cues are not used as a fallback for a `tlang:` slot.

### Overlay (highlight / center)
- Draws only `#qt-cap-p` / `#qt-cap-s`. Native caption DOM is not rewritten. Native window is hidden with `.qt-ours-on` only while our line is actually showing.
- CC Off (`aria-pressed` on the subtitles button / no `captions-enabled`) → `hideOurs()`. We never toggle CC on.
- Highlight on: current word in slot color (gold if a single track); others `opacity: 0.28`. Highlight off: all words white, including center word.
- Center word: Spritz RSVP, `width: 28%`, `max-width: 300px`, red ORP hairs. Works while paused (tick uses `currentTime`). Dual → two stacked strips. Font copies native `fontSize`; RSVP caps at 24px.
- One background per cue (`.qt-cap-bg` / `.qt-rsvp-stage`), never per word. Caption `font-weight: 400`; highlight is color/opacity only.
- `setInterval(tick, 140)` is started only on `/watch` with a visible tab, and stopped otherwise. No `MutationObserver` in this file.

### Menu injection
- Dual / Color highlight / Center word inject only when `isCaptionsPanel` (header in `CAPTIONS_LABELS`, or Off + Auto-translate without main-settings markers). `isMainSettings` (≥2 of quality / sleep timer / …) and `isAutoXlPanel` refuse inject. `scrub()` removes rows that escaped into the wrong panel.
- Inserted immediately after Off. Toggle on the right (`ytp-menuitem-content`). Label inset copied from the Off row. Hover is full-row (`width: 100%`, `border-radius: 0`), not a chip.
- Native Playback speed still hidden via `SPEED_LABELS`.
- Patch runs while `.ytp-settings-menu` is open: click on the gear, `childList` on `#movie_player` (no subtree), subtree observer on the settings popup itself. Observer disconnects when the menu closes. The 800ms `setInterval` is gone.

### CSS
- `.qt-chrome-btn` hover/focus stays `border-radius: 999px`, `outline: none`.
- `#qt-speed-menu` / `.qt-menu` `top: 68px` (cluster `top: 12px` + 40px + ~16px gap). Paint `rgba(15,15,15,0.82)`, no blur, no border.
- `.qt-switch`: 36×14 track, 20px thumb `#f1f1f1`, off `rgba(255,255,255,0.18)`, on `rgba(255,255,255,0.42)`.
- No `:focus` / `:focus-visible` ring on our menuitems, switch, or speedometer.

## Remaining risk (host-drift)

YouTube menu class names and panel trees are cat-and-mouse (`docs/YOUTUBE-MONITOR.md`):

| Signal | Breaks |
|---|---|
| `.ytp-settings-menu` / `.ytp-panel` / `.ytp-panel-title` | Dual injects into the wrong panel, or not at all |
| Localized labels outside `CAPTIONS_LABELS` / `OFF_LABELS` / `AUTO_XL` / `SPEED_LABELS` | Missed captions panel, leftover Playback speed, check on the wrong row |
| Subtitles button not `.ytp-subtitles-button[aria-pressed]` and player missing `captions-enabled` | Overlay may stay up after CC Off (or never show) |
| Auto-translate children without a parseable name/`data-language-code` | No `tlang:` token, no check, no fetch |
| Settings popup not a direct child of `#movie_player` | Player `childList` observer misses open/close; gear click still attaches |

Live proof still needed: Subtitles/CC screenshot (Dual after Off, YouTube-style switches, no Dual in root or Auto-translate), overlay with Portuguese + Auto-translate English (two texts, two colored checks, no clone), CC Off hides `#qt-cap-p`/`#qt-cap-s`, center+dual stacked RSVP while paused.
