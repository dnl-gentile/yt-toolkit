# W-007 evidence

Commands that fail if `content/yt-menu-patch.js` reverts to local `LANG_NAMES` /
`selectedLangs.indexOf(token)` / omitted icon slot / label-padding shove.

```
$ node --check content/yt-menu-patch.js
exit:0
```

```
$ grep -n 'YtToolkitDual\|selectLang\|slotOf\|codeFromLabel' content/yt-menu-patch.js
4:  const Dual = globalThis.YtToolkitDual;
173:          if (c) selectedLangs = Dual.selectLang(selectedLangs, c);
219:    return Dual.codeFromLabel(label, window.QuietTube && QuietTube.tracks);
270:      const slot = Dual.slotOf(selectedLangs, token);
315:        selectedLangs = Dual.selectLang(selectedLangs, token);
```

```
$ grep -n 'selectedLangs\.indexOf\|LANG_NAMES\|hasIcon\|labCs' content/yt-menu-patch.js
anti-pattern-exit:1
```

(`grep` exit 1 = no leftover exact-token indexOf, no local LANG_NAMES that
dropped Akan, no `hasIcon` omission of `.ytp-menuitem-icon`, no Off-label
computed padding copied onto Dual/Color/Center labels.)

```
$ grep -n 'ytp-menuitem-icon' content/yt-menu-patch.js
146:      '<div class="ytp-menuitem-icon"></div>' +
```

```
$ grep -n 'stopImmediatePropagation\|if (!dualOn)' content/yt-menu-patch.js
250:      if (!dualOn) {
300:        if (!dualOn) return;
313:        e.stopImmediatePropagation();
```

```
$ node -e '
const dual = require("./lib/dual-lang");
const assert = require("assert/strict");
assert.equal(dual.codeFromLabel("Akan"), "ak");
assert.equal(dual.codeFromLabel("Arabic"), "ar");
assert.equal(dual.codeFromLabel("Bangla"), "bn");
assert.deepEqual(dual.selectLang(["en"], "ak"), ["en", "ak"]);
assert.deepEqual(dual.selectLang(["en"], "ar"), ["en", "ar"]);
assert.equal(dual.slotOf(["en", "ar"], "tlang:ar"), 1);
assert.equal(dual.slotOf(["en", "ak"], "ak"), 1);
console.log("PASS Akan/Arabic/Bangla map; slotOf matches tlang alias");
'
PASS Akan/Arabic/Bangla map; slotOf matches tlang alias
```

```
$ node --test tests/dual-lang.test.js
ℹ tests 7
ℹ fail 0
```

## What this closes in the patch

- `codeFromItem` uses `data-language-code` / `data-lang`, else
  `Dual.codeFromLabel` (Akan → ak, Arabic → ar, Bangla → bn)
- Clicks call `Dual.selectLang` then persist `qt_captionLangs` /
  `qt_primaryTrack` / `qt_secondaryTrack`
- Paint uses `Dual.slotOf` (`#3EA6FF` / `#FFCC00`); native SVG/check hidden on
  every language row while dual is on; Off and Auto-translate parent never get a ✓
- Dual ON: capture-phase `preventDefault` + `stopImmediatePropagation` on
  language rows. Dual OFF: early return, native radio
- After write, `paintOpenLangPanels` paints captions + Auto-translate if open
- Dual ON with 0 langs seeds slot 0 from the aria-checked native language
- `makeToggle` always includes an empty `.ytp-menuitem-icon`
- `alignToggleLabels` copies Off row padding only when it is ≤ 12px; does not
  write label padding

## Not closed

Real-host Subtitles/CC click of Arabic/Akan with Dual on (QUALITY.md visual /
live pyramid).
