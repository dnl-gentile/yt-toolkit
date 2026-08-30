/* Dual captions + color highlight + dim + Spritz-style center word.
   Draws #qt-cap-p / #qt-cap-s only. Never rewrites native caption DOM. */
(function () {
  const SLOT = ["#ffcc00", "#3ea6ff"];
  const PRIMARY_BOTTOM = 80;
  const STACK_GAP = 48;
  const Dual = globalThis.YtToolkitDual;

  function langBase(token) {
    return Dual.langBase(token);
  }
  function normalizeSlots(list) {
    return Dual.normalizeSlots(list);
  }
  function colorFor(pack, two) {
    if (!highlightOn()) return "#fff";
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
  function setHidden(el, hidden) {
    if (el && el.hidden !== !!hidden) el.hidden = !!hidden;
  }
  function setData(el, key, value) {
    if (!el) return;
    const next = String(value == null ? "" : value);
    if (el.dataset[key] !== next) el.dataset[key] = next;
  }
  function isShortsPage() {
    return /^\/shorts(?:\/|$)/.test(location.pathname || "");
  }
  function onCaptionPage() {
    return (
      location.pathname === "/watch" ||
      location.pathname.startsWith("/watch") ||
      isShortsPage()
    );
  }
  function pageVideoId() {
    const query = new URLSearchParams(location.search).get("v") || "";
    if (query) return query;
    const match = String(location.pathname || "").match(/^\/shorts\/([^/?#]+)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  const state = {
    dual: false,
    highlight: true,
    center: false,
    bg: true,
    captionsEnabled: null,
    langs: [],
    pos: { p: { x: 0, bottom: null }, s: { x: 0, bottom: null } },
  };
  const asked = Object.create(null);
  const attempts = Object.create(null);
  const NEED_TRACKS_MS = 2500;
  let lastNeedTracksAt = 0;

  /* Word-level paint needs ASR word onsets. Uploaded / coarse captions carry
     cue-level times only, so Highlight and Center would invent a cadence the
     speaker never had. The saved preferences are kept and resume on their own
     once an original-language auto-generated track arrives. Dual stays
     allowed as pure display. */
  function asrRhythm() {
    return !!(window.QuietTube && window.QuietTube._cuesAreAsr);
  }
  function highlightOn() {
    return state.highlight && asrRhythm();
  }
  function centerOn() {
    return state.center && asrRhythm();
  }

  function load() {
    const Prefs = globalThis.YtToolkitPrefs;
    const apply = (s) => {
      const b = Prefs ? Prefs.bool : (v, d) => (v === true || v === false ? v : d);
      state.dual = b(s.qt_dualCaptions, false);
      state.highlight = b(s.qt_wordHighlight, true);
      state.center = b(s.qt_centerWord, false);
      state.bg = b(s.qt_captionBg, true);
      state.captionsEnabled =
        s.qt_captionsEnabled === true || s.qt_captionsEnabled === false
          ? s.qt_captionsEnabled
          : null;
      state.langs = normalizeSlots(
        Array.isArray(s.qt_captionLangs) ? s.qt_captionLangs : [],
      );
      if (!state.langs.some(Boolean) && s.qt_secondaryTrack)
        state.langs = normalizeSlots([
          s.qt_primaryTrack || "",
          s.qt_secondaryTrack,
        ]);
      state.pos = normalizePos(s.qt_captionPos);
      state.langs.forEach(requestLang);
      tick();
    };
    if (Prefs) Prefs.get(
      ["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord", "qt_captionBg", "qt_captionsEnabled", "qt_captionLangs", "qt_captionPos", "qt_primaryTrack", "qt_secondaryTrack"],
      apply,
    );
    else chrome.storage.sync.get(
      ["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord", "qt_captionBg", "qt_captionsEnabled", "qt_captionLangs", "qt_captionPos", "qt_primaryTrack", "qt_secondaryTrack"],
      apply,
    );
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync" && area !== "local") return;
    let redraw = false;
    if (ch.qt_dualCaptions) {
      state.dual = ch.qt_dualCaptions.newValue === true;
      redraw = true;
    }
    if (ch.qt_wordHighlight) {
      state.highlight = ch.qt_wordHighlight.newValue !== false;
      redraw = true;
    }
    if (ch.qt_centerWord) {
      state.center = ch.qt_centerWord.newValue === true;
      redraw = true;
    }
    if (ch.qt_captionBg) {
      state.bg = ch.qt_captionBg.newValue !== false;
      redraw = true;
    }
    if (ch.qt_captionsEnabled) {
      const value = ch.qt_captionsEnabled.newValue;
      state.captionsEnabled =
        value === true || value === false ? value : null;
      redraw = true;
    }
    if (ch.qt_captionPos && ch.qt_captionPos.newValue) {
      state.pos = normalizePos(ch.qt_captionPos.newValue);
    }
    if (ch.qt_captionLangs) {
      state.langs = normalizeSlots(
        Array.isArray(ch.qt_captionLangs.newValue) ? ch.qt_captionLangs.newValue : [],
      );
      state.langs.forEach(requestLang);
      redraw = true;
    }
    if (ch.qt_secondaryTrack && !ch.qt_captionLangs) {
      const v = ch.qt_secondaryTrack.newValue || "";
      if (v && langBase(state.langs[0]) !== langBase(v)) {
        state.langs = normalizeSlots([state.langs[0] || "", v]);
        requestSecondTrack();
        redraw = true;
      }
    }
    if (redraw) {
      bustCap();
      tick();
    }
  });

  function playerVideoId(candidate) {
    if (!candidate) return "";
    if (typeof candidate.getPlayerResponse === "function") {
      try {
        const id = candidate.getPlayerResponse()?.videoDetails?.videoId || "";
        if (id) return id;
      } catch {
        /* Fall through to stable host metadata while the API is recycling. */
      }
    }
    const reel = candidate.closest?.("ytd-reel-video-renderer");
    return (
      candidate.dataset?.videoId ||
      reel?.dataset?.video ||
      reel?.getAttribute?.("video-id") ||
      ""
    );
  }

  function shortsPlayerFromRoot(root) {
    if (!root || !root.querySelector) return null;
    return (
      root.querySelector("#shorts-player.html5-video-player") ||
      root.querySelector("#shorts-player .html5-video-player") ||
      root.querySelector(".html5-video-player") ||
      root.querySelector("#shorts-player")
    );
  }

  function playerGeometry(candidate) {
    if (!candidate || !candidate.getBoundingClientRect)
      return { area: 0, rect: null };
    const rect = candidate.getBoundingClientRect();
    const viewportWidth = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
    const viewportHeight = Number(window.innerHeight) || Number.POSITIVE_INFINITY;
    const width = Math.max(
      0,
      Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
    );
    const height = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
    );
    return { area: width * height, rect };
  }

  function activeShortsPlayer() {
    if (!isShortsPage()) return null;
    const wanted = pageVideoId();
    const candidates = [];
    const add = (candidate) => {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };
    const markedRoot = document.querySelector(
      "ytd-reel-video-renderer[is-active], " +
        "ytd-reel-video-renderer[active], " +
        "ytd-reel-video-renderer[aria-hidden='false']",
    );
    add(shortsPlayerFromRoot(markedRoot));
    document
      .querySelectorAll(
        "ytd-reel-video-renderer #shorts-player, " +
          "ytd-reel-video-renderer .html5-video-player",
      )
      .forEach(add);

    let exact = null;
    let exactArea = -1;
    let visible = null;
    let visibleScore = -Infinity;
    const marked = shortsPlayerFromRoot(markedRoot);
    let markedArea = 0;
    candidates.forEach((candidate) => {
      const geometry = playerGeometry(candidate);
      const area = geometry.area;
      if (wanted && playerVideoId(candidate) === wanted && area > exactArea) {
        exact = candidate;
        exactArea = area;
      }
      if (candidate === marked) markedArea = area;
      const rect = geometry.rect;
      const centerPenalty = Math.abs(
        (rect ? rect.top + rect.height / 2 : 0) -
          (Number(window.innerHeight) || 0) / 2,
      );
      const score = area - centerPenalty;
      if (area > 0 && score > visibleScore) {
        visible = candidate;
        visibleScore = score;
      }
    });
    if (exact && (exactArea > 0 || !visible)) return exact;
    if (marked && markedArea > 0) return marked;
    return visible || exact || marked || null;
  }

  function activeWatchPlayer() {
    const wanted = pageVideoId();
    const candidates = [];
    const add = (candidate) => {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };
    const canonical = document.getElementById("movie_player");
    add(canonical);
    document
      .querySelectorAll(
        "ytd-watch-flexy ytd-player .html5-video-player, " +
          "ytd-watch-flexy .html5-video-player, ytd-player .html5-video-player, " +
          ".html5-video-player",
      )
      .forEach(add);

    let exactVisible = null;
    let exactVisibleArea = -1;
    let visibleWatch = null;
    let visibleWatchArea = -1;
    let visibleOther = null;
    let visibleOtherArea = -1;
    let exact = null;
    let watchFallback = null;
    candidates.forEach((candidate) => {
      const { area } = playerGeometry(candidate);
      const inMiniplayer = !!candidate.closest?.("ytd-miniplayer");
      const inWatch = !!candidate.closest?.("ytd-watch-flexy");
      const exactId = !!wanted && playerVideoId(candidate) === wanted;
      if (exactId) {
        exact = exact || candidate;
        if (area > exactVisibleArea) {
          exactVisible = candidate;
          exactVisibleArea = area;
        }
      }
      if (inWatch && !inMiniplayer) {
        watchFallback = watchFallback || candidate;
        if (area > visibleWatchArea) {
          visibleWatch = candidate;
          visibleWatchArea = area;
        }
      }
      if (!inMiniplayer && area > visibleOtherArea) {
        visibleOther = candidate;
        visibleOtherArea = area;
      }
    });
    if (exactVisible && exactVisibleArea > 0) return exactVisible;
    if (visibleWatch && visibleWatchArea > 0) return visibleWatch;
    if (canonical && !canonical.closest?.("ytd-miniplayer") && playerGeometry(canonical).area > 0)
      return canonical;
    if (visibleOther && visibleOtherArea > 0) return visibleOther;
    return exact || watchFallback || canonical || candidates[0] || null;
  }

  let playerCache = null;
  function playerCacheKey() {
    return (isShortsPage() ? "shorts:" : "watch:") + pageVideoId();
  }
  function invalidatePlayerCache() {
    playerCache = null;
  }

  function player() {
    if (!onCaptionPage()) return null;
    const key = playerCacheKey();
    if (
      playerCache &&
      playerCache.key === key &&
      playerCache.player?.isConnected
    )
      return playerCache.player;
    const resolved = isShortsPage() ? activeShortsPlayer() : activeWatchPlayer();
    playerCache = { key, player: resolved || null };
    observePlayerLifecycle(resolved);
    return resolved;
  }
  function video(scope) {
    const p = scope || player();
    return p && p.querySelector("video.html5-main-video, video");
  }

  const PLAYER_LIFECYCLE_SELECTOR =
    "ytd-reel-video-renderer, ytd-player, #movie_player, #shorts-player";
  let playerLifecycleObserver = null;
  let playerLifecycleRoots = [];

  function lifecycleNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return (
      node.matches?.(PLAYER_LIFECYCLE_SELECTOR) ||
      !!node.querySelector?.(PLAYER_LIFECYCLE_SELECTOR)
    );
  }

  function disconnectPlayerLifecycle() {
    if (playerLifecycleObserver) playerLifecycleObserver.disconnect();
    playerLifecycleObserver = null;
    playerLifecycleRoots = [];
  }

  function lifecycleRootsFor(active) {
    if (!active) return [];
    if (isShortsPage()) {
      const reel = active.closest?.("ytd-reel-video-renderer");
      if (!reel) return [active];
      const siblings = Array.from(reel.parentElement?.children || []).filter(
        (node) => node.matches?.("ytd-reel-video-renderer"),
      );
      return siblings.length ? siblings : [reel];
    }
    return [
      active.closest?.("ytd-watch-flexy") ||
        active.closest?.("ytd-player") ||
        active,
    ];
  }

  function observePlayerLifecycle(active) {
    const roots = lifecycleRootsFor(active);
    if (
      roots.length === playerLifecycleRoots.length &&
      roots.every((root, index) => root === playerLifecycleRoots[index])
    )
      return;
    disconnectPlayerLifecycle();
    if (!roots.length) return;
    playerLifecycleObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === "attributes")
          return record.target?.matches?.("ytd-reel-video-renderer") || false;
        return [...record.addedNodes, ...record.removedNodes].some(lifecycleNode);
      });
      if (!relevant) return;
      invalidatePlayerCache();
      syncTicks();
    });
    playerLifecycleRoots = roots;
    roots.forEach((root) => {
      playerLifecycleObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["is-active", "active", "aria-hidden"],
      });
    });
  }

  let overlayPlayer = null;
  function bindPlayer() {
    const p = player();
    if (overlayPlayer && overlayPlayer !== p)
      overlayPlayer.classList.remove("qt-ours-on");
    overlayPlayer = p;
    return p;
  }

  function ensure() {
    const p = bindPlayer();
    if (!p) return null;
    let primary = document.getElementById("qt-cap-p");
    let secondary = document.getElementById("qt-cap-s");
    if (!primary) primary = makeLine("qt-cap-p", "p");
    if (!secondary) secondary = makeLine("qt-cap-s", "s");
    if (primary.parentElement !== p) p.appendChild(primary);
    if (secondary.parentElement !== p) p.appendChild(secondary);
    primary.classList.toggle("qt-cap-shorts", isShortsPage());
    secondary.classList.toggle("qt-cap-shorts", isShortsPage());
    return p;
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
        ob:
          state.pos[slot].bottom != null
            ? state.pos[slot].bottom
            : parseFloat(el.style.bottom) || defaultBottom(slot),
      };
      function move(ev) {
        state.pos[slot] = {
          x: start.ox + ev.clientX - start.x,
          bottom: start.ob - (ev.clientY - start.y),
        };
        applyPos(el, slot);
      }
      function up() {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        applyPos(el, slot);
        const Prefs = globalThis.YtToolkitPrefs;
        if (Prefs) Prefs.set({ qt_captionPos: state.pos });
        else chrome.storage.sync.set({ qt_captionPos: state.pos });
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
    return el;
  }

  function defaultBottom(slot) {
    return slot === "s" ? stackBase("s") : PRIMARY_BOTTOM;
  }

  function normalizePos(raw) {
    const one = (o, slot) => {
      if (!o) return { x: 0, bottom: null };
      const x = Number(o.x) || 0;
      if (o.bottom != null && isFinite(Number(o.bottom)))
        return { x, bottom: Number(o.bottom) };
      const y = Number(o.y) || 0;
      return { x, bottom: y ? defaultBottom(slot) + y : null };
    };
    return {
      p: one(raw && raw.p, "p"),
      s: one(raw && raw.s, "s"),
    };
  }

  /* Same size as native captions, including YouTube - / = (fontSizeIncrement).
     If no usable native segment exists, use the same fallback formula:
     playerHeight * 0.04 * increment scale. */
  const FONT_INC_SCALE = {
    "-2": 0.5,
    "-1": 0.75,
    0: 1,
    1: 1.5,
    2: 2,
    3: 3,
    4: 4,
  };

  function youtubeFontInc() {
    try {
      const raw = localStorage.getItem("yt-player-caption-display-settings");
      if (raw) {
        const j = JSON.parse(raw);
        const data = typeof j.data === "string" ? JSON.parse(j.data) : j.data || j;
        if (data && data.fontSizeIncrement != null)
          return Number(data.fontSizeIncrement) || 0;
      }
    } catch {
      /* ignore */
    }
    return 0;
  }

  function captionFontPx() {
    const p = player();
    const h = (p && p.clientHeight) || 640;
    const base = Math.max(18, h * 0.04);
    const inc = youtubeFontInc();
    const scale =
      FONT_INC_SCALE[String(inc)] != null ? FONT_INC_SCALE[String(inc)] : 1;
    const expected = Math.round(Math.max(18, base * scale));
    const nodes = p
      ? p.querySelectorAll(".ytp-caption-segment, .captions-text")
      : [];
    for (let i = 0; i < nodes.length; i++) {
      const px = parseFloat(getComputedStyle(nodes[i]).fontSize);
      if (Number.isFinite(px) && px >= 16) return px;
    }
    return expected;
  }

  function applyCaptionSize(el, px) {
    if (!el) return;
    const value = (px == null ? captionFontPx() : px) + "px";
    if (el.style.fontSize !== value) el.style.fontSize = value;
  }

  function stackBase(slot) {
    if (slot === "p") return PRIMARY_BOTTOM;
    const pEl = document.getElementById("qt-cap-p");
    const h =
      (pEl && !pEl.hidden && pEl.offsetHeight) || (centerOn() ? 56 : 36);
    return PRIMARY_BOTTOM + h + STACK_GAP;
  }

  function applyPos(el, slot, singleVisualLine) {
    if (!el) return;
    if (!state.pos[slot]) state.pos[slot] = { x: 0, bottom: null };
    let x = Number(state.pos[slot].x) || 0;
    let bottom = state.pos[slot].bottom;
    if (bottom == null || !isFinite(bottom))
      bottom = singleVisualLine ? PRIMARY_BOTTOM : defaultBottom(slot);
    const p = player();
    if (p) {
      const ph = p.clientHeight || 0;
      const pw = p.clientWidth || 0;
      const eh = el.offsetHeight || 48;
      const ew = Math.min(el.offsetWidth || 200, pw);
      const minB = 8;
      const maxB = Math.max(minB, ph - eh - 8);
      bottom = Math.max(minB, Math.min(maxB, bottom));
      const maxX = Math.max(0, (pw - ew) / 2 - 8);
      x = Math.max(-maxX, Math.min(maxX, x));
    }
    state.pos[slot].x = x;
    /* null means "use the live default". Keep it until the user drags so
       Dual spacing follows caption size and Center Word mode changes. */
    if (state.pos[slot].bottom != null && isFinite(state.pos[slot].bottom))
      state.pos[slot].bottom = bottom;
    const bottomValue = Math.round(bottom) + "px";
    if (
      el.style.getPropertyValue("bottom") !== bottomValue ||
      el.style.getPropertyPriority("bottom") !== "important"
    )
      el.style.setProperty("bottom", bottomValue, "important");
    const transform = "translateX(calc(-50% + " + x + "px))";
    if (el.style.transform !== transform) el.style.transform = transform;
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
    const transform = "translateX(" + Math.round(cur + dx) + "px)";
    if (track.style.transform !== transform) track.style.transform = transform;
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
    el.classList.toggle("qt-rsvp", centerOn());
    if (centerOn()) {
      const bag = rsvpBag(pack.cues, t, !!pack.tlang || pack.sourceTimed === true);
      if (!bag) {
        setHidden(el, true);
        return;
      }
      setHidden(el, false);
      const col = colorFor(pack, two);
      const sig = [
        "rsvp",
        pack.token || pack.lang,
        langBase(pack.token || pack.lang),
        bag.idx,
        bag.words[bag.idx] && bag.words[bag.idx].t,
        two ? 1 : 0,
        highlightOn() ? 1 : 0,
      ].join("|");
      if (el.dataset.sig === sig) {
        lockCenter(el);
        return;
      }
      setData(el, "sig", sig);
      const colOn = highlightOn() ? col : "#fff";
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

    const live = liveWords(pack.cues, t, !!pack.tlang || pack.sourceTimed === true);
    if (!live) {
      setHidden(el, true);
      return;
    }
    setHidden(el, false);
    const col = colorFor(pack, two);
    const sig = [
      pack.token || pack.lang,
      langBase(pack.token || pack.lang),
      live.idx,
      live.words[live.idx] && live.words[live.idx].t,
      highlightOn() ? 1 : 0,
      state.bg ? 1 : 0,
      two ? 1 : 0,
    ].join("|");
    if (el.dataset.sig === sig) return;
    setData(el, "sig", sig);
    let html = '<p class="qt-caption' + (state.bg ? " qt-cap-bg" : "") + '">';
    live.words.forEach((w, i) => {
      html += wordHtml(w, i, live.idx, col);
    });
    html += "</p>";
    el.innerHTML = html;
  }

  let sourceTimelineRef = null;
  let sourceTimelineCache = [];

  function translatedIndexFromSource(cue, t) {
    const qt = window.QuietTube || {};
    const source = qt._cuesAreAsr && Array.isArray(qt.cues) ? qt.cues : [];
    const words = cue && cue.words;
    if (!source.length || !words || !words.length) return null;
    const TT = globalThis.YtToolkitTimedtext;
    if (sourceTimelineRef !== source) {
      sourceTimelineRef = source;
      sourceTimelineCache =
        TT && TT.timedWords
          ? TT.timedWords(source)
          : source.flatMap((item) => item.words || []).sort((a, b) => a.t - b.t);
    }
    const start = Number(cue.start) || 0;
    const end = Number(cue.end);
    const timeline = sourceTimelineCache.filter(
      (word) =>
        Number.isFinite(word.t) &&
        word.t >= start - 0.05 &&
        (!Number.isFinite(end) || word.t < end + 0.05),
    );
    if (!timeline.length) return null;
    let ordinal = 0;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].t <= t + 0.05) ordinal = i;
      else break;
    }
    if (timeline.length === 1 || words.length === 1) return 0;
    return Math.max(
      0,
      Math.min(
        words.length - 1,
        Math.round((ordinal * (words.length - 1)) / (timeline.length - 1)),
      ),
    );
  }

  function liveWords(cues, t, forceTime) {
    if (!cues || !cues.length) return null;
    const live = cues.filter((c) => t >= c.start && t < c.end && c.words && c.words.length);
    if (!live.length) return null;
    live.sort((a, b) => b.start - a.start);
    const cue = live[0];
    const words = cue.words;
    const TT = globalThis.YtToolkitTimedtext;
    let idx = forceTime ? translatedIndexFromSource(cue, t) : null;
    if (idx == null)
      idx =
        TT && TT.wordIndexAt
          ? TT.wordIndexAt(words, t, cue.start, cue.end, { forceEven: !!forceTime })
          : 0;
    return { words, idx };
  }

  function pickCues(token) {
    if (!token) return { cues: [], lang: "", token: "" };
    const bag = (window.QuietTube && window.QuietTube.cuesByLang) || {};
    const tlang = token.toLowerCase().startsWith("tlang:");
    const want = (tlang ? token.slice(6) : token).toLowerCase();
    const wantBase = langBase(want);
    const orig = (window.QuietTube && window.QuietTube.originalLang) || "";
    const generated = window.QuietTube && window.QuietTube.cues;
    /* Original-language paint uses ASR word times, not uploaded lines. */
    if (
      !tlang &&
      generated &&
      generated.length &&
      (want === "primary" || (orig && wantBase === langBase(orig)))
    ) {
      return {
        cues: generated,
        lang: orig || "primary",
        token,
        sourceTimed: false,
      };
    }
    if (tlang) {
      const exact = bag["tlang:" + want] || bag[token];
      if (exact && exact.length)
        return { cues: exact, lang: want, tlang: true, sourceTimed: true, token };
      const k = Object.keys(bag).find((x) => {
        const xl = x.toLowerCase();
        return xl.startsWith("tlang:") && langBase(xl) === wantBase;
      });
      return {
        cues: (k && bag[k]) || [],
        lang: want,
        tlang: true,
        sourceTimed: true,
        token,
      };
    }
    const asrHit = bag["asr:" + want] || bag["asr:" + wantBase];
    if (asrHit && asrHit.length)
      return {
        cues: asrHit,
        lang: want,
        sourceTimed: !!(orig && wantBase !== langBase(orig)),
        token,
      };
    const hit = Object.keys(bag).find(
      (k) => !k.startsWith("tlang:") && !k.startsWith("asr:") && langBase(k) === wantBase,
    );
    if (hit)
      return {
        cues: bag[hit],
        lang: hit,
        sourceTimed: !!(orig && langBase(hit) !== langBase(orig)),
        token,
      };
    const translatedHit = Object.keys(bag).find(
      (k) => k.startsWith("tlang:") && langBase(k) === wantBase,
    );
    if (translatedHit)
      return {
        cues: bag[translatedHit],
        lang: want,
        tlang: true,
        sourceTimed: true,
        token,
      };
    if (want === "primary" && window.QuietTube?.cues?.length)
      return {
        cues: window.QuietTube.cues,
        lang: "primary",
        sourceTimed: false,
        token,
      };
    return { cues: [], lang: want, token };
  }

  function wordHtml(w, i, idx, col) {
    const on = i === idx;
    /* Highlight on: current word in slot color, others dim.
       Center on + highlight off: only the center word is white; neighbors dim.
       Full line + highlight off: every word white. */
    let style;
    if (highlightOn()) {
      style = on ? "color:" + col + ";opacity:1" : "color:#fff;opacity:0.28";
    } else if (centerOn()) {
      style = on ? "color:#fff;opacity:1" : "color:#fff;opacity:0.28";
    } else {
      style = "color:#fff;opacity:1";
    }
    let inner = escapeHtml(w.w);
    if (on && centerOn()) {
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
      setData(el, "sig", "");
    });
  }

  function hideNative(on) {
    const p = bindPlayer();
    if (p) p.classList.toggle("qt-ours-on", on);
  }

  function hideOurs() {
    hideNative(false);
    const pEl = document.getElementById("qt-cap-p");
    const sEl = document.getElementById("qt-cap-s");
    if (pEl) {
      setHidden(pEl, true);
      setData(pEl, "sig", "");
      if (pEl.textContent) pEl.replaceChildren();
    }
    if (sEl) {
      setHidden(sEl, true);
      setData(sEl, "sig", "");
      if (sEl.textContent) sEl.replaceChildren();
    }
  }

  function ccEnabled(scope) {
    const p = scope || player();
    const btn = p && p.querySelector(
      ".ytp-subtitles-button, .ytp-subtitles-button-icon, button.ytp-button[aria-label*='ubtitle' i], button.ytp-button[aria-label*='egend' i]",
    );
    if (btn && btn.getAttribute("aria-pressed") != null)
      return btn.getAttribute("aria-pressed") === "true";
    return !!(p && p.classList.contains("captions-enabled"));
  }

  function tick() {
    if (document.hidden || !onCaptionPage()) {
      hideOurs();
      return;
    }
    const active = ensure();
    const v = video(active);
    const pEl = document.getElementById("qt-cap-p");
    const sEl = document.getElementById("qt-cap-s");
    if (!v || !pEl || !sEl) return;
    /* Shorts players are recycled aggressively. Until the rhythm owner
       matches the pathname, the only safe paint is no paint: otherwise a
       late response from the previous reel flashes its words over the next. */
    if (isShortsPage()) {
      const wanted = pageVideoId();
      const rhythmId = window.QuietTube?.videoId || "";
      const activeId = playerVideoId(active);
      if (!wanted || rhythmId !== wanted || activeId !== wanted) {
        hideOurs();
        return;
      }
    }
    if (state.captionsEnabled === false) {
      hideOurs();
      return;
    }
    const t = v.currentTime;
    const hasCues = !!(window.QuietTube && window.QuietTube.cues && window.QuietTube.cues.length);
    let langs = normalizeSlots(state.langs);
    const shorts = isShortsPage();
    if (shorts) {
      langs = langs[0] ? [langs[0]] : [];
    } else if (!state.dual) {
      const visible = langs[0] || langs[1] || "";
      langs = visible ? [visible] : [];
    }
    const activeLangs = langs.filter(Boolean);
    const dualActive = !shorts && state.dual && activeLangs.length > 0;
    const wantPaint = highlightOn() || centerOn() || dualActive;
    if (!wantPaint) {
      hideOurs();
      return;
    }
    if (!ccEnabled(active)) {
      hideOurs();
      return;
    }
    if (!hasCues && !activeLangs.length) {
      hideOurs();
      return;
    }
    activeLangs.forEach(requestLang);
    const px = captionFontPx();
    pEl.classList.toggle("qt-rsvp", centerOn());
    sEl.classList.toggle("qt-rsvp", centerOn());
    /* Highlight / Center must also work with YouTube's ordinary single
       caption language. Only synthesize this token when there is no explicit
       Toolkit selection at all: in Dual mode ["", secondary] is an intentional
       empty primary slot and must stay empty. */
    const primaryToken =
      langs[0] ||
      (!activeLangs.length && (highlightOn() || centerOn()) && hasCues
        ? "primary"
        : "");
    const secondaryToken = !shorts && state.dual ? langs[1] || "" : "";
    const two = !!(primaryToken && secondaryToken);
    let packA = null;
    if (primaryToken) {
      packA = pickCues(primaryToken);
      const orig = (window.QuietTube && window.QuietTube.originalLang) || "";
      if (
        !packA.cues.length &&
        window.QuietTube?.cues?.length &&
        (primaryToken === "primary" ||
          (orig &&
            langBase(primaryToken) === langBase(orig) &&
            !String(primaryToken).startsWith("tlang:")))
      ) {
        packA = {
          cues: window.QuietTube.cues,
          lang: primaryToken,
          token: primaryToken,
          tlang: false,
        };
      }
      packA.slot = 0;
    }
    if (packA && packA.cues.length) {
      setHidden(pEl, false);
      setData(pEl, "qtSlot", "0");
      renderLine(pEl, packA, t, two);
      applyCaptionSize(pEl, px);
      applyPos(pEl, "p");
    } else {
      setHidden(pEl, true);
      setData(pEl, "qtSlot", "");
      pEl.innerHTML = "";
      setData(pEl, "sig", "");
      if (primaryToken) requestLang(primaryToken);
    }
    if (secondaryToken) {
      const packB = pickCues(secondaryToken);
      packB.slot = 1;
      const sameLang =
        !!primaryToken &&
        langBase(primaryToken) === langBase(secondaryToken);
      const sameBuf =
        !!packA && packB.cues.length && packB.cues === packA.cues;
      if (!packB.cues.length || sameLang || sameBuf) {
        setHidden(sEl, true);
        setData(sEl, "qtSlot", "");
        sEl.innerHTML = "";
        setData(sEl, "sig", "");
        if (!sameLang) requestLang(secondaryToken);
      } else {
        setHidden(sEl, false);
        setData(sEl, "qtSlot", "1");
        renderLine(sEl, packB, t, two);
        applyCaptionSize(sEl, px);
        applyPos(sEl, "s", !primaryToken);
      }
    } else {
      setHidden(sEl, true);
      setData(sEl, "qtSlot", "");
      sEl.innerHTML = "";
      setData(sEl, "sig", "");
    }
    hideNative(!(pEl.hidden && sEl.hidden));
  }

  function requestLang(token) {
    if (!token) return;
    const bag = (window.QuietTube && window.QuietTube.cuesByLang) || {};
    const tlang = token.toLowerCase().startsWith("tlang:");
    const code = (tlang ? token.slice(6) : token).toLowerCase();
    const wantBase = langBase(token);
    const orig = (window.QuietTube && window.QuietTube.originalLang) || "";
    const needAsr =
      !tlang && orig && langBase(code) === langBase(orig) && !window.QuietTube._cuesAreAsr;
    /* A bare token whose language has no dedicated track on this video is
       served by the auto-translate fallback below, which stores its cues
       under "tlang:<code>". Requiring an exact tlang/non-tlang match made
       that request's own result invisible to this check, so the termination
       condition could never be met and the language was re-fetched for the
       life of the page. Accept a translated bag entry for a bare token when
       the video publishes no dedicated track for it. */
    const tracksNow = (window.QuietTube && window.QuietTube.tracks) || [];
    const hasOwnTrack =
      !tlang &&
      tracksNow.some((tr) => langBase(tr && tr.languageCode) === wantBase);
    /* Never for the original language: there a translation must not stand in
       for the ASR source. */
    const acceptTranslated = !tlang && !needAsr && !hasOwnTrack;
    const have = Object.keys(bag).some((k) => {
      if (!bag[k] || !bag[k].length) return false;
      const xl = k.toLowerCase();
      const isTl = xl.startsWith("tlang:");
      const isAsrKey = xl.startsWith("asr:");
      if (tlang !== isTl && !(acceptTranslated && isTl)) return false;
      if (needAsr && !isAsrKey) return false;
      const base = langBase(xl.replace(/^asr:/, "").replace(/^tlang:/, ""));
      return base === wantBase;
    });
    if (have) {
      /* Resolved: clear any backoff so a later video starts fresh. */
      delete attempts[token.toLowerCase()];
      return;
    }
    const tracks = window.QuietTube?.tracks || [];
    if (!tracks.length) {
      /* tick() runs at ~7 Hz. An unthrottled ask here made inject.js re-parse
         the player response and force a fetch on every frame while the track
         list was still empty — the same storm shape as QT_TRACKS. */
      const now = Date.now();
      if (now - lastNeedTracksAt >= NEED_TRACKS_MS) {
        lastNeedTracksAt = now;
        window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
      }
      return;
    }
    const TT = globalThis.YtToolkitTimedtext;
    const isAsr = (tr) => (TT && TT.trackIsAsr ? TT.trackIsAsr(tr) : tr && tr.kind === "asr");
    const asr = tracks.find(isAsr) || tracks[0];
    const exactAsr =
      !tlang &&
      tracks.find((tr) => isAsr(tr) && langBase(tr.languageCode) === langBase(code));
    const exact =
      exactAsr ||
      (!tlang &&
        tracks.find((tr) => langBase(tr.languageCode) === langBase(code)));
    let url = "";
    let translatedFallback = false;
    if (exact) url = exact.baseUrl;
    else if (asr) {
      url =
        asr.baseUrl +
        (asr.baseUrl.includes("?") ? "&" : "?") +
        "tlang=" +
        encodeURIComponent(code);
      translatedFallback = true;
    }
    if (url && !/[?&]fmt=/.test(url))
      url += (url.includes("?") ? "&" : "?") + "fmt=json3";
    if (!url) return;
    const now = Date.now();
    const k = (tlang ? "tlang:" : "") + code + "|" + url;
    /* A language that never yields cues (an Auto-translate child whose tlang
       body comes back empty) must not be retried every 3 s for the life of the
       page. Back off geometrically instead, and reset once it resolves. */
    const tries = attempts[token.toLowerCase()] || 0;
    const wait = Math.min(60000, 3000 * Math.pow(2, Math.max(0, tries - 1)));
    if (asked[k] && now - asked[k] < wait) return;
    asked[k] = now;
    attempts[token.toLowerCase()] = tries + 1;
    window.postMessage(
      {
        source: "quiettube-iso",
        type: "QT_FETCH_TRACK",
        url,
        lang: tlang || translatedFallback ? "tlang:" + code : code,
        videoId: pageVideoId(),
      },
      "*",
    );
  }

  function requestSecondTrack() {
    (state.langs || []).forEach(requestLang);
  }

  document.addEventListener("qt-tracks", () => {
    if (state.langs.length) requestSecondTrack();
    tick();
  });
  document.addEventListener("qt-cues", () => {
    bustCap();
    tick();
  });

  function syncTicks() {
    if (document.hidden || !onCaptionPage()) hideOurs();
    else tick();
  }

  document.addEventListener("qt-toolkit-frame", () => {
    if (document.hidden || !onCaptionPage()) return;
    tick();
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "-" || e.key === "=" || e.key === "+" || e.key === "_")
        setTimeout(tick, 80);
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target && e.target.closest && e.target.closest("button, .ytp-button, .ytp-menuitem, .ytp-popup");
      if (!t) return;
      const label = (
        (t.getAttribute && t.getAttribute("aria-label")) ||
        t.textContent ||
        ""
      ).toLowerCase();
      if (
        /font size|tamanho da fonte|caption size|increase|decrease|maior|menor/.test(label) ||
        t.closest(".ytp-popup") ||
        t.closest(".caption-window") ||
        t.closest(".ytp-caption-window-container")
      )
        setTimeout(tick, 40);
    },
    true,
  );
  document.addEventListener("visibilitychange", syncTicks);
  document.addEventListener("yt-navigate-finish", () => {
    invalidatePlayerCache();
    if (!onCaptionPage()) disconnectPlayerLifecycle();
    Object.keys(asked).forEach((k) => {
      delete asked[k];
    });
    Object.keys(attempts).forEach((k) => {
      delete attempts[k];
    });
    lastNeedTracksAt = 0;
    state.pos = { p: { x: 0, bottom: null }, s: { x: 0, bottom: null } };
    bustCap();
    syncTicks();
  });
  load();
  syncTicks();
  setTimeout(() => {
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  }, 400);
})();
