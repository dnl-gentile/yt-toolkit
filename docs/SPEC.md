# YouTube Toolkit — product spec

Canonical. Later user decisions supersede earlier ones. Chat history is not a source of truth; this file is.

Version of this document: **1.6.2** (2026-08-29). Extension semver in `manifest.json` tracks shipped behavior.

Supersession 2026-08-29 (persistent fixed 1x and Shorts caption finish):

- `A` and `Shift+Backquote` toggle one reversible **global fixed-1x state**.
  While it is on, actual playback is 1x and Pace Lock / Trim silence are
  effectively off, but the saved manual speed, WPM target, Lock and Trim
  profile remain untouched. The state survives player replacement, navigation
  between `/watch` and `/shorts/:id`, reload, and synchronized open tabs; the
  allow-listed Video.js adapter reads the same preference. Toggling it off
  restores/recomputes the saved profile. `S` / `D` or a committed manual-speed
  edit explicitly leave fixed 1x and persist that exit
- A replacement player response for the same video ID may carry a refreshed
  signed ASR URL. The timing authority must adopt that current descriptor and
  re-arm WPM, Lock, Trim, Color highlight and Center word without asking the
  user to turn CC off and on. Stale descriptors, requests and retry backoff may
  not pin the old URL or create a fetch loop; acquiring rhythm still never
  changes the user's CC state or displayed language
- On Shorts, the native Subtitles/CC submenu receives **Color highlight** and
  **Center word** only. Dual Subtitles is intentionally absent there. The two
  rows clone the active Short's native row structure and inherit that popup's
  own paint, opacity, height and radius instead of imposing the `/watch` menu
  paint. They remain unavailable without original-language ASR and re-arm as
  soon as ASR arrives
- With CC on, Highlight and Center render inside the active visible Short and
  follow it across Shorts navigation as one singleton overlay. With CC off they
  remain hidden without forcing CC on or erasing their saved preferences. A
  late or replacement ASR source must make them work without a CC toggle

Supersession 2026-08-28 (weighted Pace Lock cadence):

- The Pace engine no longer treats every whitespace token as an identical
  speech unit. It computes **equivalent words** from the original-language ASR:
  count NFC-normalized Unicode letters/numbers, map length to
  `clamp(0.6 + 0.08 × length, 0.6, 2.0)`. Five characters equal one word on a
  fixed scale, while short connectors carry less load and long terms carry
  more. Connectors are never omitted, and unrelated vocabulary elsewhere in a
  video cannot change the same sample
- A local sample sums completed onset groups only. If several ASR tokens share
  the latest onset, that entire undelimited group waits for a later onset
  instead of creating an instantaneous WPM spike
- Equivalent WPM is `60 × completed equivalent-word units / real spoken time`.
  The UI continues to say WPM and targets share the same fixed scale across
  videos. This is a deterministic multilingual orthographic proxy, not a claim
  of phonetic syllabification
- Base-WPM utterances now use the same 1.15 s speech/pause boundary as local
  WPM. The former 0.85 s split made continuous ~67 WPM speech produce a zero
  base rate
- ASR authority, real timestamps, 8/14 s local windows, `target / local` Lock
  math, Trim thresholds/rates, and clock/Shorts contracts are unchanged. The
  40–420 sanity range validates literal timestamp cadence before weighting; a
  valid equivalent WPM may fall outside it. Transcript load preparation occurs
  once; the live hot path remains bounded to its local window

Supersession 2026-08-26 (trim boost is visible on the pace pill):

- While Trim silence is accelerating a gap, the pace pill's `{rate}x` is the live transport rate (4× or 8×), not the saved manual speed and not the Pace Lock speech rate. On the first spoken word the pill snaps back to that saved manual speed or the live Pace Lock rate in the same tick
- The adjusted clock is unchanged: it still uses only the saved manual speed or the stable Pace Lock median, and Trim 4×/8× must never become its divisor
- Shorts still show only `{target} WPM` while Pace Lock is effectively active, and only `{rate}x` otherwise (so a Short without Lock also shows 4×/8× through a silence). `/watch` still shows `{WPM · ×}`
- The open pace menu's slider and presets remain the saved manual speed (or Lock WPM controls). A transient trim rate must not become the slider value or overwrite `qt_playbackRate`

