/* Dual captions + color highlight + dim + Spritz-style center word.
   Draws #qt-cap-p / #qt-cap-s only. Never rewrites native caption DOM. */
(function () {
  const SLOT = ["#3ea6ff", "#ffcc00"];

  function langBase(token) {
    return String(token || "")
      .toLowerCase()
      .replace(/^tlang:/, "")
      .split("-")[0];
  }
  function uniqueLangs(list) {
    const out = [];
    const seen = new Set();
    (list || []).forEach((t) => {
      if (!t) return;
      const b = langBase(t);
      if (!b || seen.has(b)) return;
      seen.add(b);
      out.push(t);
    });
    return out.slice(0, 2);
  }
  function colorFor(pack, two) {
    if (!state.highlight) return "#fff";
    if (pack && pack.slot === 1) return SLOT[1];
    if (pack && pack.slot === 0 && two) return SLOT[0];
    return "#ffcc00";
  }
  function orpIndex(word) {
    const n = (word || "").length;
    if (n <= 1) return 0;
    if (n <= 5) return 1;
    if (n <= 9) return 2;
    if (n <= 13) return 3;
    return 4;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => {
      if (ch === "&") return "&#38;";
      if (ch === "<") return "&#60;";
      if (ch === ">") return "&#62;";
      if (ch === '"') return "&#34;";
      return "&#39;";
    });
  }
  function onWatch() {
    return location.pathname === "/watch" || location.pathname.startsWith("/watch");
  }

  const state = {
    dual: false,
    highlight: true,
    center: false,
    bg: true,
    langs: [],
    pos: { p: { x: 0, y: 0 }, s: { x: 0, y: 0 } },
  };
  const asked = Object.create(null);

  function load() {
    chrome.storage.sync.get(
      [
        "qt_dualCaptions",
        "qt_wordHighlight",
        "qt_centerWord",
        "qt_captionBg",
        "qt_captionLangs",
        "qt_captionPos",
      ],
      (s) => {
        state.dual = s.qt_dualCaptions === true;
        state.highlight = s.qt_wordHighlight !== false;
        state.center = s.qt_centerWord === true;
        state.bg = s.qt_captionBg !== false;
        state.langs = uniqueLangs(
          Array.isArray(s.qt_captionLangs) ? s.qt_captionLangs : [],
        );
        if (!state.langs.length && s.qt_secondaryTrack)
          state.langs = uniqueLangs([s.qt_primaryTrack || "en", s.qt_secondaryTrack]);
        if (s.qt_captionPos) state.pos = s.qt_captionPos;
        state.langs.forEach(requestLang);
      },
    );
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    if (ch.qt_dualCaptions) {
      state.dual = ch.qt_dualCaptions.newValue === true;
      bustCap();
    }
    if (ch.qt_wordHighlight) {
      state.highlight = ch.qt_wordHighlight.newValue !== false;
      bustCap();
    }
    if (ch.qt_centerWord) {
      state.center = ch.qt_centerWord.newValue === true;
      bustCap();
    }
    if (ch.qt_captionBg) state.bg = ch.qt_captionBg.newValue !== false;
    if (ch.qt_captionPos && ch.qt_captionPos.newValue) {
      state.pos = ch.qt_captionPos.newValue;
    }
    if (ch.qt_captionLangs) {
      state.langs = uniqueLangs(
        Array.isArray(ch.qt_captionLangs.newValue) ? ch.qt_captionLangs.newValue : [],
      );
      bustCap();
      state.langs.forEach(requestLang);
    }
    if (ch.qt_secondaryTrack && !ch.qt_captionLangs) {
      const v = ch.qt_secondaryTrack.newValue || "";
      if (v && langBase(state.langs[0]) !== langBase(v)) {
        state.langs = uniqueLangs(state.langs[0] ? [state.langs[0], v] : [v]);
        requestSecondTrack();
      }
    }
  });

  function player() {
    return document.querySelector("#movie_player, .html5-video-player");
  }
  function video() {
    return document.querySelector(
      "#movie_player video.html5-main-video, video.html5-main-video",
    );
  }

  function ensure() {
    const p = player();
    if (!p) return;
    if (!document.getElementById("qt-cap-p")) {
      p.appendChild(makeLine("qt-cap-p", "p"));
      p.appendChild(makeLine("qt-cap-s", "s"));
    }
  }

  function makeLine(id, slot) {
    const el = document.createElement("div");
    el.id = id;
    el.className = "qt-cap-line qt-cap-" + slot;
    el.hidden = true;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const start = {
        x: e.clientX,
        y: e.clientY,
        ox: state.pos[slot].x,
        oy: state.pos[slot].y,
      };
      function move(ev) {
        state.pos[slot] = {
          x: start.ox + ev.clientX - start.x,
          y: start.oy + ev.clientY - start.y,
        };
        applyPos(el, slot);
      }
      function up() {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        chrome.storage.sync.set({ qt_captionPos: state.pos });
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
    return el;
  }

  function nativeCaptionPx() {
    const win = document.querySelector(
      ".caption-window, .ytp-caption-window-bottom, .captions-text, .ytp-caption-segment",
    );
    if (win) {
      const px = parseFloat(getComputedStyle(win).fontSize);
      if (px >= 12) return px;
    }
    const p = player();
    const h = (p && p.clientHeight) || 640;
    return Math.round(Math.max(20, Math.min(40, h * 0.042)));
  }

  function applyCaptionSize(el) {
    if (!el) return;
    const px = nativeCaptionPx();
    if (state.center) el.style.fontSize = Math.min(px, 24) + "px";
    else el.style.fontSize = px + "px";
  }

  function applyPos(el, slot) {
    const { x, y } = state.pos[slot];
    el.style.transform = "translate(calc(-50% + " + x + "px), " + y + "px)";
  }

  function lockCenter(el) {
    const stage = el.querySelector(".qt-rsvp-stage");
    const track = el.querySelector(".qt-rsvp-track");
    const orp = el.querySelector(".qt-orp") || el.querySelector(".qt-w-on");
    if (!stage || !track || !orp) return;
    const s = stage.getBoundingClientRect();
    const o = orp.getBoundingClientRect();
    if (!s.width || !o.width) return;
    const dx = s.left + s.width / 2 - (o.left + o.width / 2);
    if (Math.abs(dx) < 0.6) return;
    const m = /translateX\((-?[\d.]+)px\)/.exec(track.style.transform || "");
    const cur = m ? parseFloat(m[1]) : 0;
    track.style.transform = "translateX(" + Math.round(cur + dx) + "px)";
  }

  function rsvpBag(cues, t, forceTime) {
    const inner = liveWords(cues, t, forceTime);
    if (!inner) return null;
    const live = cues.filter((c) => t >= c.start && t < c.end && c.words && c.words.length);
    if (!live.length) return inner;
    live.sort((a, b) => b.start - a.start);
    const cue = live[0];
    const i = cues.indexOf(cue);
    const words = [];
    const push = (c) => {
      if (c && c.words) c.words.forEach((w) => words.push(w));
    };
    push(cues[i - 1]);
    const from = words.length;
    push(cue);
    push(cues[i + 1]);
    return { words: words.length ? words : inner.words, idx: from + inner.idx };
  }

  function renderLine(el, pack, t, two) {
    el.classList.toggle("qt-rsvp", state.center);
    if (state.center) {
      const bag = rsvpBag(pack.cues, t, !!pack.tlang);
      if (!bag) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      const col = colorFor(pack, two);
      const sig = [
        "rsvp",
        pack.lang,
        bag.idx,
        bag.words[bag.idx] && bag.words[bag.idx].t,
        two ? 1 : 0,
        state.highlight ? 1 : 0,
      ].join("|");
      if (el.dataset.sig === sig) {
        lockCenter(el);
        return;
      }
      el.dataset.sig = sig;
      const colOn = state.highlight ? col : "#fff";
      let html =
        '<div class="qt-rsvp-stage"><i class="qt-rsvp-hair top"></i><i class="qt-rsvp-hair bot"></i><div class="qt-rsvp-track">';
      bag.words.forEach((w, i) => {
        html += wordHtml(w, i, bag.idx, colOn);
      });
      html += "</div></div>";
      el.innerHTML = html;
      requestAnimationFrame(() => lockCenter(el));
      return;
    }

    const live = liveWords(pack.cues, t, !!pack.tlang);
    if (!live) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const col = colorFor(pack, two);
    const sig = [
      pack.lang,
      live.idx,
      live.words[live.idx] && live.words[live.idx].t,
      state.highlight ? 1 : 0,
      state.bg ? 1 : 0,
      two ? 1 : 0,
    ].join("|");
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    let html = '<p class="qt-caption' + (state.bg ? " qt-cap-bg" : "") + '">';
    if (two) html += '<i class="qt-dot" style="background:' + col + '"></i>';
    live.words.forEach((w, i) => {
      html += wordHtml(w, i, live.idx, col);
    });
    html += "</p>";
    el.innerHTML = html;
  }

  function liveWords(cues, t, forceTime) {
    if (!cues || !cues.length) return null;
    const live = cues.filter((c) => t >= c.start && t < c.end && c.words && c.words.length);
    if (!live.length) return null;
    live.sort((a, b) => b.start - a.start);
    const cue = live[0];
    const words = cue.words;
    const n = words.length;
    const span = Math.max(0.2, cue.end - cue.start);
    const spread = n > 1 ? words[n - 1].t - words[0].t : 0;
    const p = (t - cue.start) / span;
    const byTime = Math.min(n - 1, Math.max(0, Math.floor(p * n)));
    let byStamp = 0;
    for (let i = 0; i < n; i++) if (words[i].t <= t + 0.05) byStamp = i;
    const idx = forceTime || spread < 0.35 || byStamp === 0 ? byTime : byStamp;
    return { words, idx };
  }

  function pickCues(token) {
    if (!token) return { cues: [], lang: "" };
    const bag = (window.QuietTube && window.QuietTube.cuesByLang) || {};
    const tlang = token.toLowerCase().startsWith("tlang:");
    const want = (tlang ? token.slice(6) : token).toLowerCase();
    if (tlang) {
      const hit =
        bag["tlang:" + want] ||
        bag[token] ||
        keysStarting(bag, "tlang:" + want);
      return { cues: hit || [], lang: want, tlang: true };
    }
    const keys = Object.keys(bag);
    const hit = keys.find(
      (k) => !k.startsWith("tlang:") && k.toLowerCase().startsWith(want),
    );
    if (hit) return { cues: bag[hit], lang: hit };
    if (want === "primary" && window.QuietTube?.cues?.length)
      return { cues: window.QuietTube.cues, lang: "primary" };
    return { cues: [], lang: want };
  }
  function keysStarting(bag, prefix) {
    const k = Object.keys(bag).find((x) => x.toLowerCase().startsWith(prefix.toLowerCase()));
    return k ? bag[k] : null;
  }

  function wordHtml(w, i, idx, col) {
    const on = i === idx;
    const dim = state.highlight && i !== idx;
    const style = state.highlight
      ? on
        ? "color:" + col + ";opacity:1"
        : "color:#fff;opacity:0.28"
      : "color:#fff;opacity:1";
    let inner = escapeHtml(w.w);
    if (on && state.center) {
      const orp = orpIndex(w.w);
      inner = [...w.w]
        .map((ch, c) =>
          c === orp
            ? '<span class="qt-orp">' + escapeHtml(ch) + "</span>"
            : escapeHtml(ch),
        )
        .join("");
    }
    return (
      '<span class="qt-w' +
      (on ? " qt-w-on" : "") +
      '" style="' +
      style +
      '">' +
      inner +
      "</span> "
    );
  }

  function lineKey(pack, t) {
    const live = liveWords(pack.cues, t, true);
    return live ? live.words.map((w) => w.w).join(" ").toLowerCase().trim() : "";
  }

  function bustCap() {
    ["qt-cap-p", "qt-cap-s"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.dataset.sig = "";
    });
  }

  function hideNative(on) {
    const p = player();
    if (p) p.classList.toggle("qt-ours-on", on);
  }

  function hideOurs() {
    hideNative(false);
    const pEl = document.getElementById("qt-cap-p");
    const sEl = document.getElementById("qt-cap-s");
    if (pEl) {
      pEl.hidden = true;
      pEl.dataset.sig = "";
    }
    if (sEl) {
      sEl.hidden = true;
      sEl.dataset.sig = "";
    }
  }

  function ccEnabled() {
    const btn = document.querySelector(
      ".ytp-subtitles-button, .ytp-subtitles-button-icon, button.ytp-button[aria-label*='ubtitle' i], button.ytp-button[aria-label*='egend' i]",
    );
    if (btn && btn.getAttribute("aria-pressed") != null)
      return btn.getAttribute("aria-pressed") === "true";
    const p = player();
    return !!(p && p.classList.contains("captions-enabled"));
  }

  function tick() {
    if (document.hidden || !onWatch()) {
      hideOurs();
      return;
    }
    ensure();
    const v = video();
    const pEl = document.getElementById("qt-cap-p");
    const sEl = document.getElementById("qt-cap-s");
    if (!v || !pEl || !sEl) return;
    const t = v.currentTime;
    const hasCues = !!(window.QuietTube && window.QuietTube.cues && window.QuietTube.cues.length);
    const langs = state.dual ? uniqueLangs(state.langs) : [];
    const wantPaint = state.highlight || state.center || langs.length > 0;
    if (!ccEnabled() || !wantPaint) {
      hideOurs();
      return;
    }
    if (!hasCues && !langs.length) {
      hideOurs();
      return;
    }
    pEl.classList.toggle("qt-rsvp", state.center);
    sEl.classList.toggle("qt-rsvp", state.center);
    const aCode = langs[0] || "primary";
    let packA = pickCues(aCode);
    if (!packA.cues.length && window.QuietTube?.cues?.length && !String(aCode).startsWith("tlang:"))
      packA = { cues: window.QuietTube.cues, lang: aCode, tlang: false };
    packA.slot = 0;
    const two = langs.length > 1;
    if (packA.cues.length) {
      pEl.hidden = false;
      renderLine(pEl, packA, t, two);
      applyCaptionSize(pEl);
      applyPos(pEl, "p");
    } else {
      pEl.hidden = true;
      if (langs[0]) requestLang(langs[0]);
    }
    if (two) {
      const packB = pickCues(langs[1]);
      packB.slot = 1;
      const sameLang = langBase(langs[0]) === langBase(langs[1]);
      const sameText =
        packB.cues.length &&
        (packB.cues === packA.cues ||
          (lineKey(packA, t) && lineKey(packA, t) === lineKey(packB, t)));
      if (!packB.cues.length || sameLang || sameText) {
        sEl.hidden = true;
        sEl.innerHTML = "";
        sEl.dataset.sig = "";
        if (!sameLang) requestLang(langs[1]);
      } else {
        sEl.hidden = false;
        renderLine(sEl, packB, t, true);
        applyCaptionSize(sEl);
        applyPos(sEl, "s");
      }
    } else {
      sEl.hidden = true;
    }
    hideNative(!(pEl.hidden && sEl.hidden));
    langs.forEach(requestLang);
  }

  function requestLang(token) {
    if (!token) return;
    const bag = (window.QuietTube && window.QuietTube.cuesByLang) || {};
    if (bag[token] && bag[token].length) return;
    const tlang = token.toLowerCase().startsWith("tlang:");
    const code = (tlang ? token.slice(6) : token).toLowerCase();
    if (tlang && bag["tlang:" + code] && bag["tlang:" + code].length) return;
    const tracks = window.QuietTube?.tracks || [];
    if (!tracks.length) {
      window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
      return;
    }
    const asr = tracks.find((tr) => tr.kind === "asr") || tracks[0];
    const exact =
      !tlang &&
      tracks.find((tr) => (tr.languageCode || "").toLowerCase().startsWith(code));
    let url = "";
    if (exact) url = exact.baseUrl;
    else if (asr)
      url =
        asr.baseUrl +
        (asr.baseUrl.includes("?") ? "&" : "?") +
        "tlang=" +
        encodeURIComponent(code);
    if (url && !/[?&]fmt=/.test(url))
      url += (url.includes("?") ? "&" : "?") + "fmt=json3";
    if (!url) return;
    const now = Date.now();
    const k = (tlang ? "tlang:" : "") + code + "|" + url;
    if (asked[k] && now - asked[k] < 3000) return;
    asked[k] = now;
    window.postMessage(
      {
        source: "quiettube-iso",
        type: "QT_FETCH_TRACK",
        url,
        lang: tlang ? "tlang:" + code : code,
      },
      "*",
    );
  }

  function requestSecondTrack() {
    (state.langs || []).forEach(requestLang);
  }

  document.addEventListener("qt-tracks", () => {
    if (state.dual) requestSecondTrack();
  });

  let tickId = 0;
  function startTicks() {
    if (tickId) return;
    tickId = setInterval(tick, 140);
  }
  function stopTicks() {
    if (!tickId) return;
    clearInterval(tickId);
    tickId = 0;
    hideOurs();
  }
  function syncTicks() {
    if (document.hidden || !onWatch()) stopTicks();
    else startTicks();
  }

  document.addEventListener("visibilitychange", syncTicks);
  document.addEventListener("yt-navigate-finish", () => {
    Object.keys(asked).forEach((k) => {
      delete asked[k];
    });
    syncTicks();
  });
  load();
  syncTicks();
  setTimeout(() => {
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  }, 400);
})();
