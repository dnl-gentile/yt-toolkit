# Architecture

A tour of how the pieces fit. The authoritative contract is
[`docs/SPEC.md`](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/SPEC.md).

## Shape

A Manifest V3 extension with no build step, no bundler and no framework. Plain JavaScript
loaded in a specific order.

```
manifest.json          MV3 wiring — load order is significant
background.js          Service worker
analytics.js           Telemetry, imported by the worker
options.html/js/css    Options page (privacy only)

lib/                   Pure logic. No Chrome APIs, no DOM. This is what unit tests cover
  timedtext.js         Parse YouTube caption XML and json3
  wpm.js               Words per minute, silence detection, lock rate, trim boost
  clock.js             Adjusted watch-time formatting and stable totals
  dual-lang.js         Language identity (en ≡ tlang:en) and slot assignment

content/               Player-facing. DOM, Chrome APIs, YouTube's chrome
  inject.js            MAIN world, document_start. Hooks fetch, reads player response
  yt-menu-patch.js     Hides Playback speed, injects rows into Subtitles/CC
  pace.js              The pill, the pace menu, the rate loop, keyboard
  captions.js          Dual lines, color highlight, center word

content_script_youtube.js   No Distractions, masthead toggle
content_script_searchapp.js Toggle on the quiet search page
```

The `lib/` and `content/` split is the important one. Everything that can be tested
without a browser lives in `lib/`, and that is where the load-bearing math is.

## Load order

`manifest.json` lists content scripts in dependency order:

```
lib/timedtext.js → lib/wpm.js → lib/clock.js → lib/dual-lang.js
→ content_script_youtube.js → content/yt-menu-patch.js
→ content/pace.js → content/captions.js
```

Reordering breaks things silently — an integration test asserts `dual-lang` loads before
the menu and caption scripts.

`content/inject.js` is separate: **MAIN world**, `document_start`. It has to run before
the player initialises to hook `fetch` and read `ytInitialPlayerResponse`.

## Getting the captions

The engine needs a transcript. It must **not** turn CC on to get one — forcing subtitles
on a user to power a hidden feature is against the spec. So there are layered sources:

1. **`ytInitialPlayerResponse`**, read at `document_start` before the page mutates it
2. **A fetch hook** in the MAIN world, catching `/api/timedtext` requests the player makes
   on its own
3. **A direct fetch** of the timedtext URL, routed through the service worker
   (`QT_FETCH`) so it carries credentials

Responses come as XML or json3. `lib/timedtext.js` parses both into a common cue shape:
text, start time, and per-word offsets when the format provides them.

On `yt-navigate-finish`, cached cues, tracks and language state are cleared and the fetch
runs again for the new video.

### Always the original language

Pace measurement pins itself to the video's **original-language** track, regardless of
what subtitle is displayed. Following the displayed track would break on Chinese, Japanese
or Thai — no spaces between words means almost no detected words and enormous apparent
silence, which parks the player at trim boost.

## The WPM engine

`lib/wpm.js`, and the part that has been wrong most often. Invariants in
[`docs/SPEC.md` §5](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/SPEC.md).

**Word onsets, not durations.** WPM is unique spoken words divided by real spoken time,
measured between distinct word onsets. There is no per-word duration floor. A previous
`n × 0.28 s` floor made 80–120 WPM speech report as 180–214, and a regression test now
fails if anything like it returns.

**Rolling-window dedupe.** YouTube's auto-captions overlap: "hello there" then "there how
are you". Repeated tokens across overlapping cues are one word.

**Noise filtering.** `[Music]`, `[Applause]`, `♪` are not speech.

**Silence at ~1.15 s.** Below that, the gaps in slow speech would be misread as silence.
Trim uses its own 1.2 s floor.

**Median base rate.** Over utterances of at least 4 words spanning at least 1.5 s. The
median is what the clock and the initial lock use; the live local rate is what the pill
shows when unlocked.

**Lock:** `clamp(targetWpm / localWpm, 0.7, 4)`, eased ±0.05× per tick during speech,
but **snapped** — not eased — when returning from a trim boost.

**Trim:** accelerate gaps ≥ 1.2 s to 4×, or 8× past 5 s. Never seek. Never write a
compounded 9.6×/16×. The lock must not mistake a trim boost for a measurement.

## The clock

`lib/clock.js`. The adjusted total uses `(duration − trimmed silence) / lockRate` with the
**median** base rate — never the live oscillating rate, and never a trim boost. That is
what keeps it from flickering between 2:00 and 4:00.

The divisor is by definition the × shown on the pill, so the two can never disagree.

## Menu injection

`content/yt-menu-patch.js` does the two host-coupled patches:

1. Hide the native **Playback speed** row
2. Insert **Dual / Color highlight / Center word** into the Subtitles/CC panel, right
   after **Off**

Both are cat-and-mouse with YouTube by design. The observer runs **only while
`.ytp-settings-menu` is open**, never continuously. Bound selectors are catalogued in
`tests/host/selectors.json`, and
[`docs/YOUTUBE-MONITOR.md`](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/YOUTUBE-MONITOR.md)
is the plan for noticing drift before users do.

## Performance rules

YouTube's DOM is enormous. The forbidden list is short and each entry is a bug that
already froze a tab:

- No `MutationObserver` on `document.body` with `subtree: true` while idle
- No stacked `setInterval` loops doing the same hide/collapse work
- Never rewrite the native caption DOM

Allowed: one observer each on `#movie_player`, `ytd-masthead`, `ytd-watch-flexy` as they
appear; `yt-navigate-finish` to reset state and **disconnect** stale observers; a single
rAF/interval pair for pace and captions, on `/watch` only, paused when the tab is hidden.

## The service worker

`background.js`:

- Sets install defaults for every setting, including `qt_telemetry`
- Watches `webNavigation` for a YouTube homepage load and redirects it when No
  Distractions is on
- Handles `QT_FETCH` — a credentialed fetch on behalf of a content script
- Owns the No Distractions toggle and broadcasts state so every open tab agrees
- Owns telemetry. Content scripts have none

## Telemetry

`analytics.js`, one class, one choke point. Every send goes through `sendEvent`, which
returns early unless `isEnabled()` says yes. Storage missing or throwing means **no**
reporting, never a fallback to on.

Enforced by `tests/integration/telemetry.test.js`, which was mutation-checked: delete the
gate and two tests go red. See
[Privacy and telemetry](Privacy-and-Telemetry).
