/* Pure helpers for the allow-listed Video.js course-player adapter. */
(function (root) {
  const RATE_MIN = 0.25;
  const RATE_MAX = 4;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function formatRate(value) {
    const rate = Math.round(clamp(value || 1, RATE_MIN, RATE_MAX) * 100) / 100;
    return (Number.isInteger(rate) ? String(rate) : String(rate)) + "x";
  }

  function stepRate(value, direction) {
    return (
      Math.round(
        clamp((Number(value) || 1) + Number(direction || 0) * 0.25, RATE_MIN, RATE_MAX) *
          100,
      ) / 100
    );
  }

  function normalizeLanguage(value) {
    return String(value || "")
      .trim()
      .replace(/_/g, "-")
      .toLowerCase();
  }

  function cueAt(cues, mediaTime) {
    if (!Array.isArray(cues) || !cues.length || !Number.isFinite(mediaTime)) return null;
    let lo = 0;
    let hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Number(cues[mid]?.start) <= mediaTime) lo = mid + 1;
      else hi = mid;
    }
    const cue = cues[Math.max(0, lo - 1)];
    if (!cue) return null;
    const start = Number(cue.start);
    const end = Number(cue.end);
    return start <= mediaTime && mediaTime <= end ? cue : null;
  }

  function availableLanguages(tracks) {
    const out = [];
    const seen = new Set();
    for (const track of Array.isArray(tracks) ? tracks : []) {
      const language = normalizeLanguage(track && track.language);
      if (!language || seen.has(language)) continue;
      seen.add(language);
      out.push(language);
    }
    return out;
  }

  function reconcileSlots(slots, tracks, preferredLanguage) {
    const available = availableLanguages(tracks);
    const has = (language) => available.includes(normalizeLanguage(language));
    let primary = has(slots && slots.primary) ? normalizeLanguage(slots.primary) : "";
    let secondary = has(slots && slots.secondary) ? normalizeLanguage(slots.secondary) : "";
    if (secondary === primary) secondary = "";
    const preferred = normalizeLanguage(preferredLanguage);
    if (!primary) primary = has(preferred) ? preferred : available[0] || "";
    return { primary, secondary };
  }

  /* Persistent vacancies: clicking a selected language clears that exact slot;
     a third language cannot evict either occupied slot. */
  function selectLanguage(slots, language, tracks) {
    const available = availableLanguages(tracks);
    const next = {
      primary: normalizeLanguage(slots && slots.primary),
      secondary: normalizeLanguage(slots && slots.secondary),
    };
    const selected = normalizeLanguage(language);
    if (!selected || !available.includes(selected)) return next;
    if (next.primary === selected) {
      next.primary = "";
      return next;
    }
    if (next.secondary === selected) {
      next.secondary = "";
      return next;
    }
    if (!next.primary) next.primary = selected;
    else if (!next.secondary) next.secondary = selected;
    return next;
  }

  function fillVacancies(slots, tracks) {
    const available = availableLanguages(tracks);
    let primary = normalizeLanguage(slots && slots.primary);
    let secondary = normalizeLanguage(slots && slots.secondary);
    if (!available.includes(primary)) primary = "";
    if (!available.includes(secondary) || secondary === primary) secondary = "";
    if (!primary) primary = available.find((language) => language !== secondary) || "";
    if (!secondary) secondary = available.find((language) => language !== primary) || "";
    return { primary, secondary };
  }

  function adjustedTimes(currentTime, duration, rate) {
    const divisor = Number(rate) > 0.08 ? Number(rate) : 1;
    return {
      current: Math.max(0, Number(currentTime) || 0) / divisor,
      duration: Math.max(0, Number(duration) || 0) / divisor,
      original: Math.max(0, Number(duration) || 0),
    };
  }

  const api = {
    RATE_MIN,
    RATE_MAX,
    clamp,
    formatRate,
    stepRate,
    normalizeLanguage,
    cueAt,
    availableLanguages,
    reconcileSlots,
    selectLanguage,
    fillVacancies,
    adjustedTimes,
  };

  root.YtToolkitVideoJs = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
