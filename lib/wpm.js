/* Local / median WPM, silence, lock rate, trim boost.
   Depends on timedWords() from YtToolkitTimedtext (or passed in). */
(function (root) {
  /* Pause (display 0 / utterance split) must be WIDER than inter-word
     gaps in slow speech. 80 WPM ≈ 0.75s between onsets; 0.6s was treating
     that as silence and leaving trim-boost stuck at 4×/8×. */
  const SILENCE_DISPLAY = 1.15;
  const TRIM_GAP = 1.2;
  const LOCK_MIN = 0.7;
  const LOCK_MAX = 4;
  const WPM_SANE_MIN = 40;
  const WPM_SANE_MAX = 420;
  const SAME_ONSET = 0.04;
  const profiles = new WeakMap();

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  /* A conservative orthographic proxy for articulation / recognition load.
     Five Unicode letters or numbers are the neutral word. Short connectors
     remain positive; long tokens are bounded so URLs and identifiers cannot
     dominate a sample. The fixed scale keeps a WPM target comparable across
     videos; it never depends on unrelated vocabulary elsewhere in a video. */
  function wordLoad(token) {
    let text = String(token || "");
    if (typeof text.normalize === "function") text = text.normalize("NFC");
    const units = text.match(/[\p{L}\p{N}]/gu);
    const length = units ? units.length : 0;
    if (!length) return 0;
    return clamp(0.6 + length * 0.08, 0.6, 2);
  }

  /* Cache contract: a prepared words array is immutable. Production replaces
     the timedWords array whenever cues change; callers that mutate in place
     must pass a new array before asking for another profile. */
  function prepareWords(words) {
    if (!words || (typeof words !== "object" && typeof words !== "function"))
      return null;
    const cached = profiles.get(words);
    if (cached && cached.length === words.length) return cached;
    const loads = new Array(words.length);
    for (let i = 0; i < words.length; i++) {
      const load = wordLoad(words[i] && words[i].w);
      loads[i] = load;
    }
    const profile = {
      length: words.length,
      loads,
    };
    profiles.set(words, profile);
    return profile;
  }

  function completedSample(words, start, end, profile) {
    if (!words || end - start < 2) return { units: 0, tokens: 0 };
    const lastT = Number(words[end - 1].t);
    let lastGroup = end - 1;
    while (
      lastGroup > start &&
      Math.abs(lastT - Number(words[lastGroup - 1].t)) <= SAME_ONSET
    )
      lastGroup--;
    let units = 0;
    let tokens = 0;
    for (let i = start; i < lastGroup; i++) {
      const raw = profile.loads[i] || 0;
      units += raw;
      if (raw > 0) tokens++;
    }
    return { units, tokens };
  }

  function lowerBound(words, t) {
    let lo = 0;
    let hi = words ? words.length : 0;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (words[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(words, t) {
    let lo = 0;
    let hi = words ? words.length : 0;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (words[mid].t <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function inSilence(words, t, gap) {
    const g = gap == null ? SILENCE_DISPLAY : gap;
    if (!words || !words.length) return true;
    const next = upperBound(words, t + 0.08);
    const prev = next - 1;
    const nextT = next < words.length ? words[next].t : Infinity;
    const lastT = prev >= 0 ? words[prev].t : -99;
    return t - lastT > g && nextT - t > 0.25;
  }

  function utteranceRates(words) {
    const rates = [];
    if (!words || words.length < 4) return rates;
    const profile = prepareWords(words);
    let i = 0;
    while (i < words.length) {
      let j = i + 1;
      while (
        j < words.length &&
        words[j].t - words[j - 1].t <= SILENCE_DISPLAY
      )
        j++;
      const n = j - i;
      const span = words[j - 1].t - words[i].t;
      if (n >= 4 && span >= 1.5) {
        const sample = completedSample(words, i, j, profile);
        const literalWpm = (sample.tokens / span) * 60;
        const equivalentWpm = (sample.units / span) * 60;
        if (
          literalWpm >= WPM_SANE_MIN &&
          literalWpm <= WPM_SANE_MAX &&
          equivalentWpm > 0
        )
          rates.push(equivalentWpm);
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

  /* Spoken time in a window = last−first minus interior Trim-sized gaps. */
  function spokenSpan(words, start, end) {
    if (!words || end - start < 2) return 0;
    const span = words[end - 1].t - words[start].t;
    let cut = 0;
    for (let i = start + 1; i < end; i++) {
      const g = words[i].t - words[i - 1].t;
      if (g > TRIM_GAP) cut += g - 0.2;
    }
    return Math.max(0.4, span - cut);
  }

  function localWpm(words, t) {
    if (inSilence(words, t, SILENCE_DISPLAY)) return 0;
    if (!words || words.length < 2) return 0;
    const profile = prepareWords(words);
    let end = upperBound(words, t + 0.05);
    let start = lowerBound(words, t - 8);
    if (end - start < 4) start = lowerBound(words, t - 14);
    if (end - start < 3) return 0;
    /* Stay inside the current utterance (don't bridge a silence). */
    let firstCut = -1;
    let lastCut = -1;
    for (let i = start + 1; i < end; i++) {
      if (words[i].t - words[i - 1].t > SILENCE_DISPLAY) {
        if (firstCut < 0) firstCut = i;
        lastCut = i;
      }
    }
    if (lastCut >= 0) {
      if (end - lastCut >= 3) start = lastCut;
      else end = firstCut;
    }
    if (end - start < 3) return 0;
    const spoken = spokenSpan(words, start, end);
    if (spoken < 0.8) return 0;
    const sample = completedSample(words, start, end, profile);
    const literalWpm = (sample.tokens / spoken) * 60;
    if (literalWpm < WPM_SANE_MIN || literalWpm > WPM_SANE_MAX) return 0;
    return (sample.units / spoken) * 60;
  }

  /* Wall-clock WPM the listener hears = media WPM × playbackRate.
     150 at 1× → 300 at 2×. Silence stays 0. Trim 4×/8× is not passed in. */
  function effectiveWpm(mediaWpm, playbackRate) {
    if (!(mediaWpm > 0)) return 0;
    const r = playbackRate > 0.08 ? playbackRate : 1;
    return mediaWpm * r;
  }

  function lockRate(targetWpm, local, opts) {
    const min = (opts && opts.min) || LOCK_MIN;
    const max = (opts && opts.max) || LOCK_MAX;
    /* local/base WPM already validated literal timestamp cadence. Do not apply
       literal 40–420 bounds again to the weighted equivalent value. */
    if (!(local > 0)) return null;
    return clamp(targetWpm / local, min, max);
  }

  function nextWordAfter(words, t) {
    if (!words || !words.length) return null;
    const next = upperBound(words, t + 0.05);
    return next < words.length ? words[next].t : null;
  }

  /* Look-ahead remaining silence. SPEC: ≥ ~1.2 s → 4×, > 5 s → 8×.
     Do not wait 1.15s of dead air first — that left only a few hundred ms
     of boost. 3× was indistinguishable from Pace lock at 2.5×. */
  function trimBoost(words, t, duration) {
    if (!words || !words.length) return 0;
    const nextIndex = upperBound(words, t + 0.12);
    const prev = nextIndex - 1;
    const next = nextIndex < words.length ? nextIndex : -1;
    const lastT = prev >= 0 ? words[prev].t : -1;
    const sinceLast = lastT < 0 ? t : t - lastT;
    if (sinceLast < 0.22) return 0;
    const nextT = next >= 0 ? words[next].t : 0;
    if (next >= 0) {
      const untilNext = nextT - t;
      const gap = lastT < 0 ? untilNext : nextT - lastT;
      if (untilNext < 0.2) return 0;
      if (gap < TRIM_GAP) return 0;
      if (untilNext < 0.7) return 0;
      if (untilNext > 5) return 8;
      return 4;
    }
    if (!(duration > t) || lastT < 0 || duration - lastT < TRIM_GAP) return 0;
    const end = duration;
    const remain = end - t - 0.35;
    if (remain < 0.7) return 0;
    return remain > 5 ? 8 : 4;
  }

  function silenceCut(words, t0, t1, minGap) {
    const gap = minGap == null ? TRIM_GAP : minGap;
    if (!words || !words.length || t1 <= t0) return 0;
    const times = words
      .map((w) => Number(w.t))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!times.length) return 0;
    const intervals = [];
    const first = times[0];
    if (first >= gap) intervals.push([0.25, first]);
    for (let i = 1; i < times.length; i++) {
      const a = times[i - 1];
      const b = times[i];
      if (b - a >= gap) intervals.push([a + 0.25, b]);
    }
    const last = times[times.length - 1];
    if (t1 - last >= gap) intervals.push([last + 0.25, t1]);
    return intervals.reduce((cut, pair) => {
      const lo = Math.max(pair[0], t0);
      const hi = Math.min(pair[1], t1);
      return cut + (hi > lo ? hi - lo : 0);
    }, 0);
  }

  const api = {
    SILENCE_DISPLAY,
    TRIM_GAP,
    LOCK_MIN,
    LOCK_MAX,
    wordLoad,
    prepareWords,
    inSilence,
    utteranceRates,
    baseWpm,
    localWpm,
    effectiveWpm,
    lockRate,
    trimBoost,
    silenceCut,
    nextWordAfter,
    clamp,
  };

  root.YtToolkitWpm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
