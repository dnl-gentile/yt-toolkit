# W-006 evidence

Command that fails if `styles-toggles.css` is removed or the ON paint is reverted to the dark `styles.css` values (`0.42` track, `#f1f1f1` thumb).

```
$ node docs/work/006-toggle-paint/check.mjs
PASS  off track rgba(255,255,255,0.15) !important
PASS  off thumb #c8c8c8 !important
PASS  on track rgba(255,255,255,0.55) !important (lighter than styles.css 0.42)
PASS  on thumb #ffffff !important
PASS  aria-checked=true .qt-switch ON selector
PASS  overrides YouTube .ytp-menuitem-toggle-checkbox
PASS  on track alpha 0.55 > off 0.15 and >= 0.5
PASS  .qt-switch:focus outline none
PASS  .qt-switch:focus-visible present
PASS  .qt-chrome-btn:focus outline none
PASS  .qt-chrome-btn:focus-visible present
PASS  .qt-switch / chrome-btn focus box-shadow none
PASS  Dual/Color/Center icon slot selector
PASS  icon slot width 40px (native band 24–40)
PASS  icon slot min-width 24px
PASS  icon slot max-width 40px
PASS  caption-toggle label text-align left
PASS  toggle lives in .ytp-menuitem-content on the right
PASS  no text-align:center on caption-toggle labels

all checks passed
```

## Mutation (load-bearing)

Replaced `0.55` with `0.42` in `styles-toggles.css`, re-ran the checker, restored the file.

```
FAIL  on track rgba(255,255,255,0.55) !important (lighter than styles.css 0.42)
FAIL  on track not visibly lighter (on=0.42 off=0.15)
2 check(s) failed
mutated-exit 1
restored true
```

## What `styles.css` still ships (W-003 owns it; this slice does not edit it)

```
$ grep -n -A 8 'qt-switch.on' styles.css
592:.qt-switch.on,
593-.ytp-menuitem[aria-checked="true"] .qt-switch {
594-  background: rgba(255, 255, 255, 0.42);
595-}
596:.qt-switch.on::after,
597-.ytp-menuitem[aria-checked="true"] .qt-switch::after {
598-  background: #f1f1f1;
599-  transform: translateX(22px);
600-}
```

Override payload (excerpt):

```
16:  background: rgba(255, 255, 255, 0.15) !important; /* off track */
37:  background: #c8c8c8 !important; /* off thumb */
45:  background: rgba(255, 255, 255, 0.55) !important; /* on track — visibly lighter */
57:  background: #ffffff !important; /* on thumb white */
91:  width: 40px !important;
92:  min-width: 24px !important;
```

## Not closed

Real-host screenshot of pace-menu + Subtitles/CC toggles against YouTube (QUALITY.md visual / pyramid). Manifest `content_scripts.css` does not yet list `styles-toggles.css` — coordinator append.
