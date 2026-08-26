# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.6.x | ✅ |
| < 1.6 | ❌ — upgrade first |

This is a single-maintainer project. Only the latest release gets fixes.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/dnl-gentile/yt-toolkit/security/advisories/new).
It goes straight to the maintainer and stays private until a fix ships.

If private reporting is unavailable to you, open a public issue that says only *"security
report, please open a private channel"* — with no detail — and wait to be contacted.

### What to include

- What an attacker can do, concretely
- Steps to reproduce, ideally with the extension version and Chrome version
- The file and line if you have it
- Whether you intend to disclose publicly, and when

### What to expect

| | |
|---|---|
| First reply | Within 7 days |
| Assessment | Within 14 days |
| Fix for a confirmed high-severity issue | As fast as a release can be cut |
| Credit | Yes, in the advisory and changelog, unless you prefer otherwise |

There is no bug bounty.

## Scope

**In scope** — anything in this repository:

- Content scripts running on `youtube.com` (they run with page access; injection or
  privilege problems there are real)
- The background service worker and its message handlers — in particular `QT_FETCH`,
  which fetches a URL with credentials on behalf of a content script
- The options page
- The manifest: over-broad permissions, over-broad `web_accessible_resources`
- Supply chain: a compromised dev dependency reaching the shipped extension

**Out of scope:**

- YouTube's own bugs — report those to Google
- The quiet search page at `yt-search-bar.web.app` (separate deployment)
- Vulnerabilities requiring an already-compromised browser profile or physical access
- Missing hardening with no described exploit path

## Known and accepted

Documented so nobody spends time reporting it as new:

- **The GA4 Measurement Protocol API secret is in the source.** It has to reach the
  client, and this client is open source, so it is public by construction. The worst case
  is someone injecting junk events into the maintainer's analytics property — annoying,
  not a user-data risk. The secret grants write-only access to that property and can read
  nothing. See [issue tracker](https://github.com/dnl-gentile/yt-toolkit/issues) for the
  rotation and mitigation plan.
- **Content scripts run in the page world** where the manifest declares
  `"world": "MAIN"` (`content/inject.js`). That is required to hook the player's fetch
  and read `ytInitialPlayerResponse` without forcing captions on. Reports about that file
  specifically are welcome and taken seriously.

## Hardening the project already does

- Manifest V3, no remotely hosted code, no `eval`, no bundled third-party runtime
- Host permissions limited to two origins plus the analytics endpoint
- Native caption DOM is read, never rewritten
- No `history`, `cookies`, `webRequest` or all-sites access
- CI runs the test suite on every push and pull request
