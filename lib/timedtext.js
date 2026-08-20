/* Timedtext parse + ASR rolling-window collapse.
   Works in Chrome (globalThis.YtToolkitTimedtext) and Node (module.exports). */
(function (root) {
  const NOISE =
    /^\s*[\[(]?(music|música|applause|palmas|laughter|risos|cheers|singing|inaudible|instrumental|♪|♫)[\])]?\s*$/i;

  function isNoise(text) {
    const s = (text || "").trim();
    if (!s) return true;
    if (/^[♪♫\s.,\-–—]+$/.test(s)) return true;
    return NOISE.test(s);
  }

  function decodeEntities(raw) {
    return String(raw)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, e) => {
        const map = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
        if (map[e.toLowerCase()]) return map[e.toLowerCase()];
        if (e[0] === "#") {
          const n =
            e[1] === "x" || e[1] === "X"
              ? parseInt(e.slice(2), 16)
              : parseInt(e.slice(1), 10);
          return Number.isFinite(n) ? String.fromCharCode(n) : _;
        }
        return _;
      });
  }

  function tokenize(text) {
    return String(text)
      .replace(/\n/g, " ")
      .trim()
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
  }

  function stripPunct(token) {
    return String(token || "").replace(
      /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
      "",
    );
  }

  function parseXml(text) {
    const cues = [];
    const re =
      /<text[^>]*start="([^"]+)"[^>]*(?:dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = re.exec(text))) {
      const start = parseFloat(m[1]);
      const dur = parseFloat(m[2] || "0");
      const raw = decodeEntities(m[3]).replace(/\n/g, " ").trim();
      if (!raw || isNoise(raw)) continue;
      const parts = tokenize(raw);
      const span = dur > 0 ? dur : 0;
      const words = parts.map((w, i) => ({
        w,
        t:
          span > 0
            ? start + ((i + 0.5) / parts.length) * span
            : start,
      }));
      cues.push({
        start,
        end: start + (span || Math.max(0.2, parts.length * 0.01)),
        text: raw,
        words,
      });
    }
    return cues;
  }

  function parseJson3(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    const events = data.events || [];
    const cues = [];
    for (let ei = 0; ei < events.length; ei++) {
      const ev = events[ei];
      if (!ev || !ev.segs) continue;
      const start = (ev.tStartMs || 0) / 1000;
      const dur = (ev.dDurationMs || 0) / 1000;
      const nextStart =
        ei + 1 < events.length
          ? (events[ei + 1].tStartMs || 0) / 1000
          : start + dur;
      const words = [];
      const textBits = [];
      let anyOffset = false;
      for (const seg of ev.segs) {
        const chunk = (seg.utf8 || "").replace(/\n/g, " ");
        if (!chunk.trim()) continue;
        if (seg.tOffsetMs) anyOffset = true;
        const t = start + (seg.tOffsetMs || 0) / 1000;
        for (const part of tokenize(chunk)) {
          words.push({ w: part, t });
          textBits.push(part);
        }
      }
      if (!words.length) continue;
      const raw = textBits.join(" ");
      if (isNoise(raw)) continue;
      /* Spread only across the REAL cue duration (or until the next event).
         Never invent a per-word floor (0.28s/0.4s) — that made ~80 WPM
         speech read as ~180–214. */
      const span = dur > 0.05 ? dur : Math.max(0, nextStart - start);
      const spread =
        words.length > 1 ? words[words.length - 1].t - words[0].t : 0;
      if (words.length > 1 && spread < 0.08 && span > 0.05) {
        words.forEach((w, i) => {
          w.t = start + ((i + 0.5) / words.length) * span;
        });
      }
      cues.push({
        start,
        end: start + (span || 0.2),
        text: raw,
        words,
        _anyOffset: anyOffset,
      });
    }
    return cues;
  }

  function parseTimedtext(text) {
    const t = (text || "").trim();
    if (!t) return [];
    if (t[0] === "<") return parseXml(t);
    return parseJson3(t);
  }

  /* YouTube ASR emits overlapping windows:
       "hello there how" @ 0.0
       "there how are"   @ 0.8
       "how are you"     @ 1.6
     Keep the suffix that is actually new. */
  function collapseRollingCues(cues) {
    if (!cues || !cues.length) return [];
    const out = [];
    let prevTail = [];
    for (const cue of cues) {
      const parts = (cue.words || []).map((w) => ({
        w: w.w,
        t: w.t,
        low: stripPunct(w.w).toLowerCase(),
      }));
      if (!parts.length) continue;
      let skip = 0;
      const max = Math.min(prevTail.length, parts.length);
      for (let k = max; k >= 1; k--) {
        let ok = true;
        for (let i = 0; i < k; i++) {
          if (prevTail[prevTail.length - k + i] !== parts[i].low) {
            ok = false;
            break;
          }
        }
        if (ok) {
          skip = k;
          break;
        }
      }
      const fresh = parts.slice(skip);
      if (fresh.length) {
        out.push({
          start: fresh[0].t,
          end: cue.end,
          text: fresh.map((w) => w.w).join(" "),
          words: fresh.map((w) => ({ w: w.w, t: w.t })),
        });
        prevTail = parts.map((p) => p.low);
      }
    }
    return out.length ? out : cues;
  }

  function timedWords(cues) {
    const collapsed = collapseRollingCues(cues || []);
    const raw = [];
    for (const c of collapsed) {
      if (isNoise(c.text) || !c.words) continue;
      for (const w of c.words) {
        const token = stripPunct(w.w);
        if (!token) continue;
        raw.push({ w: token, t: w.t, low: token.toLowerCase() });
      }
    }
    raw.sort((a, b) => a.t - b.t);
    const out = [];
    for (const w of raw) {
      let dup = false;
      for (let k = out.length - 1; k >= 0 && w.t - out[k].t < 0.35; k--) {
        if (out[k].low === w.low) {
          dup = true;
          break;
        }
      }
      if (!dup) out.push(w);
    }
    return out;
  }

  function langFromUrl(url) {
    if (!url) return { lang: "", tlang: "", kind: "" };
    try {
      const u = new URL(url, "https://www.youtube.com");
      return {
        lang: (u.searchParams.get("lang") || "").toLowerCase(),
        tlang: (u.searchParams.get("tlang") || "").toLowerCase(),
        kind: (u.searchParams.get("kind") || "").toLowerCase(),
      };
    } catch {
      const lang = /[?&]lang=([^&]+)/i.exec(url);
      const tlang = /[?&]tlang=([^&]+)/i.exec(url);
      const kind = /[?&]kind=([^&]+)/i.exec(url);
      return {
        lang: lang ? decodeURIComponent(lang[1]).toLowerCase() : "",
        tlang: tlang ? decodeURIComponent(tlang[1]).toLowerCase() : "",
        kind: kind ? decodeURIComponent(kind[1]).toLowerCase() : "",
      };
    }
  }

  function isTranslation(url, key) {
    if (key && String(key).toLowerCase().startsWith("tlang:")) return true;
    return !!langFromUrl(url).tlang;
  }

  /* WPM/trim/clock may only consume the original spoken track. */
  function isOriginalTrack(key, url, originalLang) {
    if (isTranslation(url, key)) return false;
    const meta = langFromUrl(url);
    if (meta.kind === "asr") return true;
    const k = String(key || meta.lang || "").toLowerCase();
    if (!k || k === "primary") return !originalLang;
    if (!originalLang) return true;
    return (
      k === originalLang ||
      k.startsWith(originalLang + "-") ||
      originalLang.startsWith(k)
    );
  }

  const api = {
    isNoise,
    parseTimedtext,
    parseXml,
    parseJson3,
    collapseRollingCues,
    timedWords,
    langFromUrl,
    isTranslation,
    isOriginalTrack,
    tokenize,
    stripPunct,
  };

  root.YtToolkitTimedtext = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
