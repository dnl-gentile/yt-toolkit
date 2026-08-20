/* Local / median WPM, silence, lock rate, trim boost.
   Depends on timedWords() from YtToolkitTimedtext (or passed in). */
(function (root) {
  /* Pause (display 0 / utterance split) must be WIDER than inter-word
     gaps in slow speech. 80 WPM ≈ 0.75s between onsets; 0.6s was treating
     that as silence and leaving trim-boost stuck at 4×/8×. */
  const SILENCE_DISPLAY = 1.15;
  const TRIM_GAP = 1.2;
  const LOCK_MIN = 0.7;
  const LOCK_MAX = 2.5;
  const WPM_SANE_MIN = 40;
  const WPM_SANE_MAX = 420;

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  function inSilence(words, t, gap) {
    const g = gap == null ? SILENCE_DISPLAY : gap;
    if (!words || !words.length) return true;
    let prev = -1;
    let nextT = Infinity;
    for (let i = 0; i < words.length; i++) {
      if (words[i].t <= t + 0.08) prev = i;
      else {
        nextT = words[i].t;
        break;
      }
    }
    const lastT = prev >= 0 ? words[prev].t : -99;
    return t - lastT > g && nextT - t > 0.25;
  }

  function utteranceRates(words) {
    const rates = [];
    if (!words || words.length < 4) return rates;
    let i = 0;
    while (i < words.length) {
      let j = i + 1;
      while (j < words.length && words[j].t - words[j - 1].t < 0.85) j++;
      const n = j - i;
      const span = words[j - 1].t - words[i].t;
      if (n >= 4 && span >= 1.5) {
        const wpm = ((n - 1) / span) * 60;
        if (wpm >= WPM_SANE_MIN && wpm <= WPM_SANE_MAX) rates.push(wpm);
      }
      i = j;
    }
    return rates;
  }

  function median(nums) {
    if (!nums.length) return 0;
    const s = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function baseWpm(words) {
    const rates = utteranceRates(words);
    if (rates.length < 1) return 0;
    return median(rates);
  }

  /* Spoken time in a window = last−first minus interior gaps > 0.6s. */
  function spokenSpan(win) {
    if (!win || win.length < 2) return 0;
    const span = win[win.length - 1].t - win[0].t;
    let cut = 0;
    for (let i = 1; i < win.length; i++) {
      const g = win[i].t - win[i - 1].t;
      if (g > TRIM_GAP) cut += g - 0.2;
    }
    return Math.max(0.4, span - cut);
  }

  function localWpm(words, t) {
    if (inSilence(words, t, SILENCE_DISPLAY)) return 0;
    if (!words || words.length < 2) return 0;
    let win = words.filter((w) => w.t >= t - 8 && w.t <= t + 0.05);
    if (win.length < 4)
      win = words.filter((w) => w.t >= t - 14 && w.t <= t + 0.05);
    if (win.length < 3) return 0;
    /* Stay inside the current utterance (don't bridge a silence). */
    const cutAt = [];
    for (let i = 1; i < win.length; i++) {
      if (win[i].t - win[i - 1].t > SILENCE_DISPLAY) cutAt.push(i);
    }
    if (cutAt.length) {
      const lastCut = cutAt[cutAt.length - 1];
      const after = win.slice(lastCut);
      if (after.length >= 3) win = after;
      else win = win.slice(0, cutAt[0]);
    }
    if (win.length < 3) return 0;
    const spoken = spokenSpan(win);
    if (spoken < 0.8) return 0;
    const live = ((win.length - 1) / spoken) * 60;
    if (live < WPM_SANE_MIN || live > WPM_SANE_MAX) return 0;
    return live;
  }

  function lockRate(targetWpm, local, opts) {
    const min = (opts && opts.min) || LOCK_MIN;
    const max = (opts && opts.max) || LOCK_MAX;
    if (!(local >= WPM_SANE_MIN)) return null;
    return clamp(targetWpm / local, min, max);
  }

  function nextWordAfter(words, t) {
    if (!words) return null;
    for (let i = 0; i < words.length; i++) {
      if (words[i].t > t + 0.05) return words[i].t;
    }
    return null;
  }

  /* 0 = do not boost. 4 or 8 = silence boost.
     If a word is within the display-silence window, this is ALWAYS 0.
     That is the snap-back invariant: speech ⇒ no trim rate. */
  function trimBoost(words, t) {
    if (!words || !words.length) return 0;
    if (!inSilence(words, t, SILENCE_DISPLAY)) return 0;
    const next = nextWordAfter(words, t);
    if (next == null) return 0;
    const gap = next - t;
    if (gap < TRIM_GAP) return 0;
    return gap > 5 ? 8 : 4;
  }

  function silenceCut(words, t0, t1, minGap) {
    const gap = minGap == null ? TRIM_GAP : minGap;
    if (!words || t1 <= t0) return 0;
    let cut = 0;
    for (let i = 1; i < words.length; i++) {
      const a = words[i - 1].t;
      const b = words[i].t;
      if (b - a < gap) continue;
      const lo = Math.max(a + 0.25, t0);
      const hi = Math.min(b, t1);
      if (hi > lo) cut += hi - lo;
    }
    if (words.length) {
      const last = words[words.length - 1].t;
      const lo = Math.max(last + 0.25, t0);
      const hi = t1;
      if (hi > lo) cut += hi - lo;
    }
    return cut;
  }

  const api = {
    SILENCE_DISPLAY,
    TRIM_GAP,
    LOCK_MIN,
    LOCK_MAX,
    inSilence,
    utteranceRates,
    baseWpm,
    localWpm,
    lockRate,
    trimBoost,
    silenceCut,
    nextWordAfter,
    clamp,
  };

  root.YtToolkitWpm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
