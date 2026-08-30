# W-008 — captions overlay

Points at `docs/SPEC.md` §7 (and 1.6.1 supersession 2026-08-20):

- Overlay follows Dual while paused (`currentTime`, no `v.paused` early-return)
- `qt_captionLangs` busts `dataset.sig`; `requestLang(langs[1])` fires even if paused
- Slot identity is `YtToolkitDual.uniqueLangs` / `langBase` (`en` ≡ `tlang:en`)
- One font-size function: visible `.ytp-caption-segment` ≥ 16, else `clientHeight * 0.04` clamp 18–40. Center word uses the same size
- Default stack: primary above native-caption area, secondary + line height + ~48px. Zero `qt_captionPos` resets
- CC Off → hide. Dual off + highlight off + center off → hide (native captions)

Payload: `content/captions.js` only.
