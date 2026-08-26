# Pace and WPM

This is what the extension is for. Everything else is a companion feature.

## The pill

A small pill sits at the top center of the player:

```
180 WPM  ·  1.75x
```

It is placed top-*center* on purpose — top-right would cover YouTube's info cards. It
fades in and out with YouTube's own controls, and stays visible while its menu is open.

Next to it is the adjusted watch clock. See [the clock](#the-watch-clock) below.

**Click the speedometer** to open the pace menu.

## Two modes

### Pace lock off — the pill measures

The WPM shown is the **measured local speaking rate** of the stretch you are in right now.
It moves as the speaker moves: a slow explanation reads 90, an excited run reads 200.

Pause in a silence, or sit through a musical interlude, and it reads **0**. That is
correct behavior, not a bug — a stale "190" during silence would be a lie about what is
happening.

The `x` is just the current playback rate, which you control.

### Pace lock on — the pill targets

Turn on **Pace lock** in the pace menu. Now the WPM is your **target**, and the extension
adjusts playback rate to hit it:

```
playbackRate = clamp(targetWpm / localWpm, 0.7, 2.5)
```

A speaker at 90 WPM with a 180 target plays near **2×**. A speaker already at 220 with a
180 target plays *below* 1× — the lock slows things down as readily as it speeds them up.

Rate changes ease in at about ±0.05× per tick during speech, so it does not lurch on every
sentence.

| | |
|---|---|
| Default target | 180 WPM |
| Range | 120–600 WPM, step 10 |
| Presets | 120 · 180 · 250 · 400 · 600 |
| Rate clamp | 0.7× to 2.5× |

### Picking a target

There is no correct number — it depends on you and on the material.

| Roughly | Feels like |
|---|---|
| 120–150 | Relaxed. Dense technical material, a second language |
| **180** | Brisk conversation. The default, and a good starting point |
| 200–250 | Fast. Familiar material, a speaker you know |
| 300+ | Skimming. Comfortable mainly with the caption features on |

Move it 10 at a time with <kbd>Shift</kbd>+<kbd>.</kbd> until you notice yourself
re-reading, then come back down 20.

## Trim silence

Toggle in the same menu. When on, any gap of **1.2 s or longer with no spoken word** is
accelerated: 4× normally, 8× past five seconds.

Two details that matter:

- **It does not seek.** Skipping by seeking flushes the decoder and produces an audible,
  visible hitch. Accelerating does not. The video stays continuous.
- **It ends on the first spoken word.** The moment speech resumes, the rate snaps back to
  your lock — in the same tick, not by drifting down from 8×. Riding a boost into speech is
  treated as a defect here.

It is most dramatic on lecture recordings, interviews with long pauses, and tutorials where
someone is typing. On a tightly edited video it barely fires.

## The watch clock

Beside the pill:

```
12:41 / 31:20 (57:04)
```

Read as **adjusted current / adjusted total (original total)**. The parenthesised value —
the only dim segment — is the video's real length. Everything before it is how long it will
actually take *you*, at your current settings.

The total is deliberately **stable**. It is computed from `(duration − trimmed silence) /
lockRate` using the video's median base speaking rate, not from the live rate that
oscillates every second. A clock flickering between 2:00 and 4:00 would be useless.

Trim's 4×/8× boosts never feed the clock — otherwise the estimate would collapse every
time a pause came along.

If pace lock is off, the rate is 1×, and trim changes nothing, the parentheses disappear.
There is nothing to adjust.

## Which captions get measured

Always the video's **original-language** track — the ASR or source captions.

This matters more than it sounds. If measurement followed whatever subtitle you have
*displayed*, then switching to Chinese, Japanese or Thai would break it: those scripts do
not put spaces between words, so the engine would see almost no words and enormous silence
gaps, and would park the player at trim boost.

So: display any subtitle you like, in any language, translated or not. The pace never
changes.

## How the measurement works

Enough detail to trust the number. Full invariants live in
[`docs/SPEC.md` §5](https://github.com/dnl-gentile/yt-toolkit/blob/main/docs/SPEC.md).

1. **WPM = unique spoken words ÷ real spoken time**, measured between distinct word
   onsets. There is no per-word duration floor. An early version had one (`n × 0.28 s`)
   and it made 80–120 WPM speech report as 180–214 — a test now fails if it comes back.
2. **YouTube's auto-captions roll their windows.** A cue says "hello there", the next says
   "there how are you". "there" is one word, not two. Repeated tokens across overlapping
   cues are deduplicated.
3. **`[Music]`, `[Applause]`, `♪` are not speech.** They are excluded.
4. **A pause of ~1.15 s or more with no word displays 0.** Not 0.6 s — that threshold
   treats the natural gaps in slow speech as silence. Trim uses its own, slightly higher
   1.2 s floor.
5. **The base rate is a median**, over utterances of at least 4 words spanning at least
   1.5 s. Medians ignore the one outlier burst that would otherwise skew the clock.
6. Captions are fetched from the player response and `/api/timedtext` **without turning CC
   on**. You never have to enable subtitles to make the pace work.

## Adjusting from the keyboard

| | Lock off | Lock on |
|---|---|---|
| <kbd>Shift</kbd>+<kbd>,</kbd> | −0.25× | −10 WPM |
| <kbd>Shift</kbd>+<kbd>.</kbd> | +0.25× | +10 WPM |

See [Keyboard shortcuts](Keyboard-Shortcuts).

## Where did YouTube's speed control go

Hidden, deliberately. Two speed controls that disagree is worse than one — YouTube's row
would show a number that the pace lock overwrites a second later.

The extension's speedometer is the source of truth. With pace lock off, the pace menu is a
native-style multiplier picker (0.25–4, presets 1.0 · 1.25 · 1.5 · 2.0 · 3.0) and behaves
exactly like the row it replaced.
