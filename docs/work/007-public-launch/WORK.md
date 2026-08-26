# W-007 — public repo launch

## Why

The repository is going public as the promotion channel for the extension. Three things
blocked that.

**No licence.** `background.js` carried a GPLv3-or-later header since the predecessor
project, but there was no `LICENSE` file, so GitHub reported the repo as
all-rights-reserved. Anyone who cloned it had no grant.

**Telemetry with no way out.** The extension reports to GA4 with the Measurement Protocol
secret in the source — unavoidable in an open-source client, but it means the code is now
readable by everyone it reports about. Undisclosed, un-opt-outable telemetry in a public
privacy-adjacent extension is indefensible, and it also blocks a Chrome Web Store listing,
which requires a privacy policy matching actual behavior.

**A README written for one reader.** Eight bullet points of shorthand that assume you
already know what the project is.

## What

Per `docs/SPEC.md` supersession 2026-08-26:

1. **`LICENSE`** — GPL-3.0-or-later, matching the existing header. SPDX identifiers on
   touched sources, `license` field in `package.json`. New `docs/SPEC.md` §12.
2. **Telemetry opt-out** — `qt_telemetry` in `chrome.storage.sync`, default `true`,
   enforced at a single choke point in `Analytics.sendEvent`. Storage missing or throwing
   means no reporting, never a fallback to on. New `docs/SPEC.md` §11.
3. **Options page** — the surface the opt-out needs, plus an installation-ID reset.
   Deliberately holds nothing else: player settings stay in the pace pill and the
   Subtitles/CC menu, and §11 records that as a rule so nobody migrates them later.
4. **`PRIVACY.md`** — every event, field, storage key, network destination and permission,
   written against the code rather than from memory. `trackFeature` and `trackPageView`
   exist but have no call sites; the table says so rather than implying they fire.
5. **README, wiki, community files** — README rewritten for someone who has never seen the
   project. 14 wiki pages under `docs/wiki/`, versioned and reviewed like code, published
   with `npm run wiki:publish`. `CONTRIBUTING.md` carries the evidence bar and the
   never-do list out of `docs/QUALITY.md` and `AGENTS.md` so a first-time contributor
   meets them before the maintainer has to repeat them.
6. **`npm run package`** — reproducible release ZIP, syntax-checks the staged scripts,
   refuses to build on a manifest/package version mismatch.

## What this does not do

- **The GA4 secret is not rotated.** Rotating it is the maintainer's action in the Google
  Analytics console; the code change alone would accomplish nothing. Documented in
  `SECURITY.md` under known-and-accepted, with the exposure stated plainly: write-only,
  injectable junk events, no read access, no user data reachable.
- **No screenshots.** `docs/media/SHOTLIST.md` specifies the four captures and where each
  one goes. The README carries a marked placeholder rather than a broken image link.
- **The wiki is not published.** GitHub refuses a push to a wiki that has never been
  initialised. One page must be created in the web UI first; `scripts/publish-wiki.sh`
  says so when it fails.

## Spec sections

- `docs/SPEC.md` supersession 2026-08-26 — telemetry, options page, licence
- `docs/SPEC.md` §11 — telemetry and privacy contract, options page scope
- `docs/SPEC.md` §12 — licence
- `docs/SPEC.md` §3 — options page paint follows the native contract
- `docs/QUALITY.md` §1 — the evidence bar the PR template is built around
- `docs/QUALITY.md` §5 — the mutation discipline, applied here to the telemetry gate