Supersession 2026-08-26 (allow-listed UNIP / Video.js course player):

- Toolkit playback controls also run inside `https://tvweb3.unip.br/*` frames. The adapter is isolated from the YouTube scripts: it does not load No Distractions, YouTube menu patches, ASR acquisition, Shorts geometry, or the YouTube observer/scheduler
- `.video-js` is the only coordinate root. The pace pill is top-center at 8px, derives its 30px height and paint from `.vjs-control-bar`, and disappears/inerts with `vjs-user-inactive` while playing. Its menu is bounded to the player width/height and scrolls above the native control bar on the 471×265 layout
- Manual speed is fully supported and shares `qt_playbackRate`: pill, 0.25–4× slider, presets, native Video.js rate changes, temporary neutral 1× via `A` / `Shift+Backquote`, and `S` / `D` steps of 0.25×. Choosing any manual speed while neutral exits neutral and remains editable
- The adjusted clock is a flat Video.js control after volume and replaces the native current/divider/duration nodes. It uses manual speed only: `current/rate / duration/rate (original duration)`
- The adapter reads only the `TextTrack` objects already loaded by Video.js. It does not intercept `fetch`/XHR, request the authenticated transmission API, or touch the HLS media source
- When two cue-level caption tracks are available, Dual subtitles render the primary in `#FFCC00` and secondary in `#3EA6FF`. Language selection keeps two persistent vacancies: clear a selected slot before a third language can fill it. Dual mode uses hidden native tracks and restores the selected primary as the native showing track when disabled
- UNIP WebVTT has cue/sentence boundaries but no authoritative per-word timestamps. Therefore WPM, Pace Lock, Trim silence, Color highlight, and Center word are unavailable and disabled with an explanation; their global saved preferences are not erased. Cue text must never be evenly split into invented word onsets
- No Distractions remains intentionally unsupported on UNIP

Supersession 2026-08-25 (neutral edits and responsive Shorts chrome):

- `A` / `Shift+Backquote` still enter a reversible neutral 1x state without changing the saved custom profile when the user only toggles in and out. The manual multiplier controls stay enabled in that state. Choosing a multiplier, pressing the menu `−` / `+`, or moving its slider is explicit new intent: it exits neutral, turns Pace Lock off, and saves the selected manual speed. Trim keeps its saved preference
- On Shorts, the pace chip follows the active native controls surface: either
  the legacy `ytd-shorts-player-controls` contract or the current
  `ytd-shorts-player-controls-cow.ytdShortsPlayerControlsHost` contract, with
  their allowlisted left/right groups. It does not guess from arbitrary
  buttons. With the Toolkit menu closed, it mirrors that surface's effective
  visibility and must not remain focusable or clickable after the controls
  fade out. If a recognized controller or usable lane cannot be measured, the
  Toolkit chip fails closed; an open Toolkit menu also closes
- The Shorts chip occupies the changing free lane between `#left-controls` and `#right-controls`, uses the native lane's rendered top and height, and never overlaps either group. With volume collapsed it centers within that free lane, not necessarily the whole video
- With native volume collapsed, Shorts shows one metric: `{target} WPM` while Pace Lock is effectively active, otherwise `{rate}x`. It never oscillates between those forms because of available width. When the native volume surface actually expands, the chip becomes one native-height square containing only the speedometer and anchors to the right edge of the remaining lane. Collapsing volume restores the metric selected by Pace Lock state. If the square cannot fit, the chip hides. The open pace menu stays centered inside the player and begins below the dynamically sized chip
- Shorts chrome geometry and effective opacity are reconciled from one 120–140 ms UI cadence and one measurement cache. Rhythm transport work is capped at an 80 ms cadence. A closed menu performs no menu-geometry reads, and unchanged text, attributes, styles, or tight state create no DOM-mutation loop

