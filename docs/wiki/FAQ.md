# FAQ

### Does it work on videos without captions?

The pace features do not — there is nothing to measure, and the extension will not invent
a transcript. No Distractions works everywhere.

In practice most videos have auto-generated captions, which is exactly what the engine is
built for.

### Does it need me to turn subtitles on?

No. The caption track is fetched directly from the player response and `/api/timedtext`.
You never have to enable CC to make the pace work.

The caption *features* — Dual, highlight, center word — do need CC on, since they are
drawing on top of subtitles you asked for.

### Why is my WPM 0?

You are in a silence, or the video has no captions. A pause of about 1.15 s with no word
displays 0 on purpose — holding a stale number through silence would be misleading. See
[Pace and WPM](Pace-and-WPM).

### What is a good WPM target?

180 is the default and a good place to start. Conversational English runs roughly 150–160;
audiobooks about 150; fast presenters 200+. Move in steps of 10 until you catch yourself
re-reading, then come back down 20.

### Does changing my subtitle language change the speed?

No, and that is deliberate. Pace always reads the video's original-language track. Display
whatever subtitle you like — including auto-translations — and the rate is unaffected.

If measurement followed the *displayed* subtitle, switching to Chinese or Japanese would
break it: those scripts do not space words, so the engine would see near-zero words and
huge silence gaps.

### Where did YouTube's playback speed setting go?

Hidden on purpose. Two speed controls that disagree is worse than one. The extension's
speedometer replaces it, and with pace lock off it behaves like a normal multiplier picker
(0.25–4).

### Does trim silence skip ahead?

No — it *accelerates* the gap. Seeking flushes the video decoder and produces a visible
hitch; accelerating keeps playback continuous. It returns to your locked rate on the first
spoken word.

### Will this get me in trouble with YouTube?

No. The extension uses the same caption endpoint your browser already calls to render
subtitles, requested as you, for the video you have open. It does not scrape, does not
bulk-download, does not touch ads, and does not automate anything.

### Does it block ads?

No. It is not an ad blocker and has no plans to become one.

### Does it work on YouTube Music, mobile, or embedded videos?

No. Only `https://www.youtube.com` — not `music.youtube.com`, not `m.youtube.com`, not
embedded players on other sites. Chrome on Android and iOS does not support extensions at
all.

### Firefox?

No port exists. Firefox uses different extension APIs and it would be real work, not a
recompile. If you want to do it, open an issue first.

### Is it on the Chrome Web Store?

Not yet. Install [unpacked](Installation) — five steps, about a minute.

### Does it send my data anywhere?

It sends anonymous counts: installs, No Distractions toggles, homepage redirects. Never
video IDs, titles, caption text, search terms, watch history or account data. And you can
turn it off entirely on the options page. Full detail:
[Privacy and telemetry](Privacy-and-Telemetry).

### Does it slow YouTube down?

It runs under a written performance budget: at most two `MutationObserver` instances while
idle, none on `document.body` with `subtree: true`, a single rAF/watchdog pair on watch
pages, and the menu patch active only while the settings menu is open. Freezing the tab is
treated as a serious defect, not a quirk.

### Can I use it with other YouTube extensions?

Usually. Conflicts are most likely with anything else that writes `playbackRate` or
rewrites the player chrome. If something misbehaves, disable others and retest before
reporting.

### Why GPL instead of MIT?

The predecessor project was GPL and the code carries a GPL header. Keeping it means a
modified version distributed to others has to stay free too. You can still use, study and
modify it however you like privately.

### Who makes this?

Daniel Gentile. Source, issues and pull requests:
[github.com/dnl-gentile/yt-toolkit](https://github.com/dnl-gentile/yt-toolkit).
