# W-015 — independent refutation review

Final disposition: automated slice approved; real-host gate pending.

## Findings and disposition

1. Exact 1.15 s split mismatch — fixed by using the inclusive boundary in
   base and local cadence; regression covers 1.149/1.150/1.151 s.
2. Per-video normalization changed the same sample based on unrelated
   vocabulary — removed. Equivalent-word scale is fixed across videos.
3. Prepared-array mutation could leave a stale WeakMap profile — production
   arrays are immutable/replaced; the contract is now explicit next to the
   cache and its caller.
4. Applying 40–420 after weighting erased valid long/fast or short/slow speech
   and could make Lock appear stuck — fixed. Literal timestamps are validated
   first; the equivalent value is then returned and accepted by Lock.
5. The first implausibly-fast base regression had a span below the base sample
   minimum — corrected from 10 to 20 tokens so it exercises the 420 filter.

Final independent checks reported 40/40 focused tests, 98/98 unit tests, clean
diff check, and no remaining P0/P1 in W-015-owned behavior.