Supersession 2026-08-25 (Dual language slots and native chrome paint):

- Dual Subtitles owns two persistent vacancies, not a compact replacement list. Slot 1 is the primary caption and uses yellow `#FFCC00`; slot 2 is the secondary caption and uses blue `#3EA6FF`
- Clicking a selected language clears that exact slot (matching aliases by base language). A new language fills the vacant slot without moving the other selection. When both slots are occupied, clicking a third language is a no-op until the user explicitly clears one
- The two colored indicators reuse the native YouTube check asset and geometry. A typographic Unicode check is not an acceptable substitute
- Toolkit chrome chips (`#qt-time-pill` and the top pace cluster) mirror the active YouTube player's computed chip paint and height. The safe fallback is `rgba(0, 0, 0, 0.3)`, 40px high, 28px radius, no blur, border, or shadow; the transparency composes naturally with light and dark video frames
- Host-style reconciliation is cached, throttled, and idempotent. It must not rewrite identical inline style or create a mutation loop

Supersession 2026-08-24 (manual pace units):

- With Pace Lock off (or effectively unavailable), the pace menu is exclusively a playback-speed control: the large value, slider value text, and every preset use the `x` multiplier (`1x`, `1.25x`, `1.5x`, `2x`, `3x`), never WPM targets
- Turning Pace Lock off swaps the open menu immediately from the WPM controls to the `x` controls and restores the saved manual speed. A transient Lock/Trim rate must not become the slider value or overwrite that preference
- WPM targets and the 120–800 WPM slider appear only while Pace Lock is effectively active

Supersession 2026-08-24 (temporary neutral-speed mode):

- `A` and `Shift+Backquote` toggle between a temporary neutral mode and the user's current custom pace configuration
- `S` decreases and `D` increases that pace stepper: 10 WPM per press while Pace Lock is active, or 0.25x per press in manual-speed mode. Pressing either key from neutral mode returns to the custom profile before applying the step
- Toolkit pace shortcuts do nothing while focus is in an editable control (including an input inside open or closed shadow DOM) or while a visible native YouTube dialog/modal is open
- Neutral mode means actual playback at **1x**, with Pace Lock and Trim silence effectively off everywhere they can affect behavior (player rate, menu state, and adjusted clock). The persistent manual speed, target WPM, Pace Lock, and Trim preferences are not overwritten
- Toggling back restores the saved manual speed or reactivates the saved Pace Lock/Trim configuration and recomputes its live rate. This must also work when the custom configuration itself happens to be producing 1x

Supersession 2026-08-23 (no original ASR — degrade, do not invent):

- When a video has **no auto-generated track in the original language**, WPM / Pace Lock / Trim silence / adjusted clock / Color highlight / Center word must not be derived from uploaded or translated captions. Those carry cue-level times only; spreading them into per-word onsets invents a cadence the speaker never had and holds trim boost through speech. This narrows the earlier §5 note that allowed falling back to "the first non-translation captionTrack" for rhythm: that fallback may still supply **display** text, never rhythm
- The saved preferences are **not erased**. Pace Lock, Trim, Color highlight, and Center word keep their stored value, render as unavailable (dimmed, `aria-disabled="true"`), refuse activation, and carry a tooltip naming the requirement
- Manual speed keeps working and keeps being applied, because it never depended on a caption
- The pill renders `— WPM` while there is no rhythm source, never `0 WPM` (§4 reserves `0` for a real pause) and never the Lock target (which would present the goal as a measurement). The adjusted clock falls back to the manual speed alone
- When an ASR track arrives late, the features **re-arm themselves** in the same session — no toggling CC, no re-picking the language. The pace menu and pill repaint on adoption
- Dual subtitles remain available as pure display when two usable sources exist; a second coarse track never promises per-word timing and never touches `QT.cues`
- The isolated world holds **no** timedtext fetch authority. `content/inject.js` (MAIN) is the only fetcher; the isolated world asks via `QT_FETCH_TRACK` / `QT_NEED_TRACKS`. A `QT_TRACKS` announcement is answered at most once per distinct tracklist per video, so state requests cannot become a fetch loop

