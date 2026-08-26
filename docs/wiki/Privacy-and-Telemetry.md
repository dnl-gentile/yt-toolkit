# Privacy and telemetry

The short version, then how to verify it yourself.

The canonical policy is
[`PRIVACY.md`](https://github.com/dnl-gentile/yt-toolkit/blob/main/PRIVACY.md) in the
repository. This page is the same thing with the reasoning included.

## What is sent

Four anonymous, aggregate counts:

| Event | When |
|---|---|
| `extension_installed` | First install. Carries the extension version |
| `toggle_no_distractions` | You toggle No Distractions. Carries on/off |
| `homepage_redirected` | The homepage redirected to the quiet page |
| `video_page_visited` | You toggled No Distractions on a watch page |

They go to a Google Analytics 4 property over the Measurement Protocol. That is the
complete list — there is no fifth event hiding somewhere.

## What is never sent

- Video IDs, titles, URLs, channels
- Caption, subtitle or transcript text
- Search terms
- Watch history, recommendations, your feed
- Your Google account, email, name or avatar
- Comments, playlists, subscriptions, likes
- Keystrokes, form input, cookies, page content
- Anything from any site other than YouTube

There is no analytics code in the content scripts at all. Telemetry lives only in the
background service worker, which never sees page content.

<img src="options.png" width="620" alt="The options page: a Privacy card with the usage-statistics switch and an installation ID reset" />

## Turning it off

1. `chrome://extensions`
2. **YouTube Toolkit** → **Details**
3. **Extension options**
4. Uncheck **Send anonymous usage statistics**

Immediate, no restart. With the switch off nothing leaves your browser — every send passes
through one gate, and that gate is covered by a
[test](https://github.com/dnl-gentile/yt-toolkit/blob/main/tests/integration/telemetry.test.js)
that fails if anyone removes it.

The same page has a **Reset** button for the installation ID.

## The installation ID

A random string — a timestamp plus random characters — generated on the first event and
stored on your device in `chrome.storage.local` as `ga_client_id`. Its only job is to stop
one installation being counted as many.

It is not derived from your account, email, device, IP or any hardware value. Reset it and
this installation looks brand new.

## What stays on your device

Your settings, in Chrome's own storage: the No Distractions state, WPM target, pace lock,
trim, the caption toggles, where you dragged the caption lines, and the telemetry switch
itself.

They use `chrome.storage.sync`, so Chrome may sync them to your other signed-in Chrome
installs. That is Chrome's sync feature, not a server of ours — there is no account, no
login, and no backend in this project at all.

Uninstalling removes everything.

## Network requests

| To | Why |
|---|---|
| `youtube.com/api/timedtext` | Fetch the caption track the pace engine measures |
| `google-analytics.com/mp/collect` | The four events above — nothing when you opt out |
| `yt-search-bar.web.app` | The quiet page No Distractions redirects the homepage to |

Caption fetches happen only on watch pages, only for the video you are watching, and the
result is used in your browser and transmitted nowhere.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Remember your settings |
| `webNavigation` | Notice a homepage load so No Distractions can redirect it |
| `youtube.com` | The product runs there |
| `yt-search-bar.web.app` | Show the toggle on the quiet page |
| `google-analytics.com` | Send the events above |

No `history`, no `cookies`, no `webRequest`, no access to other sites.

## Verifying any of this

Do not take it on faith — the source is public and GPL-licensed.

**Watch the network yourself.** `chrome://extensions` → Details → **Inspect views: service
worker** → Network tab. Toggle No Distractions and watch what goes out. Then uncheck the
privacy switch and do it again: nothing.

**Read the code.**
[`analytics.js`](https://github.com/dnl-gentile/yt-toolkit/blob/main/analytics.js) is about
150 lines and holds every network call telemetry makes.

## The API secret question

The GA4 Measurement Protocol secret is visible in the source. This is unavoidable: it has
to reach the client, and this client is open source.

What that means concretely: someone could inject junk events into the maintainer's
analytics property. Annoying for him, irrelevant to you — the credential is write-only and
can read nothing, and it grants no access to any user data, because no user data exists to
access. It is documented as a known issue in
[SECURITY.md](https://github.com/dnl-gentile/yt-toolkit/blob/main/SECURITY.md).

## Third parties

Google Analytics, for the four events, and nothing else. No advertising network, no
attribution, no error reporting, no bundled third-party library, no remotely loaded code.

Opting out means no request reaches Google at all.
