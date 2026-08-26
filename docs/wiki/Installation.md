# Installation

YouTube Toolkit is not on the Chrome Web Store yet. Until it is, you load it unpacked —
which is a supported Chrome feature, not a workaround, and takes about a minute.

## 1. Get the files

**Option A — release ZIP (recommended)**

Download the newest ZIP from
[Releases](https://github.com/dnl-gentile/yt-toolkit/releases) and unzip it somewhere
permanent. Not your Downloads folder: Chrome loads the extension *from that folder every
time it starts*, so if you delete or move it, the extension disappears.

**Option B — clone the repository**

```bash
git clone https://github.com/dnl-gentile/yt-toolkit.git
```

Use this one if you want to pull updates with `git pull` instead of re-downloading.

## 2. Open the extensions page

Type `chrome://extensions` in the address bar. (Edge: `edge://extensions`. Brave:
`brave://extensions`.)

## 3. Turn on Developer mode

Toggle in the top-right corner. Without it, the **Load unpacked** button does not appear.

## 4. Load unpacked

Click **Load unpacked** and select the folder that **contains `manifest.json`** — the
folder itself, not the file, and not a folder above it.

If you get *"Manifest file is missing or unreadable"*, you selected the wrong level. Go one
folder deeper (a downloaded ZIP often unpacks into `yt-toolkit/yt-toolkit/`).

## 5. Check it works

Open any captioned video, for example
[this TED talk](https://www.youtube.com/watch?v=iG9CE55wbtY).

You should see:

- A **pill at the top center of the player** reading something like `142 WPM · 1.0x`. It
  fades with the rest of YouTube's controls when they hide.
- A **No Distractions toggle** on the masthead, to the right of the bell.
- Three new rows — **Dual**, **Color highlight**, **Center word** — in the gear menu under
  **Subtitles/CC**, right below **Off**.

If none of that appears, see [Troubleshooting](Troubleshooting).

## Keeping it updated

Chrome does not auto-update unpacked extensions. To update:

```bash
git pull
```

…or download the new ZIP and replace the folder's contents. Then go to
`chrome://extensions` and click the **reload icon** on the YouTube Toolkit card. Refresh
any open YouTube tab.

Watch [Releases](https://github.com/dnl-gentile/yt-toolkit/releases) to be notified —
**Watch** → **Custom** → **Releases** on the repository.

## Things you will notice

**A "Disable developer mode extensions" warning on startup.** Chrome shows this for every
unpacked extension. Dismissing it is safe and it does not disable anything. It goes away
once the extension is on the Web Store.

**Your settings survive updates.** They live in Chrome's storage, not in the folder.
Reloading or replacing the folder keeps your WPM target, toggles and caption positions.

**Uninstalling.** Remove it from `chrome://extensions`. Chrome deletes all its stored
settings with it — nothing is left behind, and nothing was ever on a server.

## Other browsers

| Browser | Works |
|---|---|
| Chrome | Yes |
| Edge, Brave, Arc, Vivaldi, Opera | Yes — same Manifest V3 extension, same steps |
| Firefox | No. Different extension APIs; no port exists |
| Safari | No |
| Chrome on Android / iOS | No. Mobile Chrome does not support extensions |