Supersession 2026-08-20 (persistent preferences and rhythm authority):

- User choices persist across reloads and `/watch` or `/shorts/:id` SPA navigation: explicit CC on/off, selected caption language(s), Dual, Color highlight, Center word, manual speed, target WPM, Pace Lock, and Trim silence. Turning CC off hides captions but **does not erase the saved language(s)**. Per-video cues, video identity, computed Lock rate, Trim boost, and caption drag offsets are ephemeral and reset/recompute for the next video
- The timing authority is the **auto-generated ASR in the spoken/original language**, acquired invisibly even with CC off. An Auto-translate URL may retain `kind=asr`, but the presence of `tlang` makes it display text and it can never become the rhythm source. Once source ASR exists, neither translated nor uploaded cues may replace it
- WPM, Pace Lock, Trim, and clock read only that source rhythm. A displayed translation keeps its translated words, but Highlight and Center advance those words from the original ASR word onsets. Changing display language therefore cannot change WPM, speed, silence boundaries, or watch-time math
- Hidden ASR acquisition never toggles CC. Separately, restoring an explicit user CC preference on the next player is allowed through the native CC control; it must not select a caption track to provoke timedtext
- Only the manual unlocked speed is a persistent speed preference. Live Pace Lock rates and 4×/8× Trim boosts are per-video calculations and must never overwrite it; disabling Pace Lock restores the saved manual speed

Supersession 2026-08-20 (Shorts pace pill):

- On `/shorts/:id`, the active visible Short gets the same singleton `{WPM · ×}` pill in the free top-center lane: horizontally centered, 12 px from the video top, inside the player, and clear of the native left/right controls. It follows the active Short on SPA navigation and never duplicates
- YouTube keeps `ytp-autohide` on the Shorts player even while its top controls are usable, so that class must **not** hide the Shorts pill. The `/watch` autohide behavior remains unchanged
- The Short ID comes from the pathname and its tracks come from the active `#shorts-player.getPlayerResponse()`. Every tracks/timedtext result is bound to that video ID and navigation generation; a late ASR response from the previous Short must be discarded. Hidden ASR acquisition must preserve CC state. Shorts do not receive the adjusted lower-left clock or custom Dual/highlight caption overlay in this slice

Supersession 2026-08-20 (WPM before CC pick):

- Overlay WPM / lock / trim must load ASR on `/watch` and `/shorts/:id` **before** the user selects a caption. Reloading whatever track is current (often none / uploaded) left 0 WPM until a manual pick. Fetch the ASR `captionTracks.baseUrl` directly, copy only `pot`/`potc` from a player timedtext request when available, and retry with dedupe/backoff. Never call `setOption("captions", "track", ...)`, never change the displayed track, and never change CC state

Supersession 2026-08-20 (native toggles):

- Dual / Color highlight / Center word use YouTube’s `.ytp-menuitem-toggle-checkbox` only (Stable Volume geometry: contained thumb). Pace lock / Trim copy that pill. The old 36×14 track with a 20px overhanging thumb is a defect

Supersession 2026-08-20 (generated-caption timing):

- **WPM / lock / trim / clock / word highlight / center-word always use auto-generated (ASR) timedtext when it exists.** Uploaded same-language captions must not replace `QT.cues`. ASR has per-word `tOffsetMs`; uploaded lines only have cue-level times, so even-split “divisão de tempo” desyncs highlight and pace from speech. If the video has no ASR track, fall back to the first non-translation captionTrack. Switching the displayed caption to Arabic, Chinese, Auto-translate, etc. still must not change `playbackRate` or overlay WPM.

Supersession 2026-08-26 (public repo launch):

- The extension reports **anonymous, aggregate** usage to GA4. That is now **opt-out**: `qt_telemetry` in `chrome.storage.sync`, default `true`, with a switch on the extension options page. Every send passes through `Analytics.isEnabled()`; a missing or throwing storage layer means **no** reporting. What is collected is declared in `PRIVACY.md` and must stay in sync with `analytics.js`
- The **options page** exists for settings that cannot live in the player. Playback and caption settings stay in the pace pill and the Subtitles/CC menu (§4, §7). Do not migrate them to the options page and do not duplicate them there
- Licence is **GPL-3.0-or-later** (`LICENSE`). Source files carry an SPDX header. A change that would make the extension non-redistributable under that licence is out of scope

