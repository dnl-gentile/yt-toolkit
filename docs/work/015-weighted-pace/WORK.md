# W-015 — weighted Pace Lock cadence

Supersedes the literal-token portion of `docs/SPEC.md` §5 while preserving its
timing authority, silence, Trim, clock, and performance invariants.

## Problem

Every whitespace token currently contributes one word. A short connector and a
long technical term therefore have equal numerator weight. Their real onset
intervals enter the denominator, so Pace Lock tends to accelerate long-word
passages and decelerate connector-heavy passages to maintain literal lexical
WPM.

`baseWpm()` also splits utterances at 0.85 s although the product's actual
silence boundary is 1.15 s. Slow but continuous speech can consequently have a
valid local WPM and a zero base WPM.

## New calculation

For each original-ASR token:

1. Count Unicode letters and numbers after NFC normalization.
2. Map that length to a conservative bounded load: `0.6 + 0.08 × length`,
   clamped to `0.6..2.0`.
3. Keep that scale fixed across videos: five characters equal one equivalent
   word, so unrelated vocabulary cannot change the same spoken sample.
4. Sum completed onset groups only. Tokens sharing the final timestamp do not
   inflate the current sample before their duration is observable.
5. Divide completed equivalent-word units by real spoken time and multiply by
   60.

The existing 40–420 sanity range validates the unweighted timestamp cadence,
not the weighted result. Otherwise legitimate long-word speech above 420
equivalent WPM, or one-character speech below 40, would be erased as missing.

Connectors remain positive speech units. Punctuation/noise contributes zero.
No phonetic syllables are invented. Trim and silence still use timestamps only.

## Out of scope / registered follow-up

- Language-specific phonetic syllabification.
- ASR offset repair beyond same-onset grouping.
- The separately observed call-count-dependent smoothing and post-pause
  bootstrap behavior in `content/pace.js`.
- Windows caption/menu layout inconsistencies and intermittent ASR acquisition;
  these require their own live traces.
