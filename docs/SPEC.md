# YouTube Toolkit — product spec

Canonical. Later user decisions supersede earlier ones. Chat history is not a source of truth; this file is.

Version of this document: **1.6.1** (2026-08-20). Extension semver in `manifest.json` tracks shipped behavior.

Supersession 2026-08-26 (public repo launch):

- The extension reports **anonymous, aggregate** usage to GA4. That is now **opt-out**: `qt_telemetry` in `chrome.storage.sync`, default `true`, with a switch on the extension options page. Every send passes through `Analytics.isEnabled()`; a missing or throwing storage layer means **no** reporting. What is collected is declared in `PRIVACY.md` and must stay in sync with `analytics.js`
- The **options page** exists for settings that cannot live in the player. Playback and caption settings stay in the pace pill and the Subtitles/CC menu (§4, §7). Do not migrate them to the options page and do not duplicate them there
- Licence is **GPL-3.0-or-later** (`LICENSE`). Source files carry an SPDX header. A change that would make the extension non-redistributable under that licence is out of scope

Supersession 2026-08-20 (user session, prints on MrBeast *Last To Leave Mansion*):

- **WPM / lock / trim / clock always use the video’s original language timedtext** (ASR / source). Switching the displayed caption to Arabic, Chinese, Auto-translate, etc. must not change `playbackRate` or the overlay WPM. Character scripts without spaces (zh, ja, th) would otherwise look like huge silence gaps and keep the player at trim-boost
- Trim boost must **end on the first spoken word** — snap back to the lock (or 1×) in the same tick. Staying at 4×/8× through speech is a defect
- Dual / Color highlight / Center word rows align with **Off** (label left, small inset, toggle right). They must not sit on the opposite side or widen the menu
- Pace-lock / Trim / Dual / Color / Center toggles copy YouTube’s **on** colors (lighter track, white thumb) — current on-state is too dark
- Color highlight and Center word use the **same font size as native captions** (no smaller overlay)
- Dual lines are stacked with native-like gap out of the box; reset drag offsets on every new video
- **Top-center overlay** (not top-right — that covers YouTube’s info cards): pace + adjusted clock live in a cluster centered at the top of the player. Native bottom `.ytp-time-display` is left alone (no more fighting YouTube’s clock). `(original total)` is the only dim segment. Adjusted total must not collapse to ~2 min on a 57 min video
- **Clock divisor = the × on the pill.** 13:09 at 1.5× → 8:46; at 2× → ~6:35. Changing the speedometer must recompute the total immediately. Trim 4×/8× never feeds the clock. Pace lock uses `targetWpm / original-track base WPM` for both the × and the total (they cannot disagree)


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
- Our top cluster **hides with** `.ytp-autohide` (same fade as the bottom bar). Stays visible while our menu is open
- Native **Playback speed** row is hidden. Ours is the source of truth. Do not try to sync the hidden number
- Shift+, / Shift+. drive our stepper (× when unlocked, 10 WPM when locked). J/K/L, comma/period frame-step, Shift+P/N stay native
- Captions keep YouTube’s one-background-per-cue structure (never a box per word)

## 4. Pace overlay (top-center of the player)

Always both values, no “show only speed / only WPM” setting:

```
{wpm} WPM  ·  {rate}x
```

- **Pace lock off:** `{wpm}` is the **measured** local speaking rate of the current stretch. Silence (> 0.6 s with no spoken word) → **0**. Paused in silence → **0**. Do not hold a stale 190–200
- **Pace lock on:** `{wpm}` is the **target** (default **180**, range 120–600, step 10, pills 120 · 180 · 250 · 400 · 600). `{rate}x` is whatever `playbackRate` is needed so effective spoken rate ≈ target
- Speedometer button opens the pace menu. Menu sits **below** the pill with a visible gap (not glued)
- Pace lock on → menu is a WPM velocimeter (big number + slider + pills)
- Pace lock off → menu is native-style × (0.25–4, pills 1.0 · 1.25 · 1.5 · 2.0 · 3.0)
- Toggles in this menu only: **Pace lock** (lock icon), **Trim silence** (cut/scissors icon). Distinct Material icons. Color highlight / Center word / Dual do **not** live here