Supersession 2026-08-20 (user session, prints on MrBeast *Last To Leave Mansion*):

- **WPM / lock / trim / clock always use the video’s original language timedtext** (ASR / source). Switching the displayed caption to Arabic, Chinese, Auto-translate, etc. must not change `playbackRate` or the overlay WPM. Character scripts without spaces (zh, ja, th) would otherwise look like huge silence gaps and keep the player at trim-boost
- Trim boost must **end on the first spoken word** — snap back to the lock (or 1×) in the same tick. Staying at 4×/8× through speech is a defect
- Dual / Color highlight / Center word rows align with **Off** (label left, small inset, toggle right). They must not sit on the opposite side or widen the menu
- Dual / Color / Center use the native `.ytp-menuitem-toggle-checkbox` in `.ytp-menuitem-content` (same control as Stable Volume / Ambient mode). Pace lock / Trim copy that contained pill (thumb inside the track, not overhanging). Do not restyle YouTube’s checkbox class
- Color highlight and Center word use the **same font size as native captions** (no smaller overlay)
- Dual lines are stacked with native-like gap out of the box; reset drag offsets on every new video
- Overlay follows Dual while paused: language switch busts `dataset.sig` and `requestLang` fires at currentTime (no `v.paused` early-return)
- **Top-center overlay** (not top-right — that covers YouTube’s info cards): only `{WPM · ×}` lives there. The adjusted clock lives in the native lower-left controls and replaces the duplicated native clock. `(original total)` is the only dim segment
- **Clock consistency:** unlocked manual × is the clock divisor: 13:09 at 1.5× → 8:46; at 2× → ~6:35. Pace lock intentionally uses the stable `targetWpm / original-track median base WPM` for total duration, while the pill/menu show the same live local ×. Trim 4×/8× never feeds the clock


## 1. Identity

- Store / card name: **YouTube Toolkit**
- Folder / short name: `yt-toolkit`
- Chrome MV3 unpacked extension, YouTube only (plus the quiet search app host)
- Chrome card icon: the **official YouTube badge silhouette** in red (lifted from the logo — not a rounded rectangle; the sides bulge) + a **white toolbox**, Material Symbols `home_repair_service`, **Rounded** weight. The source of truth is `icons/src/icon.svg`; the PNGs are rendered from it with `npm run icons` and must never be hand-edited. `npm run icons:check` fails if a PNG drifts from the vector, or if the glyph is too small to read at 16px — the size Chrome puts in the toolbar
- Masthead No Distractions icon: original circle-with-slash, **not** the wrench

## 2. Non-goals

- Do not become a generic video-speed controller for other sites
- Do not ship a settings overlay that copies Video Speed Controller’s panel
- Do not invent transcripts where YouTube has none
- Do not rewrite accepted decisions in this file — append a dated supersession note

## 3. Native YouTube contract

Keep YouTube’s own chrome. Ours must look like it belongs:

- Overlay pill: `rgba(15, 15, 15, ~0.75–0.82)`, **no** backdrop-blur, **no** hairline border, Roboto, fully rounded
- Pace menu: same paint as `.ytp-popup.ytp-settings-menu` (dark transparent, 12px corners, no glass frost, no extra border)
- Hover on the speedometer: **pill**, not a square, not a circle that reads as a different control
- Opening our pace menu closes the native settings menu, and vice versa — never stacked
- On `/watch`, our top cluster **hides with** `.ytp-autohide` (same fade as the bottom bar) and stays visible while our menu is open. On Shorts it remains visible because the host keeps `ytp-autohide` on the active player
- Native **Playback speed** row is hidden. Ours is the source of truth. Do not try to sync the hidden number
- S / D and Shift+, / Shift+. drive our stepper (× when unlocked, 10 WPM when locked). J/K/L, comma/period frame-step, Shift+P/N stay native
- Captions keep YouTube’s one-background-per-cue structure (never a box per word)

