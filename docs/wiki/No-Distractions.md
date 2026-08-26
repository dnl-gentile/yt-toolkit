# No Distractions

A toggle on the YouTube masthead, to the right of the bell. It strips the pull out of
YouTube without breaking the parts you came for.

## What it hides

With No Distractions **on**:

- Theater mode is engaged
- **Related videos** — the sidebar of things to watch next
- **Comments**
- **Endscreen** cards — the grid that covers the video in the last twenty seconds
- The **Create** button and the **notification bell**
- The **left guide** is collapsed (via `#guide-button` only)
- The **homepage and the logo redirect** to a quiet search page instead of loading the
  recommendation feed

## What it deliberately keeps

This half matters as much as the first. The goal is removing the pull, not breaking the
site.

- **Your account menu always opens.** The avatar is never blocked. An extension that locks
  you out of your own account settings is broken, and a test enforces this
  specifically — a naive selector that matches the guide button also matches the avatar,
  and that bug has been shipped before.
- **Chapters and "In this video"** open normally.
- **The transcript panel** opens normally.
- **Search** works. You are redirected to a quiet search page, not to a dead end.
- **Playback, captions and everything the pace engine does** are untouched.

## The homepage redirect

With No Distractions on, navigating to `youtube.com` — or clicking the logo — takes you to
[`yt-search-bar.web.app`](https://yt-search-bar.web.app), a plain search box.

This is the point of the feature. The YouTube homepage is a recommendation engine; you
rarely open it because you wanted a specific thing. Search means you arrived with an
intention.

Turning No Distractions off restores the normal homepage immediately.

## Toggling

Click the toggle on the masthead. The state is remembered and, because it lives in
`chrome.storage.sync`, follows your Chrome profile to your other signed-in machines.

On a watch page, toggling applies **without a reload** — elements appear and disappear in
place. Off a watch page, it navigates: on to the quiet page, off to youtube.com.

Every open YouTube tab updates its icon at once, so two windows never disagree.

## It should never freeze the tab

Freezing was a real bug in an earlier version, and the fix is now part of the engineering
contract: no `MutationObserver` on `document.body` with `subtree: true`, no stacked
intervals doing the same hide work, and observers disconnected on `yt-navigate-finish`.

The budget is that a logo click reaches a responsive document in **under two seconds**.

If you hit an unresponsive tab on a logo click, on an SPA navigation, or on a settings
click, that is a serious regression —
[please report it](https://github.com/dnl-gentile/yt-toolkit/issues/new/choose) with the
page you were on.

## Lineage

No Distractions was the whole of
[yt-no-distractions-ext](https://github.com/dnl-gentile/yt-no-distractions-ext), this
project's predecessor. It carried over unchanged in spirit; the pace engine, captions and
clock were built around it.
