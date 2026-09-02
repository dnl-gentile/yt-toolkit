# Privacy Policy — YouTube Toolkit

Last updated: **2026-08-26** · Applies to version **1.6.1** and later.

This document describes every piece of data YouTube Toolkit stores or transmits. It is
written to match the code; if you find a discrepancy, that is a bug worth
[reporting](https://github.com/dnl-gentile/yt-toolkit/issues).

The authoritative sources are [`analytics.js`](analytics.js),
[`background.js`](background.js) and [`docs/SPEC.md` §11](docs/SPEC.md).

## Short version

The extension sends **anonymous, aggregate counts** of a few actions — that the extension
was installed, that someone toggled No Distractions, that a homepage redirect happened.
It never sends what you watch, search for, or read.

You can turn it off completely: **`chrome://extensions` → YouTube Toolkit → Details →
Extension options → uncheck *Send anonymous usage statistics***. With the switch off,
nothing leaves your browser.

## What is collected

Usage events go to a Google Analytics 4 property over the
[Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4).
Every event carries an installation ID (see below), the event name, and the fields listed
here — nothing else.

| Event | When it fires | Fields sent |
|---|---|---|
| `extension_installed` | First install only | Extension version (e.g. `1.6.1`) |
| `toggle_no_distractions` | You toggle No Distractions | Whether it went on or off |
| `homepage_redirected` | The YouTube homepage redirects to the quiet page | *(none)* |
| `video_page_visited` | You toggle No Distractions while on a watch page | *(none)* |

Two further helpers exist in `analytics.js` — `feature_usage` and `page_view` — but no
code currently calls them. They are listed here so the table stays complete if that
changes. Wiring one up requires updating this file in the same change
(`docs/SPEC.md` §11).

### Installation ID

On the first event sent, the extension generates a random string (a timestamp plus random
characters) and stores it in `chrome.storage.local` under `ga_client_id`. Its only purpose
is to keep one installation from being counted as many.

It is **not** derived from your Google account, your email, your device, your IP address,
or any hardware identifier. It never leaves your device except as an opaque string
attached to the events above. You can wipe it any time with **Reset** on the options page;
the next event starts a fresh one.

## What is never collected

Explicitly, and enforced by the shape of the code — none of this is ever read for
telemetry purposes, let alone transmitted:

- Video IDs, titles, URLs, channels, or thumbnails
- Caption, subtitle or transcript text
- Search terms
- Watch history, recommendations, or your feed
- Your Google account identity, email, name or avatar
- Comments, playlists, subscriptions, or likes
- Page content, form input, keystrokes, or cookies
- Anything at all from sites other than YouTube

The extension has **no** analytics or tracking on the content scripts. Telemetry lives
only in the background service worker.

## What is stored on your device, and never sent

Your settings live in Chrome's own storage and stay there. `chrome.storage.sync` means
Chrome may sync them to your other signed-in Chrome installs — that is Chrome's sync, not
a server of ours.

Settings are written to **both** `chrome.storage.sync` and `chrome.storage.local`, and read
back local-first. The complete set:

| Key | What it is |
|---|---|
| `noDistractionsEnabled` | No Distractions on/off |
| `qt_targetWpm`, `qt_paceLock`, `qt_trimSilence` | Pace lock target, and whether lock and trim are on |
| `qt_playbackRate`, `qt_fixed1x` | Your manual speed, and whether the global fixed-1x state is on |
| `qt_overlayMode`, `qt_wordHighlight`, `qt_centerWord`, `qt_dualCaptions`, `qt_captionBg` | Caption and overlay toggles |
| `qt_captionLangs`, `qt_primaryTrack`, `qt_secondaryTrack`, `qt_displayCaption`, `qt_captionsEnabled` | Which caption languages you picked and whether captions were on |
| `qt_captionPos` | Where you dragged the caption lines |
| `qt_vjs_dualCaptions`, `qt_vjs_primaryTrack`, `qt_vjs_secondaryTrack`, `qt_vjs_slotsChosen` | The same caption choices, kept separately for the course player below |
| `qt_telemetry` | The privacy switch on the options page |
| `ga_client_id` | Installation ID (local only), described above |

Every one of these is a **setting**. None of them stores what you watched, searched for, or
read — there is no history, no video list, no transcript cache.

There is no account, no login, no server of ours holding any of it. Uninstalling the
extension removes all of it.

## Network requests the extension makes

| Destination | Why | Contains |
|---|---|---|
| `https://www.youtube.com/api/timedtext` | Fetch the caption track the pace engine measures | A standard YouTube caption request, made in your browser as you |
| `https://www.google-analytics.com/mp/collect` | The events above | Only what the table above lists — and nothing at all when you opt out |
| `https://yt-search-bar.web.app` | The quiet page No Distractions redirects the homepage to | A normal page load. No data is attached to it by the extension |

Caption fetches happen only on watch pages, and only for the video you are watching. They
are the mechanism of the product, not analytics: the results are used in your browser and
never transmitted anywhere.

**The course player makes none.** On `tvweb3.unip.br` (below) the extension issues no network
request at all — no `fetch`, no `XMLHttpRequest`, and no telemetry.

## Permissions, and why each one exists

| Permission | Why it is needed |
|---|---|
| `storage` | Remember your settings between sessions |
| `webNavigation` | Detect a YouTube homepage load so No Distractions can redirect it |
| `https://www.youtube.com/*` | The whole product runs on YouTube pages |
| `https://yt-search-bar.web.app/*` | Show the No Distractions toggle on the quiet page |
| `https://www.google-analytics.com/*` | Send the usage events above |
| `https://tvweb3.unip.br/*` | Playback controls on that course player — see the section below |

The extension requests no `tabs` content access beyond these hosts, no `history`, no
`cookies`, no `webRequest`, and no access to any other site.

## The course player on `tvweb3.unip.br`

The extension also runs on one non-YouTube host: the Video.js player used by UNIP's course
site. This is an **allow-list of exactly one**, written literally into `manifest.json`. It is
not a wildcard, and the extension does nothing on any other site.

What runs there is a small playback adapter — the speed pill, its slider and presets, the
adjusted watch clock, and dual subtitles built from caption tracks **the course player has
already loaded**. What does *not* run there:

- No Distractions
- The YouTube menu patches
- Caption acquisition of any kind — nothing is fetched, so Pace lock, Trim silence, Colour
  highlight, Center word and WPM are all deliberately unavailable rather than guessed at
- Telemetry

It keeps six of its own settings in the extension's storage: `qt_fixed1x` and
`qt_playbackRate` (shared with YouTube, which is how one fixed-1x state covers both), plus
`qt_vjs_dualCaptions`, `qt_vjs_primaryTrack`, `qt_vjs_secondaryTrack` and
`qt_vjs_slotsChosen`.

It also touches **two keys in the course site's own `localStorage`**, which belong to that site
rather than to the extension:

| Key | Read or written | Why |
|---|---|---|
| `videoPlaybackSpeed` | written | The site's own speed memory. Kept in step so the page restores the speed you actually chose, instead of fighting the extension on the next video |
| `idioma` | read, and written when you pick a subtitle language | The site's own subtitle-language memory, used to work out which language to show first |

Both already exist on that site and are how it remembers those two choices for itself. Nothing
else on the page is read: not course content, not your identity there, not grades or enrolment.

Nothing from that host is transmitted anywhere, because that host is never contacted by us at
all — the adapter issues no request of any kind.

## Third parties

Google Analytics is the only third party, and only for the events listed above. Google's
handling of that data is governed by the
[Google Privacy Policy](https://policies.google.com/privacy). Opting out means no request
is made to them at all.

The extension bundles no third-party libraries, loads no remote code, and contacts no
advertising, attribution or error-reporting service.

## Your controls

- **Opt out of telemetry** — options page, *Send anonymous usage statistics*. Immediate,
  no restart.
- **Reset the installation ID** — options page, **Reset**.
- **Remove everything** — uninstall the extension. Chrome deletes all its storage.
- **Verify any of this** — the source is
  [public and GPL-licensed](https://github.com/dnl-gentile/yt-toolkit). The opt-out is
  covered by [`tests/integration/telemetry.test.js`](tests/integration/telemetry.test.js).

## Children

The extension is not directed at children under 13 and collects nothing that would
identify anyone of any age.

## Changes to this policy

Material changes ship with a version bump and an entry in
[CHANGELOG.md](CHANGELOG.md). The date at the top of this file always reflects the last
substantive edit.

## Contact

Open an issue at
[github.com/dnl-gentile/yt-toolkit/issues](https://github.com/dnl-gentile/yt-toolkit/issues).
For anything security-sensitive, follow [SECURITY.md](SECURITY.md) instead.