2026-08-26 supersession — “same paint” means the active native popup's
computed surface, including YouTube's own backdrop filter when that player
skin enables it. The Toolkit samples only paint properties at interaction
boundaries and otherwise follows YouTube's popup tokens; it does not add an
independent glass effect or copy native popup geometry/visibility.

## 4. Pace overlay (top-center of the active `/watch` or `/shorts/:id` player)

Always both values, no “show only speed / only WPM” setting:

```
{wpm} WPM  ·  {rate}x
```

- **Pace lock off:** `{wpm}` is **heard** rate = media WPM × current `playbackRate`. 150 at 1× → **300 at 2×**. Silence → **0**. Do not hold a stale 190–200. Timestamps are media-time; the × converts them to wall-clock words per minute
- **Pace lock on:** `{wpm}` is the **target** (default **180**, range 120–800, step 10, pills 120 · 180 · 250 · 400 · 600). Slider drags to 800 even though the largest pill is 600. `{rate}x` is whatever `playbackRate` is needed so effective spoken rate ≈ target. Through a Trim silence that live transport rate is 4× or 8×, then it snaps back
- **Trim silence on:** the pill shows the boost while the gap is in flight. The clock never does. Shorts keep the one-metric rule (WPM with Lock, otherwise the live `{rate}x`)
- Speedometer button opens the pace menu. Menu sits **below** the pill with a visible gap (not glued)
- Pace lock on → menu is a WPM velocimeter (big number + slider + pills)
- Pace lock off → menu is native-style × (0.25–4, pills 1.0 · 1.25 · 1.5 · 2.0 · 3.0)
- Toggles in this menu only: **Pace lock** (lock icon), **Trim silence** (cut/scissors icon). Distinct Material icons. Color highlight / Center word / Dual do **not** live here

## 5. WPM engine (load-bearing)

This is the feature that has been wrong across many versions. Invariants:

1. **WPM = completed equivalent-word units ÷ real spoken time.** Each original-ASR token receives the bounded, fixed-scale orthographic load defined by the 2026-08-28 supersession. Distinct onset groups delimit completed units. No `n × 0.28 s` / `n × 0.4 s` floor. That floor made slow speech look like ~150–214 WPM
2. **YouTube ASR rolls windows** (“hello there” then “there how”). Repeated tokens in overlapping cues are one word
3. **Noise** `[Music]`, `[Applause]`, `♪` is not speech
4. **Pause ≥ ~1.15 s without a word → displayed rate 0.** That is a real pause, not the 0.75 s between words in ~80 WPM speech. A 0.6 s threshold treated slow speech as silence and left trim-boost stuck at 4×/8×. Trim still uses ≥ 1.2 s
5. **Pace lock:** `playbackRate = clamp(targetWpm / localWpm, 0.7, 4)`. Speech at ~100 WPM with target 200 → **~2×**, not 1×. Overlay shows **target WPM constant** and **live ×** (not the median clock rate). After a trim boost, **snap** back to the lock rate — never crawl down from 8×
6. **Trim silence:** accelerate gaps ≥ 1.2 s (4×, or 8× if the gap is > 5 s). **No seek** (decoder flush stutters). Trim must not write a 9.6× / 16× rate. Trim must not be mistaken for speech by the lock
7. **Median base WPM** of utterances (n ≥ 4, span ≥ 1.5 s, split only at the same 1.15 s pause boundary) is media-time (1×). Clock and lock use that. Overlay with lock **off** shows `localWpm × playbackRate` so 2× doubles the number
8. Timedtext is pulled **without the user selecting a caption** and with CC state invariant. Player response + `/api/timedtext` + fetch/XHR hook; if `baseUrl` lacks `pot`, copy only `pot`/`potc` from a same-video player request. Empty 200 bodies are not cues; failures back off and dedupe. Never select a track to provoke a request. Auto-translate must not poison the WPM track — `kind=asr&tlang=...` is still a translation, and WPM always uses source-language auto-generated ASR when present, never translated or uploaded same-lang captions
9. Live WPM, silence lookup, and trim lookup use binary search plus the local speech window; they must not scan a long video's full word array on every rhythm update

