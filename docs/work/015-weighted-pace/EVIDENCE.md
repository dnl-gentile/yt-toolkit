# W-015 — evidence

Date: 2026-08-28

## Red first

Before the weighted implementation:

`node --test tests/wpm.test.js`

- 31 tests: 25 passed, 6 failed.
- Missing-load tests failed, same-final-onset produced a 240 WPM spike instead
  of 120, and 0.90 s slow speech produced zero base WPM.

## Final focused and unit evidence

`node --test tests/wpm.test.js tests/pace-performance.test.js`

- 40/40 passed after review fixes.
- Covers fixed cross-video load scale, connectors, Unicode normalization,
  same-onset grouping, 1.15 s inclusivity, bounded 20k-token hot path, slow
  speech, valid equivalent WPM below 40 and above 420, and rejection of
  implausible literal timestamp cadence.

`npm test`

- 98/98 passed.

`git diff --check`

- Passed with no output.

## Mutation evidence

The slow-speech invariant was inverted temporarily from `rate < 150` to
`rate >= 150`, then the named test was run:

`node --test --test-name-pattern="measures ~80 WPM slow speech" tests/wpm.test.js`

- Failed as required with the observed real rate `80`.
- The assertion was restored and the same named test passed 1/1.

## Browser/integration evidence

`npx playwright test --project=browser tests/browser/ui-interactions.spec.js --grep "trim boost is visible"`

- 1/1 passed. The weighted stable clock is unchanged by a live 8x Trim boost,
  and the pill recovers to the weighted live Lock rate.

`npm run test:integration`

- Integration contracts: 9/9 passed.
- Browser contracts: 55/59 passed.
- Four unrelated UI contracts remain red in the deliberately dirty tree:
  native/Toolkit menu mutual close, lower-clock fixture paint, fallback pill
  fixture paint, and caption-overlay font-size fixture. They reproduce in
  isolation and are not being hidden or claimed green by W-015.

## Controlled comparison

Two separate ten-token fixtures used short connectors at 0.30 s/onset and
long technical words at 0.73 s/onset:

| Calculation | Short passage | Long passage |
| --- | ---: | ---: |
| Literal-token WPM | 200.00 | 82.19 |
| Fixed equivalent-word WPM | 152.00 | 151.60 |

This is a deterministic regression fixture, not real-host acceptance.

## Review and remaining gate

Independent read-only refutation review found and drove fixes for the exact
1.15 s boundary, global-vocabulary dependence, post-weight sanity filtering,
and one false-positive base-WPM regression. Final review found no P0/P1. The
same-length mutation limitation of the WeakMap cache is explicitly bounded by
the production contract: `timedWords` arrays are immutable and replaced when
cues change.

Tier L remains pending until a refreshed unpacked extension is accepted on
real YouTube original-language ASR in at least Portuguese and English.