## 5. WPM engine (load-bearing)

This is the feature that has been wrong across many versions. Invariants:

1. **WPM = unique spoken words ÷ real spoken time.** Interval between distinct word onsets. No `n × 0.28 s` / `n × 0.4 s` floor. That floor made slow speech look like ~150–214 WPM
2. **YouTube ASR rolls windows** (“hello there” then “there how”). Repeated tokens in overlapping cues are one word
3. **Noise** `[Music]`, `[Applause]`, `♪` is not speech
4. **Pause ≥ ~1.15 s without a word → displayed rate 0.** That is a real pause, not the 0.75 s between words in ~80 WPM speech. A 0.6 s threshold treated slow speech as silence and left trim-boost stuck at 4×/8×. Trim still uses ≥ 1.2 s
5. **Pace lock:** `playbackRate = clamp(targetWpm / localWpm, 0.7, 2.5)`. Speech at ~100 WPM with target 200 → **~2×**, not 1×. During speech, ease ±0.05× per tick. After a trim boost, **snap** back to the lock rate — never crawl down from 8×
6. **Trim silence:** accelerate gaps ≥ 1.2 s (4×, or 8× if the gap is > 5 s). **No seek** (decoder flush stutters). Trim must not write a 9.6× / 16× rate. Trim must not be mistaken for speech by the lock
7. **Median base WPM** of utterances (n ≥ 4, span ≥ 1.5 s) is what the clock and the initial lock use. Local WPM is what the overlay shows when unlocked
8. Timedtext is pulled **without toggling CC** (player response + `/api/timedtext` + fetch hook). Changing videos refetches. Auto-translate on the player must not poison the WPM track — WPM always uses the original ASR / source language

Unit tests in `tests/` must fail if invariant 1 or 4 regresses.

## 6. Watch-time clock

Native bottom `.ytp-time-display` is **left alone**. Adjusted watch time lives in the top-center overlay with WPM and ×.

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
- `en` and `tlang:en` are the same language — they cannot occupy both slots
- Slot 1 check `#3EA6FF`, slot 2 check `#FFCC00`. Check sits on the language row that was chosen, including Auto-translate children (Albanian, etc.), never on the parent “Auto-translate” row itself
- Auto-translate fetches `tlang=` and shows the **translation**, not the source
- Color highlight on: current word in the slot color (or gold if a single track); other words at 28% opacity. Off: all words white
- Center word: Spritz-style RSVP, ~28% of player width, red ORP hairs, current word pinned on the marker. Works while paused. Works **with Dual** (two stacked RSVP strips)
- Center on + highlight off → center word **white**
- Overlay copies native caption font-size (`+` / `−` caption size). RSVP caps at 24px so `=` / `+` cannot blow the strip
- CC Off → our overlay **off**. We never force captions on
- Toggles: YouTube track (thin, grey) + thumb (larger, near-white). Toggle on the **right**. Label has a small inset matching Off/Portuguese — not glued to the left edge, not centered
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
- One rAF/interval pair for pace+captions on `/watch` only, paused when the tab is hidden

## 10. Acceptance (must be true on a real watch page)

1. Open a spoken video. Overlay shows a measured WPM in the ballpark of the speech (slow talk ~80–130, auctioneer much higher). Pause in a pause → 0
2. Pace lock 180 on a ~90 WPM speaker → player near 2×, overlay still says 180 WPM
3. Trim silence speeds through a ≥1.2 s gap without a seek hitch, then returns to the lock rate immediately
4. Clock total does not jump every second; parentheses only on the original total
5. Dual: pick Portuguese + Auto-translate English → two different texts, two colored checks, no clone
6. Center word tracks the spoken word, including Dual
7. Native settings: no Playback speed row; Dual/Color/Center only under Subtitles/CC; menus do not stack
8. ND on: related gone, avatar menu opens, In this video opens, logo does not freeze the tab
9. Reloading another video does not require toggling CC to make WPM work

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