Unit tests in `tests/` must fail if invariant 1 or 4 regresses.

## 6. Watch-time clock

On `/watch`, adjusted watch time lives in one pill in the native lower-left controls. The original native time bits are hidden to prevent duplication; WPM and × remain in the separate top-center pill. Shorts have no corresponding lower-left time lane, so they receive no Toolkit time pill.

```
{adjusted current} / {adjusted total} ({original total})
```

- Parentheses: **original total only**, never original current
- Dim: ~72% white — readable, not a dark smudge
- Adjusted total is **stable**: `(duration − trimmed silence) / lockRate`, using median base WPM, **not** the oscillating live rate or the 4×–8× trim boost
- If lock off, 1×, trim off (or trim changes nothing): hide the parentheses
- Must not flicker 2:00 ↔ 4:00

## 7. Captions

- Dual / Color highlight / Center word live **only** in the native Subtitles/CC submenu, immediately after **Off**
- Dual is a **permission to pick two**, not an auto-duplicate. One language selected → one line. Two → two lines, stacked, independently draggable
- Historical slot identity (superseded 2026-08-25) used compact `YtToolkitDual.uniqueLangs`; the active contract uses persistent `normalizeSlots` vacancies with `langBase`. `en` and `tlang:en` remain the same language
- Historical colors (superseded 2026-08-25) were slot 1 blue / slot 2 yellow. The active contract is primary yellow / secondary blue, and the check stays on the chosen language row, including Auto-translate children, never its parent
- Auto-translate fetches `tlang=` and shows the **translation**, not the source
- The saved primary language remains active when Dual is off. If that language is translated, its words are painted from the translation while their active-word cadence is mapped to original-language ASR onsets
- Color highlight on: current word in the slot color (or gold if a single track); other words at 28% opacity. Off: all words white
- Center word: Spritz-style RSVP, ~28% of player width, red ORP hairs, current word pinned on the marker. Works while paused. Works **with Dual** (two stacked RSVP strips)
- Center on + highlight off → **only the center word is white** (full opacity); neighbors stay dim (~28%), not colored
- Font size is **one function** for Dual, Color highlight, and Center word — the same as native captions. Copy `.ytp-caption-segment` if ≥ 16 (even when opacity 0). `-` / `=` are YouTube’s (`fontSizeIncrement`); overlay uses `playerHeight * 0.04 * scale`. No 22px/24px Center cap
- Default stack: primary sits above the native-caption area (`bottom` ~80px); secondary is that plus line height plus a **~48px** gap. Zero `qt_captionPos` (new video) resets to those defaults
- Overlay **tick uses `currentTime` while paused** — no `v.paused` early-return. Changing `qt_captionLangs` busts `dataset.sig` and `requestLang` for slot 2 fires immediately, even if paused
- CC Off → our overlay **off**. Dual off + highlight off + center off → hide overlay (native captions). We never force captions on
- Toggles: same contained pill as native player switches (track ≈ 40×24, 20px thumb inset 2px, white thumb). Toggle on the **right** in the content column. Dual/Color/Center must not invent a second switch skin. Label matches Off — not glued, not centered
- No `:focus` blue/white ring on our rows or the speedometer

## 8. No Distractions

- Toggle stays on the masthead, right of the bell (bell may itself be hidden when ND is on)
- ON: theater; hide related / comments / endscreen / Create / bell; collapse **left** guide (`#guide-button` only). Avatar / account menu always opens
- “In this video” / chapters / transcript engagement panel **opens**
- Home and logo → `https://yt-search-bar.web.app`
- Must not freeze the tab on logo/home, on SPA navigate, or on settings clicks

## 9. Performance budget

YouTube’s DOM is huge. Forbidden:

