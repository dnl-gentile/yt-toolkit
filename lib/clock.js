/* Stable watch-time clock. Adjusted total does not follow live rate or trim boost. */
(function (root) {
  function formatClock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h)
      return (
        h +
        ":" +
        String(m).padStart(2, "0") +
        ":" +
        String(s).padStart(2, "0")
      );
    return m + ":" + String(s).padStart(2, "0");
  }

  function stableRate(opts) {
    const paceLock = !!(opts && opts.paceLock);
    const targetWpm = (opts && opts.targetWpm) || 180;
    const base = (opts && opts.baseWpm) || 0;
    const playbackRate = (opts && opts.playbackRate) || 1;
    if (paceLock && base >= 40) {
      const wpm = root.YtToolkitWpm || (typeof require === "function" ? require("./wpm") : null);
      const clamp = wpm ? wpm.clamp : (n, a, b) => Math.min(b, Math.max(a, n));
      return clamp(targetWpm / base, 0.7, (wpm && wpm.LOCK_MAX) || 4);
    }
    return playbackRate > 0.08 ? playbackRate : 1;
  }

  function watchSecs(t0, t1, opts) {
    if (t1 <= t0) return 0;
    let span = t1 - t0;
    const trim = !!(opts && opts.trimSilence);
    const cutFn = opts && opts.silenceCut;
    if (trim && typeof cutFn === "function") {
      span = Math.max(0, span - cutFn(t0, t1));
    }
    const rate = stableRate(opts);
    return span / (rate > 0.08 ? rate : 1);
  }

  function clockHtml(adjCur, adjDur, origDur) {
    const showOrig = Math.abs(adjDur - origDur) >= 1.5;
    const dim = showOrig
      ? '<span class="qt-orig-time">\u00a0(' + formatClock(origDur) + ")</span>"
      : "";
    return formatClock(adjCur) + " / " + formatClock(adjDur) + dim;
  }

  const api = { formatClock, stableRate, watchSecs, clockHtml };

  root.YtToolkitClock = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