- `MutationObserver` on `document.body` with `subtree: true` while idle
- Multiple overlapping `setInterval` loops doing the same hide/collapse
- Rewriting native caption DOM (that loop froze the tab)

Allowed:

- One observer on `#movie_player` / `ytd-masthead` / `ytd-watch-flexy` as they appear
- `yt-navigate-finish` to reset state and **disconnect** stale observers
- One rAF/interval pair for pace on `/watch` and `/shorts/:id` (captions remain `/watch` only), paused when the tab is hidden

## 10. Acceptance (must be true on real YouTube players)

1. Open a spoken video. Overlay shows a measured WPM in the ballpark of the speech (slow talk ~80–130, auctioneer much higher). Pause in a pause → 0
2. Pace lock 180 on a ~90 WPM speaker → player near 2×, overlay still says 180 WPM
3. Trim silence speeds through a ≥1.2 s gap without a seek hitch, then returns to the lock rate immediately
4. Clock total does not jump every second; parentheses only on the original total
5. Dual: pick Portuguese + Auto-translate English → two different texts, two colored checks, no clone
6. Center word tracks the spoken word, including Dual
7. Native settings: no Playback speed row; Dual/Color/Center only under Subtitles/CC; menus do not stack
8. ND on: related gone, avatar menu opens, In this video opens, logo does not freeze the tab
9. Reloading another video does not require toggling CC to make WPM work
10. Open a Short: exactly one pill matches the rendered top and height of the active native controls and is centered between them while volume is collapsed. It shows only `{target} WPM` with effective Pace Lock, otherwise only `{rate}x`. Hover volume: it becomes a right-anchored native-height speedometer square. Advancing to another Short moves the same pill, closes an open Toolkit menu, preserves CC, and does not add the lower clock
11. Navigate A → B with CC off and a translated language saved: all user settings remain unchanged; B fetches its own original-language ASR, displays no caption, and still computes WPM/Lock/Trim from that ASR. A late translation, uploaded cue, or response from A cannot take ownership
12. With Pace Lock off, a saved manual speed is applied to the replacement player. Lock/Trim may change the live rate while active, but turning Lock off returns to that saved speed

## 11. Telemetry and privacy

The extension sends anonymous, aggregate counts to a GA4 property over the Measurement Protocol. This section is the contract; `PRIVACY.md` is the same contract written for users and must not drift from it.

- **Opt-out switch:** `qt_telemetry` in `chrome.storage.sync`. Default `true`. Surfaced on the options page. Absent key = on (a fresh profile before the install defaults land still counts as opted in)
- **Single choke point:** everything goes through `Analytics.sendEvent`, which returns early on `isEnabled() === false`. No tracker may call `fetch` directly. If the storage layer is missing or throws, the answer is **no reporting**, not a fallback to on
- **Events, in full:** `extension_installed` (with extension version), `toggle_no_distractions` (on/off), `homepage_redirected`, `video_page_visited`, `feature_usage` (feature name), `page_view`. Adding an event means editing `PRIVACY.md` in the same change
- **Never collected:** video IDs, video titles, channel names, caption or transcript text, search terms, watch history, URLs, account identity, IP-derived profile beyond what GA4 does by default at the network layer
- **Installation ID** is a random string in `chrome.storage.local`, generated on first send, resettable from the options page. It is not derived from any account, device or hardware value
- Telemetry may never gate a feature. The extension must behave identically with the switch off

### Options page

- Exists for what cannot live in the player. Today: the telemetry switch and the installation-ID reset
- Playback and caption settings stay in the pace pill (§4) and the Subtitles/CC menu (§7). Do not migrate them here, do not mirror them here — two sources of truth for the same toggle is the bug this rule prevents
- Paint follows §3: flat dark surface, no frost, no hairline border, Roboto, YouTube's on-state switch colors

## 12. Licence

- **GPL-3.0-or-later.** `LICENSE` holds the full text; source files carry an `SPDX-License-Identifier` header
- Continues `yt-no-distractions-ext`, same author, same licence
- A change that would make the extension non-redistributable under that licence (a bundled non-free dependency, a proprietary service the extension cannot run without) is out of scope
