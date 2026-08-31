/* yt-toolkit pace overlay + WPM lock + trim silence + keys. */
(function () {
  const TARGET_MIN = 120;
  const TARGET_MAX = 800;
  const WPM_STEP = 10;
  const WPM_PRESETS = [120, 180, 250, 400, 600];
  const RATE_MIN = 0.25;
  const RATE_MAX = 4;
  const LOCK_MIN = 0.7;
  const LOCK_MAX = 4;
  const SILENCE = 0.45;
  const SPEED_PRESETS = [1, 1.25, 1.5, 2, 3];
  const TT = globalThis.YtToolkitTimedtext;
  const WPM = globalThis.YtToolkitWpm;
  const CLK = globalThis.YtToolkitClock;

  /* Material Icons Outlined — 24px, currentColor */
  const ICO = {
    speed:
      '<svg class="qt-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19a8 8 0 10-7.3-11.7"/><path d="M12 12l3.8-3.2"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/></svg>',
    lock:
      '<svg class="qt-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>',
    cut:
      '<svg class="qt-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/></svg>',
  };

  const QT = (window.QuietTube = window.QuietTube || {});
  QT.state = {
    targetWpm: 180,
    paceLock: true,
    trimSilence: true,
    wordHighlight: true,
    centerWord: false,
    playbackRate: 1,
  };
  QT.cues = [];
  QT.cuesByLang = {};
  QT.cueProvenance = {};
  QT.tracks = [];
  QT.translationLanguages = [];
  QT.originalLang = "";
  QT.videoId = "";
  QT._cuesAreAsr = false;
  QT._tracksAskSig = "";
  QT._want = 1;
  QT._writing = false;
  QT._menuOpen = false;
  QT._lastWpm = 0;
  QT._dragging = false;
  let menuDragSeq = 0;
  let menuDrag = null;
  QT._userRate = 1;
  QT._applyUserRate = true;
  QT._rateAppliedTo = null;
  QT._hold1x = false;
  QT._hold1xFrom = 1;

  /* Rhythm authority. Pace Lock, Trim, the adjusted clock and word timing
     may only run off auto-generated ASR in the original language. Uploaded /
     coarse captions carry cue-level times only, so deriving a rate from them
     desyncs speech and holds trim boost through words. The stored
     preferences below are never erased: they stay armed and resume by
     themselves when a late ASR track arrives. */
  function asrRhythm() {
    return !!QT._cuesAreAsr;
  }
  function lockOn() {
    return !QT._hold1x && QT.state.paceLock && asrRhythm();
  }
  function trimOn() {
    return !QT._hold1x && QT.state.trimSilence && asrRhythm();
  }
  QT.asrRhythm = asrRhythm;
  QT.lockOn = lockOn;
  QT.trimOn = trimOn;

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }
  function formatRate(r) {
    const x = Math.round(r * 100) / 100;
    return Number.isInteger(x) ? x + "x" : String(x) + "x";
  }
  function steppedManualRate(base, delta) {
    return clamp(
      Math.round((Number(base) + Number(delta)) * 100) / 100,
      RATE_MIN,
      RATE_MAX,
    );
  }
  function isNoise(text) {
    return TT ? TT.isNoise(text) : !(text || "").trim();
  }

  function load() {
    const Prefs = globalThis.YtToolkitPrefs;
    const apply = (s) => {
      const b = Prefs ? Prefs.bool : (v, d) => (v === true || v === false ? v : d);
      QT.state.targetWpm = Number(s.qt_targetWpm) || 180;
      QT.state.paceLock = b(s.qt_paceLock, true);
      QT.state.trimSilence = b(s.qt_trimSilence, true);
      QT.state.wordHighlight = b(s.qt_wordHighlight, true);
      QT.state.centerWord = b(s.qt_centerWord, false);
      QT._userRate = clamp(Number(s.qt_playbackRate) || 1, RATE_MIN, RATE_MAX);
      QT._hold1x = b(s.qt_fixed1x, false);
      QT._hold1xFrom = QT._userRate;
      QT._want = QT._hold1x ? 1 : QT._userRate;
      if (QT._hold1x || !QT.state.paceLock)
        QT.state.playbackRate = QT._hold1x ? 1 : QT._userRate;
      QT._applyUserRate = !QT._hold1x;
      renderMenu();
      renderCluster();
    };
    if (Prefs) Prefs.get(
      ["qt_targetWpm", "qt_paceLock", "qt_trimSilence", "qt_playbackRate", "qt_fixed1x", "qt_wordHighlight", "qt_centerWord"],
      apply,
    );
    else
      chrome.storage.sync.get(
        ["qt_targetWpm", "qt_paceLock", "qt_trimSilence", "qt_playbackRate", "qt_fixed1x", "qt_wordHighlight", "qt_centerWord"],
        apply,
      );
  }
  function save(partial, rebuild) {
    const map = {
      targetWpm: "qt_targetWpm",
      paceLock: "qt_paceLock",
      trimSilence: "qt_trimSilence",
      wordHighlight: "qt_wordHighlight",
      centerWord: "qt_centerWord",
    };
    const out = {};
    for (const k of Object.keys(partial)) {
      QT.state[k] = partial[k];
      if (map[k]) out[map[k]] = partial[k];
    }
    if (Object.keys(out).length) {
      const Prefs = globalThis.YtToolkitPrefs;
      if (Prefs) Prefs.set(out);
      else chrome.storage.sync.set(out);
    }
    if (Object.prototype.hasOwnProperty.call(partial, "paceLock") && !partial.paceLock) {
      QT._want = QT._userRate;
      QT._applyUserRate = true;
    }
    if (rebuild !== false) renderMenu();
    renderCluster();
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync" && area !== "local") return;
    if (ch.qt_targetWpm) {
      const target = Number(ch.qt_targetWpm.newValue) || QT.state.targetWpm;
      if (menuDrag?.kind === "wpm") menuDrag.savedValue = target;
      else QT.state.targetWpm = target;
    }
    if (ch.qt_paceLock) {
      const nextPaceLock = !!ch.qt_paceLock.newValue;
      QT.state.paceLock = nextPaceLock;
      if (menuDrag?.kind === "rate" && menuDrag.neutralWasOn)
        menuDrag.paceLock = nextPaceLock;
      if (!QT.state.paceLock) {
        QT._want = QT._userRate;
        QT._applyUserRate = true;
      }
    }
    if (ch.qt_trimSilence) {
      QT.state.trimSilence = ch.qt_trimSilence.newValue;
      QT._dispCur = null;
      QT._durKey = "";
    }
    if (ch.qt_paceLock) QT._durKey = "";
    if (ch.qt_targetWpm) QT._durKey = "";
    if (ch.qt_playbackRate) {
      const r = clamp(Number(ch.qt_playbackRate.newValue) || 1, RATE_MIN, RATE_MAX);
      if (menuDrag?.kind === "rate") {
        menuDrag.savedValue = r;
        if (menuDrag.neutralWasOn) menuDrag.hold1xFrom = r;
      }
      else {
        QT._userRate = r;
        if (QT._hold1x) QT._hold1xFrom = r;
        else if (!lockOn()) {
          QT._want = r;
          QT.state.playbackRate = r;
          QT._applyUserRate = true;
        }
      }
    }
    if (ch.qt_fixed1x) {
      const nextFixed1x = !!ch.qt_fixed1x.newValue;
      /* A rate preview temporarily leaves fixed 1x before it is committed.
         Keep the cancellation snapshot aligned with the latest global value;
         otherwise pointercancel can resurrect a state another tab disabled. */
      if (menuDrag?.kind === "rate") {
        menuDrag.neutralWasOn = nextFixed1x;
        if (nextFixed1x) {
          menuDrag.hold1xFrom = clamp(
            Number(QT._userRate) || menuDrag.savedValue || 1,
            RATE_MIN,
            RATE_MAX,
          );
          menuDrag.paceLock = QT.state.paceLock;
        }
      }
      if (nextFixed1x !== QT._hold1x)
        setFixed1x(nextFixed1x, { persist: false });
    }
    if (ch.qt_wordHighlight) QT.state.wordHighlight = ch.qt_wordHighlight.newValue;
    if (ch.qt_centerWord) QT.state.centerWord = ch.qt_centerWord.newValue;
    if (!QT._dragging && (ch.qt_paceLock || ch.qt_trimSilence)) renderMenu();
    renderCluster();
  });

  function isShortsPage() {
    return /^\/shorts(?:\/|$)/.test(location.pathname || "");
  }

  function currentPageVideoId() {
    const queryId = new URLSearchParams(location.search).get("v") || "";
    if (queryId) return queryId;
    const match = String(location.pathname || "").match(/^\/shorts\/([^/?#]+)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  function isPacePage() {
    const pathname = location.pathname || "";
    return pathname.startsWith("/watch") || /^\/shorts(?:\/|$)/.test(pathname);
  }

  function playerFromShortsRoot(root) {
    if (!root || !root.querySelector) return null;
    return (
      root.querySelector("#shorts-player.html5-video-player") ||
      root.querySelector("#shorts-player .html5-video-player") ||
      root.querySelector(".html5-video-player") ||
      root.querySelector("#shorts-player")
    );
  }

  let shortsPlayerCache = null;
  let shortsPlayerCacheAt = 0;
  function playerVideoId(player) {
    if (!player || typeof player.getPlayerResponse !== "function") return "";
    try {
      return player.getPlayerResponse()?.videoDetails?.videoId || "";
    } catch {
      return "";
    }
  }

  let watchPlayerCache = null;

  function watchPlayerVisibleArea(player) {
    if (!player || !player.isConnected || !player.getClientRects().length) return 0;
    if (effectiveOpacityThrough(player, document.documentElement) <= 0.02) return 0;
    const rect = player.getBoundingClientRect();
    const width = Math.max(
      0,
      Math.min(rect.right, innerWidth) - Math.max(rect.left, 0),
    );
    const height = Math.max(
      0,
      Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
    );
    return width * height;
  }

  function activeWatchPlayer() {
    if (!(location.pathname || "").startsWith("/watch")) return null;
    const wanted = currentPageVideoId();
    if (
      watchPlayerCache &&
      watchPlayerCache.isConnected &&
      watchPlayerCache.querySelector("video.html5-main-video, video") &&
      (!wanted || !playerVideoId(watchPlayerCache) ||
        playerVideoId(watchPlayerCache) === wanted)
    )
      return watchPlayerCache;

    const candidates = [];
    const add = (candidate) => {
      if (
        candidate &&
        candidate.querySelector("video.html5-main-video, video") &&
        !candidates.includes(candidate)
      )
        candidates.push(candidate);
    };
    document
      .querySelectorAll("#movie_player, .html5-video-player")
      .forEach(add);

    let found = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const area = watchPlayerVisibleArea(candidate);
      const watchRoot = candidate.closest("ytd-watch-flexy");
      const inMiniplayer = !!candidate.closest("ytd-miniplayer");
      const exact = !!wanted && playerVideoId(candidate) === wanted;
      let score = area;
      if (area > 0) score += 1e10;
      else score -= 1e12;
      if (watchRoot && effectiveOpacityThrough(watchRoot, document.documentElement) > 0.02)
        score += 1e12;
      if (exact) score += 1e11;
      if (inMiniplayer) score -= 2e12;
      if (score > bestScore) {
        bestScore = score;
        found = candidate;
      }
    }
    watchPlayerCache = found;
    return watchPlayerCache;
  }

  function activeShortsPlayer() {
    if (!isShortsPage()) return null;
    const now = performance.now();
    const wanted = currentPageVideoId();
    if (
      shortsPlayerCache &&
      shortsPlayerCache.isConnected &&
      (!wanted || playerVideoId(shortsPlayerCache) === wanted)
    )
      return shortsPlayerCache;

    const candidates = [];
    const add = (candidate) => {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };
    const markedRoot = document.querySelector(
      "ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active], ytd-reel-video-renderer[aria-hidden='false']",
    );
    const markedPlayer = playerFromShortsRoot(markedRoot);
    if (markedPlayer && (!wanted || playerVideoId(markedPlayer) === wanted)) {
      shortsPlayerCache = markedPlayer;
      shortsPlayerCacheAt = now;
      return shortsPlayerCache;
    }
    add(markedPlayer);
    document
      .querySelectorAll(
        "ytd-reel-video-renderer .html5-video-player, ytd-reel-video-renderer #shorts-player",
      )
      .forEach(add);

    let exact = null;
    let found = null;
    let bestScore = -Infinity;
    if (wanted) {
      for (const candidate of candidates) {
        if (playerVideoId(candidate) !== wanted) continue;
        shortsPlayerCache = candidate;
        shortsPlayerCacheAt = now;
        return shortsPlayerCache;
      }
    }
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      const width = Math.max(
        0,
        Math.min(rect.right, innerWidth) - Math.max(rect.left, 0),
      );
      const height = Math.max(
        0,
        Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
      );
      const area = width * height;
      if (wanted && playerVideoId(candidate) === wanted) {
        if (area > 0) {
          found = candidate;
          break;
        }
        exact = exact || candidate;
      }
      const centerPenalty = Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
      const score = area - centerPenalty;
      if (score > bestScore) {
        bestScore = score;
        found = candidate;
      }
    }
    shortsPlayerCache = exact || found || null;
    shortsPlayerCacheAt = now;
    return shortsPlayerCache;
  }

  function playerEl() {
    return (
      activeShortsPlayer() ||
      activeWatchPlayer() ||
      document.querySelector("#movie_player, .html5-video-player")
    );
  }

  function videoEl() {
    const player = playerEl();
    const scoped = player && player.querySelector("video.html5-main-video, video");
    return (
      scoped ||
      document.querySelector(
        "#movie_player video.html5-main-video, ytd-player video, video.html5-main-video",
      )
    );
  }

  function parseTimedtext(text) {
    return TT ? TT.parseTimedtext(text) : [];
  }

  let pageGeneration = 0;
  let navigationVideoId = currentPageVideoId();
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== "quiettube") return;
    if (d.type === "QT_TIMEDTEXT" && d.text) {
      if (!d.videoId || d.videoId !== currentPageVideoId()) return;
      const cues = parseTimedtext(d.text);
      if (cues.length) {
        const meta = TT ? TT.langFromUrl(d.url) : {};
        let key = (d.lang || "").toLowerCase();
        if (!key && meta.tlang) key = "tlang:" + meta.tlang;
        if (!key && meta.lang) key = meta.lang;
        if (!key) key = "primary";
        const translation = !!(TT && TT.isTranslation(d.url, key));
        if (translation) {
          const translatedCode =
            meta.tlang || key.replace(/^tlang:/, "") || meta.lang || "primary";
          key = "tlang:" + translatedCode;
        }
        const fromAsr = !!(
          !translation &&
          (d.asr === true || (TT && TT.isGeneratedUrl(d.url)))
        );
        QT.cuesByLang[key] = cues;
        QT.cueProvenance[key] = {
          asr: fromAsr,
          original: d.original === true,
          translation,
        };
        if (fromAsr) QT.cuesByLang["asr:" + key.replace(/^tlang:/, "")] = cues;
        if (fromAsr)
          QT.cueProvenance["asr:" + key.replace(/^tlang:/, "")] = {
            asr: true,
            original: true,
            translation: false,
          };
        const asrPinned =
          QT._cuesAreAsr ||
          (QT.tracks || []).some((t) => TT && TT.trackIsAsr(t));
        const producerFallback = d.original === true && !asrPinned;
        const original =
          !translation &&
          (fromAsr ||
          producerFallback ||
          (
            TT &&
            TT.isOriginalTrack(key, d.url, QT.originalLang, {
              requireAsr: asrPinned,
            })));
        if (original) {
          QT.originalLang = (meta.lang || key).replace(/^tlang:/, "") || QT.originalLang;
          adoptOriginalCues(cues, fromAsr);
        }
        document.dispatchEvent(new CustomEvent("qt-cues", { detail: { key, cues, original } }));
      }
    }
    if (d.type === "QT_TRACKS") {
      if (!d.videoId || d.videoId !== currentPageVideoId()) return;
      QT.videoId = d.videoId;
      QT.tracks = d.tracks || [];
      QT.translationLanguages = d.translationLanguages || [];
      document.dispatchEvent(new CustomEvent("qt-tracks", { detail: QT.tracks }));
      /* MAIN-world inject.js is the single timedtext fetch authority. It owns
         auth-token harvest, per-video generation and retry/backoff.
         Answering every announcement is a feedback loop: QT_NEED_TRACKS makes
         inject re-post QT_TRACKS, which would ask again (measured 32k fetches
         in the first second on a video with no ASR). Ask once per distinct
         tracklist, so a late ASR track still earns exactly one extra pull. */
      if (QT._cuesAreAsr) return;
      const announced = QT.tracks;
      const asrTrack = announced.find((t) => TT && TT.trackIsAsr(t));
      if (!asrTrack && QT.cues.length) return;
      const sig =
        d.videoId +
        "|" +
        announced
          .map(
            (t) =>
              (t.kind || "") + ":" + (t.languageCode || "") + ":" + (t.vssId || ""),
          )
          .join(",");
      if (sig === QT._tracksAskSig) return;
      QT._tracksAskSig = sig;
      window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
    }
  });

  function cueSpan(cues) {
    if (!cues || !cues.length) return 0;
    return Math.max(0, cues[cues.length - 1].end - cues[0].start);
  }

  function adoptOriginalCues(cues, fromAsr) {
    if (!cues || !cues.length) return;
    const wasAsr = QT._cuesAreAsr;
    if (fromAsr) {
      QT.cues = cues;
      QT._cuesAreAsr = true;
    } else if (QT._cuesAreAsr) {
      return;
    } else if (!QT.cues.length || cues.length >= QT.cues.length || cueSpan(cues) >= cueSpan(QT.cues) * 0.9) {
      QT.cues = cues;
    } else {
      const seen = new Map();
      for (const c of QT.cues) seen.set(c.start.toFixed(2) + "\0" + c.text, c);
      for (const c of cues) seen.set(c.start.toFixed(2) + "\0" + c.text, c);
      QT.cues = Array.from(seen.values()).sort((a, b) => a.start - b.start);
    }
    QT._tw = null;
    QT._twN = 0;
    QT._baseWpm = 0;
    QT._smoothWpm = 0;
    QT._dispCur = null;
    QT._durKey = "";
    /* A late ASR track re-arms Pace Lock / Trim on its own: the saved
       preferences were never cleared, so repaint the menu and pill instead
       of asking the user to toggle CC or pick the language again. */
    if (fromAsr && !wasAsr) {
      renderMenu();
      renderCluster();
    }
  }

  function ensureOriginalCues() {
    if (QT._cuesAreAsr) return;
    const bag = QT.cuesByLang || {};
    const provenance = QT.cueProvenance || {};
    const asrKey = Object.keys(bag).find(
      (k) =>
        bag[k] &&
        bag[k].length &&
        (provenance[k]?.asr === true || String(k).startsWith("asr:")),
    );
    if (asrKey) {
      QT.originalLang =
        QT.originalLang || String(asrKey).replace(/^asr:/, "");
      adoptOriginalCues(bag[asrKey], true);
      return;
    }
    if (QT.cues.length) return;
    const hasAsrTrack = (QT.tracks || []).some((track) => TT && TT.trackIsAsr(track));
    if (hasAsrTrack) return;
    const keys = Object.keys(bag);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const meta = provenance[k];
      if (
        !meta ||
        meta.original !== true ||
        meta.translation === true ||
        String(k).startsWith("tlang:") ||
        String(k).startsWith("asr:")
      )
        continue;
      const c = bag[k];
      if (c && c.length) {
        QT.originalLang = QT.originalLang || String(k).replace(/^tlang:/, "");
        adoptOriginalCues(c, false);
        return;
      }
    }
  }

  function timedWords() {
    ensureOriginalCues();
    if (QT._tw && QT._twN === QT.cues.length) return QT._tw;
    const out = TT ? TT.timedWords(QT.cues) : [];
    /* Build fixed-scale orthographic loads once, alongside the immutable
       transcript cache. localWpm() then stays bounded to its 8/14s window. */
    if (WPM && WPM.prepareWords) WPM.prepareWords(out);
    QT._tw = out;
    QT._twN = QT.cues.length;
    return out;
  }

  function inSilence(t) {
    return WPM ? WPM.inSilence(timedWords(), t) : true;
  }

  function baseWpm() {
    if (QT._baseWpm && QT._baseN === QT.cues.length) return QT._baseWpm;
    QT._baseWpm = WPM ? WPM.baseWpm(timedWords()) : 0;
    QT._baseN = QT.cues.length;
    return QT._baseWpm;
  }

  function localWpm(t) {
    const words = timedWords();
    const live = WPM ? WPM.localWpm(words, t) : 0;
    if (live > 0) {
      QT._smoothWpm = QT._smoothWpm ? QT._smoothWpm * 0.5 + live * 0.5 : live;
      QT._speechWpm = QT._smoothWpm;
      QT._lastWpm = QT._smoothWpm;
      return QT._smoothWpm;
    }
    if (!words.length || (WPM && WPM.inSilence(words, t))) {
      QT._smoothWpm = 0;
      QT._lastWpm = 0;
      return 0;
    }
    return QT._smoothWpm || QT._speechWpm || baseWpm() || 0;
  }

  function speechEnd(c) {
    const n = (c.words && c.words.length) || 0;
    return Math.min(c.end, c.start + Math.max(0.18, n * 0.28));
  }

  function gaps() {
    const spoken = QT.cues.filter((c) => !isNoise(c.text) && c.words && c.words.length);
    const out = [];
    if (spoken.length && spoken[0].start > 0.8) {
      out.push({ start: 0.05, end: spoken[0].start - 0.04 });
    }
    for (let i = 0; i < spoken.length - 1; i++) {
      const lastW = spoken[i].words[spoken[i].words.length - 1];
      const a = Math.min(spoken[i].end, (lastW && lastW.t) || spoken[i].start) + 0.22;
      const b = spoken[i + 1].start;
      if (b - a >= SILENCE) out.push({ start: a, end: b - 0.03 });
    }
    for (const c of QT.cues) {
      if (isNoise(c.text) && c.end - c.start > 0.3) {
        out.push({ start: c.start, end: c.end });
      }
    }
    return out;
  }

  function formatClock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h)
      return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
  }

  function silenceCut(t0, t1) {
    return WPM ? WPM.silenceCut(timedWords(), t0, t1, WPM.TRIM_GAP) : 0;
  }

  /* Clock divisor: median lock rate (stable). Not live localWpm, not trim 4×/8×. */
  function clockRate() {
    if (lockOn()) {
      const want = WPM
        ? WPM.lockRate(QT.state.targetWpm, baseWpm() || 0)
        : null;
      if (want != null) return want;
    }
    if (QT._trimBoost) return QT._userRate || 1;
    const v = videoEl();
    let r = (v && v.playbackRate) || QT.state.playbackRate || QT._userRate || 1;
    if (!(r > 0.08) || r > RATE_MAX + 0.05) r = QT._userRate || 1;
    return r;
  }

  /* Live lock: targetWpm / localWpm so the player follows speech speed. */
  function liveLockRate() {
    const v = videoEl();
    const t = v ? v.currentTime : 0;
    const w = localWpm(t) || QT._speechWpm || baseWpm();
    if (!WPM) return null;
    const want = WPM.lockRate(QT.state.targetWpm, w);
    if (want != null) QT._lockShown = want;
    return want;
  }

  /* Visible × on the pace pill: live transport rate, including Trim 4×/8×.
     Clock still uses clockRate() (saved manual / median lock, never trim). */
  function pillRate() {
    if (QT._hold1x) return 1;
    const v = videoEl();
    const raw = (v && v.playbackRate) || 0;
    if (QT._trimBoost) return raw > 0.08 ? raw : QT._userRate || 1;
    if (lockOn()) {
      const live = liveLockRate();
      if (live != null) return live;
      if (QT._lockShown) return QT._lockShown;
    }
    if (raw > RATE_MAX + 0.05) return QT._userRate || 1;
    return raw > 0.08 ? raw : QT._userRate || 1;
  }

  function displayRate() {
    return clockRate();
  }

  function stableRate() {
    if (lockOn()) {
      const live = liveLockRate();
      if (live != null) return live;
    }
    return clockRate();
  }

  function watchSecs(t0, t1) {
    if (t1 <= t0) return 0;
    let span = t1 - t0;
    if (trimOn() && QT.cues.length) {
      span = Math.max(0, span - silenceCut(t0, t1));
    }
    const rate = clockRate();
    return span / (rate > 0.08 ? rate : 1);
  }

  function adjDuration() {
    const v = videoEl();
    if (!v || !isFinite(v.duration) || v.duration < 0.5) return 0;
    const rate = clockRate();
    const key = [
      Math.round(v.duration),
      lockOn() ? 1 : 0,
      trimOn() ? 1 : 0,
      QT.state.targetWpm,
      Math.round(baseWpm() || 0),
      Math.round(rate * 20),
      QT.cues.length,
    ].join("|");
    if (QT._durKey === key && QT._adjDur > 0) return QT._adjDur;
    QT._durKey = key;
    QT._adjDur = watchSecs(0, v.duration);
    return QT._adjDur;
  }

  QT.watchSecs = watchSecs;

  function dimOrig(s) {
    return '<span class="qt-orig-time">\u00a0(' + s + ")</span>";
  }

  function overlayClock() {
    const v = videoEl();
    if (!v || !isFinite(v.duration) || v.duration < 0.5) return "";
    const t = v.currentTime;
    const now = performance.now();
    const adjDur = adjDuration();
    const rate = clockRate();
    const clockKey = [
      Math.round(rate * 1000),
      trimOn() ? 1 : 0,
      QT.cues.length,
    ].join("|");
    const transformChanged = QT._clockKey !== clockKey;
    const jumped = QT._mediaT != null && Math.abs(t - QT._mediaT) > 1.25;
    if (QT._dispCur == null || jumped || transformChanged) {
      QT._dispCur = watchSecs(0, t);
      QT._clockWall = now;
    } else if (!v.paused && !v.ended) {
      const dt = (now - (QT._clockWall || now)) / 1000;
      QT._clockWall = now;
      if (dt > 0 && dt < 2) QT._dispCur += dt;
    } else {
      QT._clockWall = now;
    }
    QT._clockKey = clockKey;
    QT._mediaT = t;
    if (adjDur > 0) QT._dispCur = Math.min(QT._dispCur, adjDur);
    if (QT._dispCur < 0) QT._dispCur = 0;
    const fmt = CLK ? CLK.formatClock : formatClock;
    const showOrig = Math.abs(adjDur - v.duration) >= 1.5;
    return (
      fmt(QT._dispCur) +
      " / " +
      fmt(adjDur) +
      (showOrig ? dimOrig(fmt(v.duration)) : "")
    );
  }

  const NATIVE_TIME_STYLE_PROPS = [
    "display",
    "width",
    "min-width",
    "max-width",
    "overflow",
    "opacity",
    "pointer-events",
  ];

  function rememberNativeTimeBits(el) {
    if (!el || el.__qtNativeTimeState) return;
    el.__qtNativeTimeState = {
      styles: NATIVE_TIME_STYLE_PROPS.map((prop) => [
        prop,
        el.style.getPropertyValue(prop),
        el.style.getPropertyPriority(prop),
      ]),
      hadAriaHidden: el.hasAttribute("aria-hidden"),
      ariaHidden: el.getAttribute("aria-hidden"),
    };
  }

  function restoreNativeTimeBits(left) {
    if (!left) return;
    left
      .querySelectorAll(
        ".ytp-time-display, .ytp-time-wrapper, .ytp-time-contents, .ytp-time-current, .ytp-time-duration, .ytp-time-separator, .qt-time-native-hide",
      )
      .forEach((el) => {
        if (el.id === "qt-time-pill" || el.closest("#qt-time-pill")) return;
        const saved = el.__qtNativeTimeState;
        el.classList.remove("qt-time-native-hide");
        if (!saved) return;
        saved.styles.forEach(([prop, value, priority]) => {
          if (value) el.style.setProperty(prop, value, priority);
          else el.style.removeProperty(prop);
        });
        if (saved.hadAriaHidden) el.setAttribute("aria-hidden", saved.ariaHidden);
        else el.removeAttribute("aria-hidden");
        delete el.__qtNativeTimeState;
      });
  }

  function setMiniplayerTimeMode(on) {
    document.documentElement.classList.toggle("qt-miniplayer-active", !!on);
    const pill = document.getElementById("qt-time-pill");
    if (!on) {
      if (pill && pill.__qtMiniplayerHidden) {
        pill.style.removeProperty("display");
        delete pill.__qtMiniplayerHidden;
      }
      return;
    }
    if (pill && !pill.__qtMiniplayerHidden) {
      pill.style.setProperty("display", "none", "important");
      pill.__qtMiniplayerHidden = true;
    }
    const left = document.querySelector("#movie_player .ytp-left-controls");
    restoreNativeTimeBits(left);
  }

  function hideNativeTimeBits(left) {
    const kill = (el) => {
      if (!el || el.id === "qt-time-pill" || el.closest("#qt-time-pill")) return;
      rememberNativeTimeBits(el);
      if (!el.classList.contains("qt-time-native-hide"))
        el.classList.add("qt-time-native-hide");
      const styles = {
        display: "none",
        width: "0",
        "min-width": "0",
        "max-width": "0",
        overflow: "hidden",
        opacity: "0",
        "pointer-events": "none",
      };
      Object.entries(styles).forEach(([property, value]) => {
        if (
          el.style.getPropertyValue(property) !== value ||
          el.style.getPropertyPriority(property) !== "important"
        )
          el.style.setProperty(property, value, "important");
      });
      if (el.getAttribute("aria-hidden") !== "true")
        el.setAttribute("aria-hidden", "true");
    };
    const targets = new Set();
    left
      .querySelectorAll(
        ".ytp-time-display, .ytp-time-wrapper, .ytp-time-contents, .ytp-time-current, .ytp-time-duration, .ytp-time-separator",
      )
      .forEach((el) => {
        if (el.id === "qt-time-pill" || el.closest("#qt-time-pill")) return;
        const wrap =
          el.closest(".ytp-time-wrapper, .ytp-time-display, .ytp-time-contents") ||
          el;
        targets.add(wrap);
        targets.add(el);
      });
    targets.forEach(kill);
  }

  function patchYtTime() {
    if (isShortsPage()) {
      const pill = document.getElementById("qt-time-pill");
      if (pill) pill.remove();
      return;
    }
    if (isMiniPlayer()) {
      setMiniplayerTimeMode(true);
      return;
    }
    setMiniplayerTimeMode(false);
    const v = videoEl();
    if (!v || !isFinite(v.duration) || v.duration < 0.5) return;
    const left = document.querySelector("#movie_player .ytp-left-controls");
    if (!left) return;
    hideNativeTimeBits(left);
    let pill = document.getElementById("qt-time-pill");
    if (!pill || !left.contains(pill)) {
      if (pill) pill.remove();
      pill = document.createElement("span");
      pill.id = "qt-time-pill";
      pill.className = "notranslate";
      const vol =
        left.querySelector(".ytp-volume-area, .ytp-volume-panel, .ytp-mute-button") ||
        left.querySelector(".ytp-button");
      if (vol && vol.parentNode === left) vol.after(pill);
      else left.appendChild(pill);
    }
    const html = overlayClock();
    if (html && pill.innerHTML !== html) pill.innerHTML = html;
    pinTimePill(pill, left);
  }

  const NATIVE_PILL_SAMPLE_MS = 1800;
  const NATIVE_PILL_FALLBACK = Object.freeze({
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    backgroundImage: "none",
    borderRadius: "28px",
    borderTop: "0px none transparent",
    borderRight: "0px none transparent",
    borderBottom: "0px none transparent",
    borderLeft: "0px none transparent",
    boxShadow: "none",
    backdropFilter: "none",
    webkitBackdropFilter: "none",
    height: "40px",
  });
  const NATIVE_PILL_VARS = Object.freeze([
    ["--qt-native-pill-background-color", "backgroundColor"],
    ["--qt-native-pill-background-image", "backgroundImage"],
    ["--qt-native-pill-border-radius", "borderRadius"],
    ["--qt-native-pill-border-top", "borderTop"],
    ["--qt-native-pill-border-right", "borderRight"],
    ["--qt-native-pill-border-bottom", "borderBottom"],
    ["--qt-native-pill-border-left", "borderLeft"],
    ["--qt-native-pill-box-shadow", "boxShadow"],
    ["--qt-native-pill-backdrop-filter", "backdropFilter"],
    ["--qt-native-pill-webkit-backdrop-filter", "webkitBackdropFilter"],
    ["--qt-native-pill-height", "height"],
  ]);
  /* The popup surface is owned by YouTube and changes across player skins.
     Sample only on a menu interaction, then expose an allowlisted paint skin
     through inherited variables. Never copy visibility/opacity/geometry from
     the native popup: its closed state would hide or move our menu. */
  const NATIVE_MENU_SAMPLE_MS = 1800;
  const NATIVE_MENU_VARS = Object.freeze([
    ["--qt-native-menu-background-color", "backgroundColor"],
    ["--qt-native-menu-background-image", "backgroundImage"],
    ["--qt-native-menu-background-blend-mode", "backgroundBlendMode"],
    ["--qt-native-menu-border-radius", "borderRadius"],
    ["--qt-native-menu-border-top", "borderTop"],
    ["--qt-native-menu-border-right", "borderRight"],
    ["--qt-native-menu-border-bottom", "borderBottom"],
    ["--qt-native-menu-border-left", "borderLeft"],
    ["--qt-native-menu-box-shadow", "boxShadow"],
    ["--qt-native-menu-backdrop-filter", "backdropFilter"],
    ["--qt-native-menu-webkit-backdrop-filter", "webkitBackdropFilter"],
    ["--qt-native-menu-text-shadow", "textShadow"],
  ]);
  let nativePillPlayer = null;
  let nativePillSource = null;
  let nativePillSkin = NATIVE_PILL_FALLBACK;
  let nativePillSignature = "";
  let nativePillNextSampleAt = 0;
  let nativeMenuPlayer = null;
  let nativeMenuSkin = null;
  let nativeMenuNextSampleAt = 0;

  function nativePillNow() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function shortsChromeForPlayer(player) {
    if (!player || !isShortsPage()) return null;
    const reel = player.closest && player.closest("ytd-reel-video-renderer");
    if (!reel) return null;
    /* Shorts currently ships both the legacy Polymer host and a COW
       view-model host. Keep this lookup bounded to the active reel: the
       document-level More menu also contains controls whose geometry must
       never become the player lane. */
    const controls = reel.querySelector(
      "ytd-shorts-player-controls, " +
        "ytd-shorts-player-controls-cow.ytdShortsPlayerControlsHost",
    );
    const left =
      controls &&
      controls.querySelector(
        "#left-controls, .ytdShortsPlayerControlsLeftControls",
      );
    const right =
      controls &&
      controls.querySelector(
        "#right-controls, .ytdShortsPlayerControlsRightControls",
      );
    if (!controls || !left || !right) return null;
    return {
      reel,
      controls,
      left,
      right,
      volume:
        controls.querySelector(
          "volume-controls, .ytdVolumeControlsVolumeControlsContainer",
        ) || left,
    };
  }

  function effectiveOpacityThrough(el, boundary) {
    if (!el) return 0;
    let opacity = 1;
    let node = el;
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.contentVisibility === "hidden"
      )
        return 0;
      const own = Number(style.opacity);
      if (Number.isFinite(own)) opacity *= own;
      if (node === boundary) break;
      node = node.parentElement;
    }
    return clamp(opacity, 0, 1);
  }

  function nativePillPaintSource(player) {
    if (!player || !player.querySelector) return null;
    const shortsChrome = shortsChromeForPlayer(player);
    const candidates = [
      shortsChrome && shortsChrome.right,
      shortsChrome &&
        shortsChrome.controls.querySelector(".ytdVolumeControlsBackgroundScrim"),
      player.querySelector(".ytp-left-controls .ytp-volume-area"),
      player.querySelector(".ytp-chapter-title"),
    ];
    return (
      candidates.find((source) => {
        if (!source || !source.isConnected) return false;
        const style = getComputedStyle(source);
        if (style.backgroundImage && style.backgroundImage !== "none") return true;
        const color = String(style.backgroundColor || "");
        const values = color.match(/[\d.]+/g) || [];
        const alpha =
          color.startsWith("rgba") || color.includes("/")
            ? Number(values[values.length - 1])
            : 1;
        return color !== "transparent" && alpha > 0;
      }) || null
    );
  }

  function readNativePillSkin(source) {
    if (!source || !source.isConnected) return NATIVE_PILL_FALLBACK;
    const style = getComputedStyle(source);
    const height = parseFloat(style.height);
    return {
      backgroundColor:
        style.backgroundColor || NATIVE_PILL_FALLBACK.backgroundColor,
      backgroundImage:
        style.backgroundImage || NATIVE_PILL_FALLBACK.backgroundImage,
      borderRadius: style.borderRadius || NATIVE_PILL_FALLBACK.borderRadius,
      borderTop: style.borderTop || NATIVE_PILL_FALLBACK.borderTop,
      borderRight: style.borderRight || NATIVE_PILL_FALLBACK.borderRight,
      borderBottom: style.borderBottom || NATIVE_PILL_FALLBACK.borderBottom,
      borderLeft: style.borderLeft || NATIVE_PILL_FALLBACK.borderLeft,
      boxShadow: style.boxShadow || NATIVE_PILL_FALLBACK.boxShadow,
      backdropFilter:
        style.getPropertyValue("backdrop-filter") ||
        style.backdropFilter ||
        NATIVE_PILL_FALLBACK.backdropFilter,
      webkitBackdropFilter:
        style.getPropertyValue("-webkit-backdrop-filter") ||
        style.webkitBackdropFilter ||
        style.backdropFilter ||
        NATIVE_PILL_FALLBACK.webkitBackdropFilter,
      height:
        Number.isFinite(height) && height >= 24 && height <= 88
          ? style.height
          : NATIVE_PILL_FALLBACK.height,
    };
  }

  function pillSkinSignature(skin) {
    return NATIVE_PILL_VARS.map(([, key]) => skin[key]).join("\u001f");
  }

  function applyNativePillSkin(target) {
    if (!target || target.__qtNativePillSignature === nativePillSignature) return;
    NATIVE_PILL_VARS.forEach(([name, key]) => {
      const value = nativePillSkin[key];
      if (target.style.getPropertyValue(name) !== value)
        target.style.setProperty(name, value);
    });
    target.__qtNativePillSignature = nativePillSignature;
  }

  function syncNativePillSkin(player, force) {
    if (!player) return;
    const now = nativePillNow();
    if (
      force ||
      player !== nativePillPlayer ||
      now >= nativePillNextSampleAt
    ) {
      const source = nativePillPaintSource(player);
      const skin = readNativePillSkin(source);
      const signature = pillSkinSignature(skin);
      nativePillPlayer = player;
      nativePillSource = source;
      nativePillNextSampleAt = now + NATIVE_PILL_SAMPLE_MS;
      if (signature !== nativePillSignature) {
        nativePillSkin = skin;
        nativePillSignature = signature;
      }
    }
    applyNativePillSkin(player.querySelector("#qt-cluster .qt-chrome-cluster"));
    applyNativePillSkin(player.querySelector("#qt-time-pill"));
  }

  function nativeMenuIsRendered(menu) {
    if (!menu || !menu.isConnected || menu.hidden) return false;
    if (menu.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(menu);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (!menu.getClientRects().length) return false;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
    const viewportHeight = Number(window.innerHeight) || Number.POSITIVE_INFINITY;
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < viewportWidth &&
      rect.top < viewportHeight
    );
  }

  /* Shorts has no .ytp-settings-menu anywhere. Its native surface is a
     document-level <yt-sheet-view-model>, and it is a different, less
     transparent paint than the watch menu. Without this, the lookup below
     finds nothing on a Short, nativeMenuSkin stays null, and our menu wears
     the watch-shaped default from styles.css against a sheet that does not
     match it.

     Scoped deliberately: only on a Short, only a sheet that is actually
     rendered, and never our own menu. If no sheet is open we return null and
     the existing "keep the last valid paint" logic applies, exactly as it does
     when the watch popup is dismissed. */
  function shortsSheetPaintSource() {
    if (!isShortsPage()) return null;
    const sheets = Array.from(
      document.querySelectorAll("yt-sheet-view-model, tp-yt-paper-dialog[opened]"),
    ).filter((sheet) => sheet.id !== "qt-speed-menu" && !sheet.closest("#qt-speed-menu"));
    return sheets.find(nativeMenuIsRendered) || null;
  }

  function nativeSettingsMenuForPlayer(player, includeHidden) {
    if (!player || !player.querySelectorAll) return null;
    const menus = Array.from(
      player.querySelectorAll(".ytp-popup.ytp-settings-menu, .ytp-settings-menu"),
    ).filter((menu) => menu.id !== "qt-speed-menu");
    const rendered = menus.find(nativeMenuIsRendered);
    if (rendered || includeHidden === false) return rendered || null;
    return menus[menus.length - 1] || null;
  }

  function paintHasSurface(style, pseudo) {
    if (!style) return false;
    const opacity = Number(style.opacity);
    if (
      pseudo &&
      (style.display === "none" ||
        style.visibility === "hidden" ||
        (Number.isFinite(opacity) && opacity < 0.999))
    )
      return false;
    if (
      pseudo &&
      (!style.content || style.content === "none" || style.content === "normal")
    )
      return false;
    if (style.backgroundImage && style.backgroundImage !== "none") return true;
    const color = String(style.backgroundColor || "").trim().toLowerCase();
    if (!color || color === "transparent") return false;
    const values = color.match(/[\d.]+/g) || [];
    if (color.startsWith("rgba") && values.length >= 4)
      return Number(values[values.length - 1]) > 0;
    if (color.includes("/") && values.length)
      return Number(values[values.length - 1]) > 0;
    return true;
  }

  function nativeMenuPaintSource(menu) {
    if (!menu || !menu.isConnected) return null;
    const panel = menu.querySelector(".ytp-panel");
    const panelMenu = menu.querySelector(".ytp-panel-menu");
    const candidates = [
      [menu, ""],
      [menu, "::before"],
      [menu, "::after"],
      [panel, ""],
      [panelMenu, ""],
    ];
    for (const [node, pseudo] of candidates) {
      if (!node || !node.isConnected) continue;
      const style = getComputedStyle(node, pseudo || null);
      if (paintHasSurface(style, pseudo)) return { menu, style };
    }
    return null;
  }

  function nativeMenuValue(primary, fallback, key, defaultValue) {
    const value = primary && String(primary[key] || "").trim();
    if (value && value !== "none") return value;
    const fallbackValue = fallback && String(fallback[key] || "").trim();
    return fallbackValue || value || defaultValue;
  }

  function nativeMenuRadius(rootStyle, paintStyle) {
    const rootRadius = String(rootStyle.borderRadius || "").trim();
    const rootNumbers = rootRadius.match(/[\d.]+/g) || [];
    if (rootRadius && rootNumbers.some((value) => Number(value) > 0))
      return rootRadius;
    return paintStyle.borderRadius || rootRadius || "12px";
  }

  function nativeMenuBorder(rootStyle, paintStyle, key) {
    const rootBorder = String(rootStyle[key] || "").trim();
    if (rootBorder && !/^(?:0(?:\.0+)?px\s+)?none\b/.test(rootBorder))
      return rootBorder;
    return paintStyle[key] || rootBorder || "0px none transparent";
  }

  function readNativeMenuSkin(source) {
    if (!source) return null;
    const rootStyle = getComputedStyle(source.menu);
    const paintStyle = source.style;
    return {
      backgroundColor: paintStyle.backgroundColor,
      backgroundImage: paintStyle.backgroundImage || "none",
      backgroundBlendMode: paintStyle.backgroundBlendMode || "normal",
      borderRadius: nativeMenuRadius(rootStyle, paintStyle),
      borderTop: nativeMenuBorder(rootStyle, paintStyle, "borderTop"),
      borderRight: nativeMenuBorder(rootStyle, paintStyle, "borderRight"),
      borderBottom: nativeMenuBorder(rootStyle, paintStyle, "borderBottom"),
      borderLeft: nativeMenuBorder(rootStyle, paintStyle, "borderLeft"),
      boxShadow: nativeMenuValue(rootStyle, paintStyle, "boxShadow", "none"),
      backdropFilter: nativeMenuValue(
        paintStyle,
        rootStyle,
        "backdropFilter",
        "none",
      ),
      webkitBackdropFilter: nativeMenuValue(
        paintStyle,
        rootStyle,
        "webkitBackdropFilter",
        nativeMenuValue(paintStyle, rootStyle, "backdropFilter", "none"),
      ),
      textShadow: nativeMenuValue(rootStyle, paintStyle, "textShadow", "none"),
    };
  }

  function applyNativeMenuSkin(player, skin) {
    if (!player) return;
    const signature = skin
      ? NATIVE_MENU_VARS.map(([, key]) => skin[key]).join("\u001f")
      : "";
    const valuesStillApplied = NATIVE_MENU_VARS.every(([name, key]) => {
      const expected = (skin && skin[key]) || "";
      return player.style.getPropertyValue(name) === expected;
    });
    if (player.__qtNativeMenuSignature === signature && valuesStillApplied) return;
    NATIVE_MENU_VARS.forEach(([name, key]) => {
      const value = skin && skin[key];
      if (value) {
        if (player.style.getPropertyValue(name) !== value)
          player.style.setProperty(name, value);
      } else if (player.style.getPropertyValue(name)) {
        player.style.removeProperty(name);
      }
    });
    player.__qtNativeMenuSignature = signature;
  }

  function syncNativeMenuSkin(player, force) {
    if (!player) return;
    const now = nativePillNow();
    if (!force && player === nativeMenuPlayer && now < nativeMenuNextSampleAt) {
      applyNativeMenuSkin(player, nativeMenuSkin);
      return;
    }
    const playerChanged = player !== nativeMenuPlayer;
    /* On Shorts the paint source is the sheet, not a settings menu — see
       shortsSheetPaintSource. Kept to this one call site on purpose: the other
       caller of nativeSettingsMenuForPlayer is ytSettingsOpen(), and a sheet
       must not count as "the native settings menu is open" or the no-stacking
       rule in SPEC §3 suppresses our own menu instead of YouTube's. */
    const menu =
      shortsSheetPaintSource() ||
      nativeSettingsMenuForPlayer(player, playerChanged || !nativeMenuSkin);
    const skin = readNativeMenuSkin(nativeMenuPaintSource(menu));
    nativeMenuPlayer = player;
    nativeMenuNextSampleAt = now + NATIVE_MENU_SAMPLE_MS;
    /* Closing the native popup may remove it from DOM. Keep the last valid
       paint on the same player instead of replacing it with a guessed skin;
       a new/invalidated player falls back to the live YouTube CSS tokens. */
    if (skin) nativeMenuSkin = skin;
    else if (playerChanged) nativeMenuSkin = null;
    if (skin || playerChanged) applyNativeMenuSkin(player, nativeMenuSkin);
  }

  function nativeChromeGap(left) {
    const play = left.querySelector(".ytp-play-button");
    const vol =
      left.querySelector(".ytp-volume-area, .ytp-mute-button") ||
      left.querySelector(".ytp-button");
    if (play && vol && play !== vol) {
      const g = Math.round(vol.getBoundingClientRect().left - play.getBoundingClientRect().right);
      if (g >= 2 && g <= 24) return g;
    }
    return 8;
  }

  function pinTimePill(pill, left) {
    if (!pill || !left) return;
    syncNativePillSkin(playerEl());
    const now = nativePillNow();
    if (pill.__qtGapLeft !== left || now >= (pill.__qtGapNextAt || 0)) {
      const gap = nativeChromeGap(left) + "px";
      pill.__qtGapLeft = left;
      pill.__qtGapNextAt = now + NATIVE_PILL_SAMPLE_MS;
      if (pill.style.getPropertyValue("--qt-time-pill-gap") !== gap)
        pill.style.setProperty("--qt-time-pill-gap", gap);
    }
  }

  function persistUserRate(rate) {
    const r = clamp(Number(rate) || 1, RATE_MIN, RATE_MAX);
    QT._userRate = r;
    if (!lockOn()) QT.state.playbackRate = r;
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set({ qt_playbackRate: r });
    else chrome.storage.sync.set({ qt_playbackRate: r });
  }

  function persistPaceLockPreference(on) {
    QT.state.paceLock = !!on;
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set({ qt_paceLock: !!on });
    else chrome.storage.sync.set({ qt_paceLock: !!on });
  }

  function persistFixed1xPreference(on) {
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set({ qt_fixed1x: !!on });
    else chrome.storage.sync.set({ qt_fixed1x: !!on });
  }

  function setFixed1x(on, options) {
    const opts = options || {};
    const next = !!on;
    const v = videoEl();
    if (next) {
      if (!QT._hold1x) {
        let from = QT._userRate || 1;
        if (lockOn()) {
          const live = liveLockRate();
          if (live != null) from = live;
        }
        QT._hold1xFrom = from;
      }
      QT._hold1x = true;
      QT._trimBoost = false;
      QT._want = 1;
      QT.state.playbackRate = 1;
      QT._applyUserRate = false;
      QT._rateAppliedTo = v || null;
      if (v) setRate(v, 1);
    } else {
      const wasFixed = QT._hold1x;
      QT._hold1x = false;
      QT._trimBoost = false;
      QT._durKey = "";
      if (wasFixed && opts.restore !== false && v) {
        const live = lockOn() ? liveLockRate() : null;
        const back = live != null ? live : QT._userRate || 1;
        setRate(v, back);
      } else if (!lockOn()) {
        QT._want = QT._userRate;
        QT.state.playbackRate = QT._userRate;
        QT._applyUserRate = opts.restore !== false;
      }
    }
    if (opts.persist !== false) persistFixed1xPreference(next);
    if (opts.render !== false) {
      renderMenu();
      renderCluster();
    }
  }

  function adActive(v) {
    const player =
      (v && v.closest && v.closest("#movie_player, .html5-video-player")) ||
      playerEl();
    return !!(
      player &&
      (player.classList.contains("ad-showing") ||
        player.classList.contains("ad-interrupting"))
    );
  }

  /* A multiplier control is explicit manual-speed intent. Merely toggling A
     in and out remains lossless, but editing the 1x body must leave the
     fixed hold or tick()/ratechange will keep forcing 1x. If the saved
     profile had Pace Lock armed, a fixed multiplier and that Lock are
     contradictory, so the edit switches to manual mode. Range previews can
     defer persistence until change/pointerup so pointercancel stays lossless. */
  function leaveNeutralForManualRateEdit(opts) {
    if (!QT._hold1x) return false;
    setFixed1x(false, {
      persist: !opts || opts.persist !== false,
      restore: false,
      render: false,
    });
    QT._applyUserRate = false;
    if (QT.state.paceLock) {
      QT.state.paceLock = false;
      if (!opts || opts.persist !== false) persistPaceLockPreference(false);
    }
    return true;
  }

  function setRate(v, rate, opts) {
    const r = clamp(rate, 0.25, 16);
    const user = !!(opts && opts.user);
    if (user && r <= RATE_MAX + 0.05) {
      QT._userRate = r;
      if (!opts || opts.persist !== false) persistUserRate(r);
    }
    QT._want = r;
    QT.state.playbackRate = r;
    QT._durKey = "";
    if (adActive(v)) {
      QT._applyUserRate = true;
      QT._rateAppliedTo = null;
      return;
    }
    if (Math.abs(v.playbackRate - r) < 0.04) return;
    QT._writing = true;
    try {
      v.playbackRate = r;
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      QT._writing = false;
    }, 80);
  }

  function bindFightback(v) {
    if (v.__qtBound) return;
    v.__qtBound = true;
    v.addEventListener("timeupdate", () => {
      patchYtTime();
    });
    v.addEventListener("seeked", () => {
      QT._dispCur = null;
      patchYtTime();
    });
    v.addEventListener("ratechange", () => {
      if (QT._writing) {
        /* A synchronous ratechange at the value we just wrote is our own
           acknowledgement. YouTube can then reset the player again before
           this short write guard expires (ad/quality/player hand-off). Do not
           mistake that different value for our acknowledgement: reopen the
           normal reconciliation path so the saved profile is retried on the
           next bounded tick. */
        const expected = Number(QT._want);
        if (
          !adActive(v) &&
          Number.isFinite(expected) &&
          Math.abs((v.playbackRate || 1) - expected) > 0.08
        ) {
          QT._applyUserRate = true;
          QT._rateAppliedTo = null;
        }
        return;
      }
      if (adActive(v)) {
        QT._trimBoost = false;
        QT._applyUserRate = true;
        QT._rateAppliedTo = null;
        return;
      }
      if (QT._hold1x) {
        if (Math.abs(v.playbackRate - 1) > 0.08) setRate(v, 1);
        return;
      }
      if (QT._trimBoost) return;
      if (QT._want > LOCK_MAX + 0.02) return;
      if (lockOn() && Math.abs(v.playbackRate - QT._want) > 0.08) {
        setRate(v, QT._want);
      } else if (!lockOn()) {
        /* YouTube resets playbackRate during ads/player replacement. Only
           explicit Toolkit inputs are user intent; restore the saved rate. */
        const wanted = clamp(Number(QT._userRate) || 1, RATE_MIN, RATE_MAX);
        if (Math.abs(v.playbackRate - wanted) > 0.08) setRate(v, wanted);
      }
    });
  }

  function isEndscreen() {
    const p = playerEl();
    const v = videoEl();
    if (v && v.ended) return true;
    if (p && (p.classList.contains("ended-mode") || p.classList.contains("ytp-offline-slate")))
      return true;
    const es = document.querySelector(".html5-endscreen");
    if (es) {
      const st = getComputedStyle(es);
      if (st.display !== "none" && st.visibility !== "hidden" && es.offsetHeight > 40)
        return true;
    }
    return false;
  }

  function isMiniPlayer() {
    const p = playerEl();
    if (
      p &&
      (p.classList.contains("ytp-miniplayer-mode") ||
        p.classList.contains("ytp-player-minimized") ||
        p.closest("ytd-miniplayer"))
    )
      return true;
    const mini = document.querySelector("ytd-miniplayer");
    if (mini && (mini.hasAttribute("active") || mini.hasAttribute("enabled"))) {
      const st = getComputedStyle(mini);
      if (st.display !== "none" && st.visibility !== "hidden" && mini.offsetWidth > 80)
        return true;
    }
    const app = document.querySelector("ytd-app");
    if (
      app &&
      (app.hasAttribute("miniplayer-is-active") || app.hasAttribute("miniplayer-active_"))
    )
      return true;
    return false;
  }

  function overlayOff() {
    return isEndscreen() || isMiniPlayer();
  }

  function ytSettingsOpen(player) {
    return nativeMenuIsRendered(
      nativeSettingsMenuForPlayer(player || playerEl(), false),
    );
  }

  function closeYtSettings(player) {
    const activePlayer = player || playerEl();
    if (!ytSettingsOpen(activePlayer)) return;
    const btn = activePlayer && activePlayer.querySelector(".ytp-settings-button");
    if (btn) btn.click();
  }

  function closeOurs() {
    /* Closing/removing the range is a cancellation boundary. A preview that
       never reached change must not survive invisibly as the manual rate. */
    cancelMenuDrag();
    QT._menuOpening = false;
    QT._menuOpen = false;
    shortsLaneCache = null;
    const menu = document.getElementById("qt-speed-menu");
    if (menu) menu.hidden = true;
    const btn = document.querySelector("#qt-cluster .qt-chrome-btn");
    if (btn) btn.classList.remove("is-on");
  }

  function openOursWhenNativeCloses(btn, attempt) {
    if (!QT._menuOpening) return;
    const n = attempt || 0;
    const player = playerEl();
    if (n === 0) syncNativeMenuSkin(player);
    if (ytSettingsOpen(player)) {
      if (n === 0) closeYtSettings(player);
      if (n < 24) {
        setTimeout(() => openOursWhenNativeCloses(btn, n + 1), 40);
      } else {
        QT._menuOpening = false;
      }
      return;
    }
    QT._menuOpening = false;
    QT._menuOpen = true;
    shortsLaneCache = null;
    const menu = document.getElementById("qt-speed-menu");
    if (menu) menu.hidden = false;
    btn.classList.add("is-on");
    btn.blur();
    renderCluster();
  }

  function tick(paintUi) {
    const shouldPaint = paintUi !== false;
    const v = videoEl();
    if (!v) return;
    const mini = isMiniPlayer();
    setMiniplayerTimeMode(mini);
    if (isEndscreen() || mini) {
      closeOurs();
      const wrap = document.getElementById("qt-cluster");
      if (wrap) wrap.classList.add("qt-hidden");
      return;
    }
    bindFightback(v);
    if (adActive(v)) {
      QT._trimBoost = false;
      QT._applyUserRate = true;
      QT._rateAppliedTo = null;
      if (shouldPaint) {
        renderCluster();
        patchYtTime();
      }
      return;
    }
    if (
      (QT._applyUserRate || QT._rateAppliedTo !== v) &&
      !lockOn() &&
      !QT._trimBoost &&
      !QT._hold1x
    ) {
      QT._applyUserRate = false;
      QT._rateAppliedTo = v;
      setRate(v, QT._userRate);
    }
    if (QT._hold1x) {
      if (Math.abs((v.playbackRate || 1) - 1) > 0.08) setRate(v, 1);
      if (shouldPaint) {
        renderCluster();
        patchYtTime();
      }
      return;
    }
    const t = v.currentTime;
    const words = timedWords();
    const boost =
      !v.paused && trimOn() && words.length && WPM
        ? WPM.trimBoost(words, t, v.duration)
        : 0;
    if (boost) {
      QT._trimBoost = true;
      if (Math.abs(v.playbackRate - boost) > 0.12) setRate(v, boost);
    } else {
      /* Speech resumed (or never paused): snap off trim in THIS tick. */
      if (QT._trimBoost || v.playbackRate > LOCK_MAX + 0.02) {
        /* Compute while _trimBoost is still true: without Lock, clockRate()
           deliberately returns the saved manual speed instead of the live
           4x/8x transport rate. Clearing first would "restore" the boost. */
        const recoveryRate = stableRate();
        QT._trimBoost = false;
        setRate(v, recoveryRate);
      }
      if (!v.paused && lockOn() && !inSilence(t)) {
        const w = localWpm(t) || QT._speechWpm || baseWpm();
        const want = WPM
          ? WPM.lockRate(QT.state.targetWpm, w)
          : null;
        if (want != null) {
          const cur = v.playbackRate || 1;
          if (cur > LOCK_MAX || Math.abs(cur - want) > 0.12) setRate(v, want);
          else {
            const step = Math.max(-0.12, Math.min(0.12, want - cur));
            if (Math.abs(step) >= 0.03) setRate(v, cur + step);
          }
        }
      }
    }
    if (shouldPaint) {
      renderCluster();
      patchYtTime();
    }
  }

  const SHORTS_LANE_GAP = 4;
  const SHORTS_MIN_CONTROL_WIDTH = 48;
  const SHORTS_LAYOUT_SAMPLE_MS = 120;
  const SHORTS_VOLUME_WIDTH_RATIO = 1.65;
  const SHORTS_LEFT_WIDTH_RATIO = 3;
  let shortsLaneCache = null;

  function setImportantStyle(el, property, value) {
    if (!el) return;
    if (
      el.style.getPropertyValue(property) === value &&
      el.style.getPropertyPriority(property) === "important"
    )
      return;
    el.style.setProperty(property, value, "important");
  }

  function clearShortsClusterLayout(wrap) {
    if (!wrap || !wrap.__qtShortsLayout) return;
    [
      "top",
      "left",
      "right",
      "width",
      "height",
      "max-height",
      "opacity",
      "transition",
    ].forEach((property) => wrap.style.removeProperty(property));
    wrap.classList.remove(
      "qt-short-lane",
      "qt-short-lane-compact",
      "qt-short-lane-tight",
    );
    delete wrap.__qtShortsLayout;
  }

  function unresolvedShortsLayout(wrap, player, now) {
    clearShortsClusterLayout(wrap);
    shortsLaneCache = {
      wrap,
      player,
      nextAt: now + SHORTS_LAYOUT_SAMPLE_MS,
      layout: {
        resolved: false,
        usable: false,
        visible: false,
        laneWidth: 0,
        nativeOpacity: 0,
      },
    };
    return shortsLaneCache.layout;
  }

  function pinShortsClusterLane(wrap, player) {
    const now = nativePillNow();
    if (
      shortsLaneCache &&
      shortsLaneCache.wrap === wrap &&
      shortsLaneCache.player === player &&
      now < shortsLaneCache.nextAt
    )
      return shortsLaneCache.layout;
    const chrome = shortsChromeForPlayer(player);
    if (!chrome) return unresolvedShortsLayout(wrap, player, now);
    const playerRect = player.getBoundingClientRect();
    const leftRect = chrome.left.getBoundingClientRect();
    const rightRect = chrome.right.getBoundingClientRect();
    const volumeRect = chrome.volume.getBoundingClientRect();
    if (
      playerRect.width < 80 ||
      leftRect.width < 1 ||
      rightRect.width < 1 ||
      rightRect.left <= leftRect.left
    )
      return unresolvedShortsLayout(wrap, player, now);
    const scaleX =
      player.offsetWidth > 0 ? playerRect.width / player.offsetWidth : 1;
    const scaleY =
      player.offsetHeight > 0 ? playerRect.height / player.offsetHeight : 1;
    const safeScaleX = Number.isFinite(scaleX) && scaleX > 0.05 ? scaleX : 1;
    const safeScaleY = Number.isFinite(scaleY) && scaleY > 0.05 ? scaleY : 1;
    const top = clamp(
      (rightRect.top - playerRect.top) / safeScaleY,
      0,
      player.offsetHeight || playerRect.height,
    );
    const height = clamp(rightRect.height / safeScaleY, 24, 88);
    const volumeWidth = volumeRect.width / safeScaleX;
    const leftWidth = leftRect.width / safeScaleX;
    /* The live Shorts control measured 60 px collapsed and 168 px expanded
       beside a 48 px native pill. Drive icon-only mode from that native
       expansion itself, never from a fluctuating WPM string width. */
    const volumeExpanded =
      volumeWidth > height * SHORTS_VOLUME_WIDTH_RATIO ||
      leftWidth > height * SHORTS_LEFT_WIDTH_RATIO;
    const inner = wrap.querySelector(".qt-chrome-cluster");
    setImportantStyle(inner, "--qt-native-pill-height", height.toFixed(2) + "px");
    const minimumControlWidth = Math.max(SHORTS_MIN_CONTROL_WIDTH, height);
    const rawLaneWidth = Math.max(
      0,
      (rightRect.left - leftRect.right) / safeScaleX,
    );
    /* Preserve the normal 4 px breathing room, but let it contract evenly
       when that is the difference between a native-size 48 px circle and a
       malformed narrow capsule. We still never cross either native rect. */
    const laneGap = Math.max(
      0,
      Math.min(SHORTS_LANE_GAP, (rawLaneWidth - minimumControlWidth) / 2),
    );
    const laneLeft = clamp(
      (leftRect.right - playerRect.left) / safeScaleX + laneGap,
      0,
      player.offsetWidth || playerRect.width,
    );
    const laneRight = clamp(
      (rightRect.left - playerRect.left) / safeScaleX - laneGap,
      0,
      player.offsetWidth || playerRect.width,
    );
    const laneWidth = Math.max(0, laneRight - laneLeft);
    const nativeOpacity = effectiveOpacityThrough(chrome.controls, chrome.reel);
    const usableLane = laneWidth >= minimumControlWidth;
    const opacity = usableLane ? (QT._menuOpen ? 1 : nativeOpacity) : 0;

    setImportantStyle(wrap, "top", top.toFixed(2) + "px");
    setImportantStyle(wrap, "left", laneLeft.toFixed(2) + "px");
    setImportantStyle(wrap, "right", "auto");
    setImportantStyle(wrap, "width", laneWidth.toFixed(2) + "px");
    setImportantStyle(wrap, "height", height.toFixed(2) + "px");
    setImportantStyle(wrap, "max-height", height.toFixed(2) + "px");
    setImportantStyle(wrap, "opacity", opacity.toFixed(3));
    /* We sample the native transition from the existing rAF loop. Applying
       its current computed opacity directly prevents a second delayed fade. */
    setImportantStyle(wrap, "transition", "none");
    wrap.__qtShortsLayout = true;
    if (!wrap.classList.contains("qt-short-lane"))
      wrap.classList.add("qt-short-lane");
    if (wrap.classList.contains("qt-short-lane-compact"))
      wrap.classList.remove("qt-short-lane-compact");
    if (wrap.classList.contains("qt-short-lane-tight") !== volumeExpanded)
      wrap.classList.toggle("qt-short-lane-tight", volumeExpanded);
    const layout = {
      resolved: true,
      usable: usableLane,
      laneWidth,
      nativeOpacity,
      visible: opacity > 0.02 && usableLane,
      compact: false,
      tight: volumeExpanded,
      volumeExpanded,
    };
    shortsLaneCache = {
      wrap,
      player,
      nextAt: now + SHORTS_LAYOUT_SAMPLE_MS,
      layout,
    };
    return layout;
  }

  /* Watch uses a full-width centering bar. Shorts is host-coupled to the
     native lane outside #shorts-player and therefore returns live geometry. */
  function pinClusterBar(wrap) {
    if (!wrap) return null;
    const off = overlayOff();
    if (wrap.classList.contains("qt-overlay-off") !== off)
      wrap.classList.toggle("qt-overlay-off", off);
    if (off && !wrap.classList.contains("qt-hidden")) {
      wrap.classList.add("qt-hidden");
    }
    const inner = wrap.querySelector(".qt-chrome-cluster");
    if (inner && inner.style.getPropertyValue("pointer-events"))
      inner.style.removeProperty("pointer-events");
    const player = wrap.parentElement || playerEl();
    syncNativePillSkin(player);
    if (isShortsPage()) return pinShortsClusterLane(wrap, player);
    clearShortsClusterLayout(wrap);
    return null;
  }

  function pinMenu(menu) {
    if (!menu) return;
    if (overlayOff()) {
      menu.hidden = true;
      if (menu.__qtPinMode !== "off") {
        menu.style.cssText = "display:none !important;";
        menu.__qtPinMode = "off";
      }
      return;
    }
    if (menu.hidden && !QT._menuOpen) return;
    let top = 60;
    if (isShortsPage()) {
      const player = playerEl();
      const pill = player && player.querySelector("#qt-cluster .qt-chrome-cluster");
      if (player && pill) {
        const playerRect = player.getBoundingClientRect();
        const pillRect = pill.getBoundingClientRect();
        const scaleY =
          player.offsetHeight > 0 ? playerRect.height / player.offsetHeight : 1;
        const safeScaleY =
          Number.isFinite(scaleY) && scaleY > 0.05 ? scaleY : 1;
        top = Math.max(
          8,
          Math.round((pillRect.bottom - playerRect.top) / safeScaleY + 8),
        );
      }
    }
    const mode = "on:" + top;
    if (menu.__qtPinMode === mode) return;
    menu.style.cssText =
      "position:absolute !important;top:" +
      top +
      "px !important;left:50% !important;right:auto !important;" +
      "transform:translateX(-50%) !important;margin:0 !important;z-index:80 !important;" +
      "pointer-events:auto !important;";
    menu.__qtPinMode = mode;
  }

  function ensureUi() {
    const player = playerEl();
    if (!player) return;
    if (getComputedStyle(player).position === "static") player.style.position = "relative";
    if (!document.getElementById("qt-cluster")) {
      const wrap = document.createElement("div");
      wrap.id = "qt-cluster";
      wrap.className = "qt-cluster-wrap";
      wrap.innerHTML =
        '<div class="qt-chrome-cluster">' +
        '<span class="qt-cluster-label" aria-hidden="true">' +
        '<span class="qt-cluster-label-full">— WPM · 1x</span>' +
        '<span class="qt-cluster-label-compact">1x</span></span>' +
        '<div role="button" tabindex="0" class="qt-chrome-btn" aria-label="Playback speed">' +
        ICO.speed +
        "</div></div>";
      const btn = wrap.querySelector(".qt-chrome-btn");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (QT._menuOpen || QT._menuOpening) {
          closeOurs();
          return;
        }
        QT._menuOpening = true;
        openOursWhenNativeCloses(btn, 0);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          btn.click();
        }
      });
      player.appendChild(wrap);
    }
    if (!document.getElementById("qt-speed-menu")) {
      const menu = document.createElement("div");
      menu.id = "qt-speed-menu";
      menu.className = "qt-menu";
      menu.hidden = true;
      menu.addEventListener("click", (e) => e.stopPropagation());
      player.appendChild(menu);
      renderMenu();
    }
    const wrap = document.getElementById("qt-cluster");
    const menu = document.getElementById("qt-speed-menu");
    if (wrap && wrap.parentNode !== player) player.appendChild(wrap);
    if (menu && menu.parentNode !== player) player.appendChild(menu);
    const layout = pinClusterBar(wrap);
    if (
      isShortsPage() &&
      (!layout || !layout.resolved || !layout.visible) &&
      !QT._menuOpen
    ) {
      wrap.classList.add("qt-hidden");
      syncClusterInteractivity(wrap, true);
    }
    pinMenu(menu);
  }

  function lockTarget() {
    const n = Number(QT.state.targetWpm);
    return n >= TARGET_MIN && n <= TARGET_MAX ? n : 180;
  }

  function manualMenuRate() {
    if (QT._hold1x) return 1;
    return clamp(Number(QT._userRate) || 1, RATE_MIN, RATE_MAX);
  }

  function beginMenuDrag(kind) {
    cancelMenuDrag();
    const savedValue =
      kind === "rate"
        ? clamp(Number(QT._userRate) || 1, RATE_MIN, RATE_MAX)
        : lockTarget();
    menuDrag = {
      id: ++menuDragSeq,
      kind,
      savedValue,
      neutralWasOn: kind === "rate" && QT._hold1x,
      hold1xFrom: QT._hold1xFrom,
      paceLock: QT.state.paceLock,
    };
    QT._dragging = true;
    return menuDrag.id;
  }

  function finishMenuDrag(id, apply) {
    /* Keyboard-driven range changes have no pointer session. */
    if (!id) {
      apply();
      return true;
    }
    if (!menuDrag || menuDrag.id !== id) return false;
    menuDrag = null;
    QT._dragging = false;
    apply();
    return true;
  }

  function releaseMenuDrag(id, apply) {
    if (!menuDrag || menuDrag.id !== id) return;
    QT._dragging = false;
    /* Chromium emits change after pointerup. The zero-delay fallback handles
       a host/browser that omits change; finishMenuDrag makes the pair one
       persistence write rather than two. */
    setTimeout(() => finishMenuDrag(id, apply), 0);
  }

  function cancelMenuDrag(expectedId) {
    if (!menuDrag) {
      QT._dragging = false;
      return false;
    }
    if (expectedId && menuDrag.id !== expectedId) return false;
    const { kind, savedValue, neutralWasOn, hold1xFrom, paceLock } = menuDrag;
    menuDrag = null;
    QT._dragging = false;
    if (kind === "wpm") {
      QT.state.targetWpm = clamp(savedValue, TARGET_MIN, TARGET_MAX);
      QT._durKey = "";
      return true;
    }
    const rate = clamp(savedValue, RATE_MIN, RATE_MAX);
    QT._userRate = rate;
    if (neutralWasOn) {
      QT._hold1x = true;
      QT._hold1xFrom = hold1xFrom;
      QT.state.paceLock = paceLock;
      QT._trimBoost = false;
      QT._want = 1;
      QT.state.playbackRate = 1;
      QT._applyUserRate = false;
      const video = videoEl();
      if (video) setRate(video, 1);
      return true;
    }
    if (QT._hold1x) {
      QT._hold1xFrom = rate;
      return true;
    }
    if (!lockOn()) {
      QT._want = rate;
      QT.state.playbackRate = rate;
      QT._applyUserRate = true;
      const video = videoEl();
      if (video) setRate(video, rate);
    }
    return true;
  }

  function pillText(rateValue) {
    const v = videoEl();
    const rate = Number.isFinite(rateValue) ? rateValue : pillRate();
    if (isShortsPage())
      return lockOn() ? lockTarget() + " WPM" : formatRate(rate);
    /* No original-language ASR: nothing measured this speech. Printing "0"
       would read as a real measurement (SPEC 4: a real pause shows 0), and
       printing the Lock target would present the goal as an observation.
       Mark it unavailable and show only the manual speed. */
    if (!asrRhythm()) return "\u2014 WPM  ·  " + formatRate(rate);
    if (lockOn()) return lockTarget() + " WPM  ·  " + formatRate(rate);
    const media = localWpm(v ? v.currentTime : 0) || 0;
    const heard = WPM ? WPM.effectiveWpm(media, rate) : media * (rate || 1);
    return Math.round(heard) + " WPM  ·  " + formatRate(rate);
  }

  function syncOpenMenu() {
    const menu = document.getElementById("qt-speed-menu");
    if (!menu || menu.hidden || !QT._menuOpen) return;
    syncPaceToggleRows(menu);
    const locked = lockOn();
    const hasWpmBody = !!menu.querySelector("[data-act='wpm-range']");
    /* State can change while the popup stays connected (Lock click, ASR
       adoption/loss, neutral 1x). Never leave a WPM body under an effectively
       unlocked toggle, or a manual body under an active Lock. */
    if (hasWpmBody !== locked) {
      renderMenu();
      return;
    }
    const rateValue = locked ? pillRate() : manualMenuRate();
    const rate = formatRate(rateValue);
    const sub = menu.querySelector(".qt-menu-sub");
    if (locked) {
      const wpm = lockTarget();
      const subtitle = "travado em " + wpm + " WPM · player " + rate;
      if (sub && sub.textContent !== subtitle) sub.textContent = subtitle;
      const big = menu.querySelector("#qt-big");
      const bigHtml = wpm + " <span>WPM</span>";
      if (big && !QT._dragging && big.innerHTML !== bigHtml)
        big.innerHTML = bigHtml;
      const range = menu.querySelector("[data-act='wpm-range']");
      if (range) {
        if (range.min !== String(TARGET_MIN)) range.min = String(TARGET_MIN);
        if (range.max !== String(TARGET_MAX)) range.max = String(TARGET_MAX);
        if (!QT._dragging) range.value = String(wpm);
        const valueText = wpm + " WPM";
        if (range.getAttribute("aria-valuetext") !== valueText)
          range.setAttribute("aria-valuetext", valueText);
      }
      menu.querySelectorAll("[data-wpm]").forEach((b) => {
        b.classList.toggle("sel", Number(b.dataset.wpm) === wpm);
      });
    } else {
      if (sub && sub.textContent !== rate) sub.textContent = rate;
      const big = menu.querySelector("#qt-big");
      if (big && !QT._dragging && big.textContent !== rate) big.textContent = rate;
      const range = menu.querySelector("[data-act='rate-range']");
      if (range) {
        if (!QT._dragging && range.value !== String(rateValue))
          range.value = String(rateValue);
        if (range.getAttribute("aria-valuetext") !== rate)
          range.setAttribute("aria-valuetext", rate);
      }
      menu.querySelectorAll("[data-rate]").forEach((button) => {
        button.classList.toggle(
          "sel",
          Math.abs(Number(button.dataset.rate) - rateValue) < 0.02,
        );
      });
    }
  }

  function renderCluster() {
    const label = document.querySelector("#qt-cluster .qt-cluster-label");
    if (label) {
      const full = label.querySelector(".qt-cluster-label-full");
      const compact = label.querySelector(".qt-cluster-label-compact");
      const rate = pillRate();
      const fullText = pillText(rate);
      const compactText = formatRate(rate);
      if (full && full.textContent !== fullText) full.textContent = fullText;
      if (compact && compact.textContent !== compactText)
        compact.textContent = compactText;
    }
    syncOpenMenu();
    const player = playerEl();
    const wrap = document.getElementById("qt-cluster");
    const menu = document.getElementById("qt-speed-menu");
    if (!player || !wrap) return;
    const shortsLayout = pinClusterBar(wrap);
    if (menu) pinMenu(menu);
    if (overlayOff()) {
      wrap.classList.add("qt-hidden");
      syncClusterInteractivity(wrap, true);
      if (menu) menu.hidden = true;
      return;
    }
    const shortsHardHide =
      isShortsPage() &&
      (!shortsLayout || !shortsLayout.resolved || !shortsLayout.usable);
    if (shortsHardHide && QT._menuOpen) closeOurs();
    const hide = isShortsPage()
      ? shortsHardHide || (!shortsLayout.visible && !QT._menuOpen)
      : player.classList.contains("ytp-autohide") && !QT._menuOpen;
    wrap.classList.toggle("qt-hidden", hide);
    syncClusterInteractivity(wrap, hide);
    if (hide && menu) {
      menu.hidden = true;
      QT._menuOpen = false;
    }
    if (QT._menuOpen && ytSettingsOpen()) closeOurs();
  }

  function syncClusterInteractivity(wrap, hidden) {
    if (!wrap) return;
    const button = wrap.querySelector(".qt-chrome-btn");
    if (hidden) {
      if (wrap.getAttribute("aria-hidden") !== "true")
        wrap.setAttribute("aria-hidden", "true");
      if (!wrap.inert) wrap.inert = true;
      if (button && button.tabIndex !== -1) button.tabIndex = -1;
      return;
    }
    if (wrap.hasAttribute("aria-hidden")) wrap.removeAttribute("aria-hidden");
    if (wrap.inert) wrap.inert = false;
    if (button && button.tabIndex !== 0) button.tabIndex = 0;
  }

  const NO_ASR_HINT =
    "Needs the auto-generated caption in the video\u2019s original language. " +
    "This video has none yet \u2014 it turns back on by itself when one arrives.";
  const NEUTRAL_1X_HINT =
    "Neutral 1x mode is active. Choose a speed to start a new manual profile, or press A / Shift+` to restore the saved profile.";

  function syncPaceToggleRows(menu) {
    const disabledHint = !asrRhythm()
      ? NO_ASR_HINT
      : QT._hold1x
        ? NEUTRAL_1X_HINT
        : "";
    const disabled = !!disabledHint;
    menu.querySelectorAll("[data-toggle]").forEach((row) => {
      const key = row.getAttribute("data-toggle");
      const on = !!QT.state[key] && !disabled;
      const disabledText = String(disabled);
      if (row.getAttribute("aria-disabled") !== disabledText)
        row.setAttribute("aria-disabled", disabledText);
      if (disabled) {
        if (row.getAttribute("title") !== disabledHint)
          row.setAttribute("title", disabledHint);
      } else if (row.hasAttribute("title")) {
        row.removeAttribute("title");
      }
      if (row.classList.contains("qt-row-disabled") !== disabled)
        row.classList.toggle("qt-row-disabled", disabled);
      const toggle = row.querySelector(".qt-switch");
      if (!toggle) return;
      const checkedText = String(on);
      if (toggle.getAttribute("aria-checked") !== checkedText)
        toggle.setAttribute("aria-checked", checkedText);
      if (toggle.classList.contains("on") !== on)
        toggle.classList.toggle("on", on);
      if (toggle.classList.contains("qt-switch-disabled") !== disabled)
        toggle.classList.toggle("qt-switch-disabled", disabled);
    });
  }

  function toggleRow(id, label, ico, on, disabledHint) {
    const off = !!disabledHint;
    return (
      '<div class="qt-row' +
      (off ? " qt-row-disabled" : "") +
      '" data-toggle="' +
      id +
      '" aria-disabled="' +
      off +
      '"' +
      (off ? ' title="' + disabledHint + '"' : "") +
      '><span class="qt-row-ico">' +
      ico +
      '</span><span class="qt-row-label">' +
      label +
      '</span><div role="switch" aria-checked="' +
      (on && !off) +
      '" class="qt-switch' +
      (on && !off ? " on" : "") +
      (off ? " qt-switch-disabled" : "") +
      '"></div></div>'
    );
  }

  function renderMenu() {
    /* A rebuilt body invalidates the old range. Cancel its uncommitted preview
       before any ASR/navigation/storage transition can promote it to state. */
    cancelMenuDrag();
    const menu = document.getElementById("qt-speed-menu");
    if (!menu) return;
    const st = QT.state;
    /* Effective, not persisted. With no ASR source the Lock body would render
       a WPM slider that cannot drive anything, and — because the manual speed
       presets only exist in the unlocked body — would leave the user with no
       speed control at all while the native Playback speed row stays hidden. */
    const locked = lockOn();
    const rate = locked ? pillRate() : manualMenuRate();
    const wpm = lockTarget();
    let body = "";
    body +=
      '<div class="qt-menu-head">' +
      ICO.speed +
      "<span>" +
      (locked ? "Reading speed" : "Playback speed") +
      "</span></div>";
    body +=
      '<p class="qt-menu-sub">' +
      (locked
        ? "travado em " + wpm + " WPM · player " + formatRate(rate)
        : formatRate(rate)) +
      "</p><div class='qt-rule'></div>";
    if (locked) {
      body +=
        '<p class="qt-big" id="qt-big">' +
        wpm +
        ' <span>WPM</span></p>' +
        '<div class="qt-slider-row">' +
        '<button type="button" class="qt-circle" data-act="wpm-" aria-label="Decrease reading speed">−</button>' +
        '<input type="range" min="' +
        TARGET_MIN +
        '" max="' +
        TARGET_MAX +
        '" step="10" value="' +
        wpm +
        '" data-act="wpm-range" aria-label="Reading speed" aria-valuetext="' +
        wpm +
        ' WPM" />' +
        '<button type="button" class="qt-circle" data-act="wpm+" aria-label="Increase reading speed">+</button></div>' +
        '<div class="qt-pills">';
      for (const n of WPM_PRESETS) {
        body +=
          '<button type="button" class="qt-pill' +
          (wpm === n ? " sel" : "") +
          '" data-wpm="' +
          n +
          '" aria-label="' +
          n +
          ' WPM">' +
          n +
          "</button>";
      }
      body +=
        "</div><p class='qt-hint'>" +
        (wpm === 180 ? "Comfort" : "WPM") +
        "</p>";
    } else {
      body +=
        '<p class="qt-big" id="qt-big">' +
        formatRate(rate) +
        "</p>" +
        '<div class="qt-slider-row">' +
        '<button type="button" class="qt-circle" data-act="rate-" aria-label="Decrease playback speed">−</button>' +
        '<input type="range" min="' +
        RATE_MIN +
        '" max="' +
        RATE_MAX +
        '" step="0.05" value="' +
        clamp(rate, RATE_MIN, RATE_MAX) +
        '" data-act="rate-range" aria-label="Playback speed" aria-valuetext="' +
        formatRate(rate) +
        '" />' +
        '<button type="button" class="qt-circle" data-act="rate+" aria-label="Increase playback speed">+</button></div>' +
        '<div class="qt-pills">';
      for (const n of SPEED_PRESETS) {
        body +=
          '<button type="button" class="qt-pill' +
          (Math.abs(rate - n) < 0.02 ? " sel" : "") +
          '" data-rate="' +
          n +
          '" aria-label="' +
          formatRate(n) +
          '">' +
          formatRate(n) +
          "</button>";
      }
      body += "</div><p class='qt-hint'>Normal</p>";
    }
    body += "<div class='qt-rule'></div>";
    const noAsr = !asrRhythm();
    const neutral = !!QT._hold1x;
    const disabledHint = noAsr ? NO_ASR_HINT : neutral ? NEUTRAL_1X_HINT : "";
    body += toggleRow(
      "paceLock",
      "Pace lock",
      ICO.lock,
      st.paceLock && !neutral,
      disabledHint,
    );
    body += toggleRow(
      "trimSilence",
      "Trim silence",
      ICO.cut,
      st.trimSilence && !neutral,
      disabledHint,
    );
    menu.innerHTML = body;
    bindMenu(menu);
  }

  function bindMenu(menu) {
    const st = QT.state;
    menu.querySelectorAll("[data-toggle]").forEach((row) => {
      row.addEventListener("click", () => {
        /* Disabled rows keep the saved preference and change nothing. */
        if (row.getAttribute("aria-disabled") === "true") return;
        const key = row.getAttribute("data-toggle");
        save({ [key]: !st[key] });
      });
    });
    menu.querySelector("[data-act='wpm-']")?.addEventListener("click", () =>
      save({ targetWpm: clamp(st.targetWpm - WPM_STEP, TARGET_MIN, TARGET_MAX) }),
    );
    menu.querySelector("[data-act='wpm+']")?.addEventListener("click", () =>
      save({ targetWpm: clamp(st.targetWpm + WPM_STEP, TARGET_MIN, TARGET_MAX) }),
    );
    const wpmRange = menu.querySelector("[data-act='wpm-range']");
    if (wpmRange) {
      let dragId = 0;
      wpmRange.addEventListener("pointerdown", () => {
        dragId = beginMenuDrag("wpm");
      });
      wpmRange.addEventListener("input", (e) => {
        const n = Number(e.target.value);
        QT.state.targetWpm = n;
        e.target.setAttribute("aria-valuetext", n + " WPM");
        const big = menu.querySelector("#qt-big");
        if (big) big.innerHTML = n + ' <span>WPM</span>';
        renderCluster();
      });
      const commitValue = (value) => {
        save({ targetWpm: value }, false);
        menu.querySelectorAll("[data-wpm]").forEach((b) => {
          b.classList.toggle("sel", Number(b.dataset.wpm) === QT.state.targetWpm);
        });
      };
      wpmRange.addEventListener("change", (e) => {
        const id = dragId;
        dragId = 0;
        if (id < 0) return;
        const value = Number(e.target.value);
        finishMenuDrag(id, () => commitValue(value));
      });
      wpmRange.addEventListener("pointerup", (e) => {
        const id = dragId;
        if (!id) return;
        const value = Number(e.target.value);
        releaseMenuDrag(id, () => {
          if (dragId === id) dragId = 0;
          commitValue(value);
        });
      });
      wpmRange.addEventListener("pointercancel", () => {
        const id = dragId;
        /* A detached Chromium range can emit change after pointercancel.
           Keep a local tombstone so that event cannot commit the preview as a
           keyboard change after the global drag session has been cancelled. */
        dragId = -1;
        if (cancelMenuDrag(id)) {
          renderMenu();
          renderCluster();
        }
      });
    }
    menu.querySelector("[data-act='rate-']")?.addEventListener("click", () => {
      const base = QT._hold1x
        ? 1
        : clamp(Number(QT._userRate) || 1, RATE_MIN, RATE_MAX);
      leaveNeutralForManualRateEdit();
      const v = videoEl();
      if (v)
        setRate(v, steppedManualRate(base, -0.25), {
          user: true,
        });
      renderMenu();
    });
    menu.querySelector("[data-act='rate+']")?.addEventListener("click", () => {
      const base = QT._hold1x
        ? 1
        : clamp(Number(QT._userRate) || 1, RATE_MIN, RATE_MAX);
      leaveNeutralForManualRateEdit();
      const v = videoEl();
      if (v)
        setRate(v, steppedManualRate(base, 0.25), {
          user: true,
        });
      renderMenu();
    });
    const rateRange = menu.querySelector("[data-act='rate-range']");
    if (rateRange) {
      let dragId = 0;
      let neutralEdit = false;
      let neutralPaceLockWasOn = false;
      rateRange.addEventListener("pointerdown", () => {
        neutralEdit = QT._hold1x;
        neutralPaceLockWasOn = neutralEdit && QT.state.paceLock;
        dragId = beginMenuDrag("rate");
      });
      rateRange.addEventListener("input", (e) => {
        if (QT._hold1x) {
          neutralEdit = true;
          neutralPaceLockWasOn = QT.state.paceLock;
          leaveNeutralForManualRateEdit({ persist: false });
        }
        const v = videoEl();
        if (v) setRate(v, Number(e.target.value), { user: true, persist: false });
        const formatted = formatRate(Number(e.target.value));
        e.target.setAttribute("aria-valuetext", formatted);
        const big = menu.querySelector("#qt-big");
        if (big) big.textContent = formatted;
        renderCluster();
      });
      const commitValue = (value) => {
        if (QT._hold1x) {
          neutralEdit = true;
          neutralPaceLockWasOn = QT.state.paceLock;
          leaveNeutralForManualRateEdit({ persist: false });
        }
        if (neutralEdit && neutralPaceLockWasOn)
          persistPaceLockPreference(false);
        if (neutralEdit) persistFixed1xPreference(false);
        persistUserRate(value);
        neutralEdit = false;
        neutralPaceLockWasOn = false;
        syncOpenMenu();
      };
      rateRange.addEventListener("change", (e) => {
        const id = dragId;
        dragId = 0;
        if (id < 0) return;
        const value = Number(e.target.value);
        finishMenuDrag(id, () => commitValue(value));
      });
      rateRange.addEventListener("pointerup", (e) => {
        const id = dragId;
        if (!id) return;
        const value = Number(e.target.value);
        releaseMenuDrag(id, () => {
          if (dragId === id) dragId = 0;
          commitValue(value);
        });
      });
      rateRange.addEventListener("pointercancel", () => {
        const id = dragId;
        dragId = -1;
        if (cancelMenuDrag(id)) {
          neutralEdit = false;
          neutralPaceLockWasOn = false;
          renderMenu();
          renderCluster();
        }
      });
    }
    menu.querySelectorAll("[data-wpm]").forEach((b) =>
      b.addEventListener("click", () => save({ targetWpm: Number(b.dataset.wpm) })),
    );
    menu.querySelectorAll("[data-rate]").forEach((b) =>
      b.addEventListener("click", () => {
        leaveNeutralForManualRateEdit();
        const v = videoEl();
        if (v) setRate(v, Number(b.dataset.rate), { user: true });
        renderMenu();
      }),
    );
  }

  function nudgeSpeed(dir) {
    if (QT._hold1x) {
      setFixed1x(false, { restore: false, render: false });
    }
    if (lockOn()) {
      save({
        targetWpm: clamp(lockTarget() + dir * WPM_STEP, TARGET_MIN, TARGET_MAX),
      });
      return;
    }
    const v = videoEl();
    if (!v) return;
    const base = clamp(Number(QT._userRate) || 1, RATE_MIN, RATE_MAX);
    setRate(v, steppedManualRate(base, dir * 0.25), {
      user: true,
    });
    renderMenu();
    renderCluster();
  }

  function toggleOneX() {
    if (QT._hold1x) {
      setFixed1x(false);
      return;
    }
    setFixed1x(true);
  }

  function isEditableNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = node.tagName || "";
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      node.isContentEditable ||
      (node.getAttribute && node.getAttribute("role") === "textbox")
    )
      return true;
    /* Closed shadow roots hide their inner input from composedPath(). The
       document active element is then the host, so cover YouTube's search /
       comment/editor-style hosts without suppressing every custom control. */
    const hint = [
      tag,
      node.id || "",
      typeof node.className === "string" ? node.className : "",
      (node.getAttribute && node.getAttribute("aria-label")) || "",
    ].join(" ");
    return /(?:^|[-_\s])(search|textbox|textarea|editor|comment|chat-input|input)(?:$|[-_\s])/i.test(
      hint,
    );
  }

  function isEditableShortcutTarget(e) {
    const path =
      e && typeof e.composedPath === "function" ? e.composedPath() : [e && e.target];
    return path.some(isEditableNode) || isEditableNode(document.activeElement);
  }

  function nativeDialogOpen() {
    const dialogs = document.querySelectorAll(
      "yt-hotkey-dialog-renderer, ytd-popup-container [role='dialog'], " +
        "tp-yt-paper-dialog[opened], ytd-modal-with-title-and-button-renderer",
    );
    return Array.from(dialogs).some((dialog) => {
      if (
        dialog.hidden ||
        dialog.getAttribute("aria-hidden") === "true" ||
        !dialog.isConnected ||
        dialog.closest("[inert]") ||
        effectiveOpacityThrough(dialog, document.documentElement) <= 0.02
      )
        return false;
      const style = getComputedStyle(dialog);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = dialog.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (!isPacePage()) return;
      if (isEditableShortcutTarget(e)) return;
      if (nativeDialogOpen()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return;
      const k = e.key;
      const neutralShortcut =
        (!e.shiftKey && (k === "a" || k === "A")) ||
        (e.shiftKey && (e.code === "Backquote" || k === "~" || k === "`"));
      if (neutralShortcut) {
        e.preventDefault();
        e.stopPropagation();
        toggleOneX();
        return;
      }
      if (!e.shiftKey && (k === "s" || k === "S")) {
        e.preventDefault();
        e.stopPropagation();
        nudgeSpeed(-1);
        return;
      }
      if (!e.shiftKey && (k === "d" || k === "D")) {
        e.preventDefault();
        e.stopPropagation();
        nudgeSpeed(1);
        return;
      }
      if (!e.shiftKey) return;
      if (k === "<" || k === ",") {
        e.preventDefault();
        e.stopPropagation();
        nudgeSpeed(-1);
      }
      if (k === ">" || k === ".") {
        e.preventDefault();
        e.stopPropagation();
        nudgeSpeed(1);
      }
    },
    true,
  );

  document.addEventListener("click", (e) => {
    if (!QT._menuOpen) return;
    if (e.target.closest && e.target.closest("#qt-speed-menu, #qt-cluster")) return;
    closeOurs();
  });

  load();
  let nextTrackPullAt = 0;
  setInterval(() => {
    if (document.hidden || !isPacePage()) return;
    ensureUi();
    if (!trimOn() && !lockOn()) tick(false);
    const asrTrack = (QT.tracks || []).find((t) => TT && TT.trackIsAsr(t));
    if (QT._cuesAreAsr || (!asrTrack && QT.cues.length)) {
      nextTrackPullAt = 0;
      return;
    }
    const now = Date.now();
    if (now < nextTrackPullAt) return;
    nextTrackPullAt = now + 2500;
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  }, 280);
  let lastCaptionFrame = 0;
  let lastRhythmFrame = 0;
  let lastUiFrame = 0;
  const RHYTHM_FRAME_MS = 80;
  const UI_FRAME_MS = 140;
  function trimLoop(now) {
    const watching =
      !document.hidden &&
      typeof location !== "undefined" &&
      isPacePage();
    if (
      watching &&
      (trimOn() || lockOn()) &&
      now - lastRhythmFrame >= RHYTHM_FRAME_MS
    ) {
      lastRhythmFrame = now;
      tick(false);
    }
    if (watching && now - lastUiFrame >= UI_FRAME_MS) {
      lastUiFrame = now;
      renderCluster();
      patchYtTime();
    }
    if (watching && now - lastCaptionFrame >= 140) {
      lastCaptionFrame = now;
      document.dispatchEvent(new Event("qt-toolkit-frame"));
    }
    requestAnimationFrame(trimLoop);
  }
  requestAnimationFrame(trimLoop);
  document.addEventListener("fullscreenchange", () => {
    nativePillNextSampleAt = 0;
    nativeMenuNextSampleAt = 0;
    nativeMenuPlayer = null;
    shortsLaneCache = null;
  });
  window.addEventListener("resize", () => {
    nativePillNextSampleAt = 0;
    nativeMenuNextSampleAt = 0;
    shortsLaneCache = null;
  });
  document.addEventListener("yt-navigate-finish", () => {
    /* The player node often survives SPA navigation while its host paint and
       experiment classes change. Force the next eligible sample to treat it
       as a fresh surface even when the source element identity is unchanged. */
    nativePillNextSampleAt = 0;
    nativeMenuNextSampleAt = 0;
    nativeMenuPlayer = null;
    shortsLaneCache = null;
    watchPlayerCache = null;
    const nextVideoId = currentPageVideoId();
    if (nextVideoId && nextVideoId === navigationVideoId) {
      closeOurs();
      return;
    }
    navigationVideoId = nextVideoId;
    pageGeneration++;
    closeOurs();
    QT.cues = [];
    QT.cuesByLang = {};
    QT.cueProvenance = {};
    QT.tracks = [];
    QT.translationLanguages = [];
    QT.originalLang = "";
    QT.videoId = "";
    QT._cuesAreAsr = false;
    QT._tracksAskSig = "";
    QT._trimBoost = false;
    QT._want = QT._hold1x ? 1 : QT._userRate;
    QT.state.playbackRate = QT._hold1x ? 1 : QT._userRate;
    QT._applyUserRate = !QT._hold1x;
    QT._rateAppliedTo = null;
    /* Drag offsets are per-video and reset here. Writing them on EVERY
       navigation — including home, search and channel pages, which have no
       video id and so skip the same-video early return — burns the
       chrome.storage.sync write quota and can silence later writes. Only
       reset for an actual video, and only when it is not already zero. */
    if (nextVideoId) {
      const zero = {
        p: { x: 0, bottom: null },
        s: { x: 0, bottom: null },
      };
      const slotIsZero = (slot) =>
        !slot || (!slot.x && !slot.y && slot.bottom == null);
      const isZero = (v) =>
        !!v && slotIsZero(v.p) && slotIsZero(v.s);
      const Prefs = globalThis.YtToolkitPrefs;
      const store = Prefs
        ? (cb) => Prefs.get(["qt_captionPos"], cb)
        : (cb) => chrome.storage.sync.get(["qt_captionPos"], cb);
      store((cur) => {
        if (isZero(cur && cur.qt_captionPos)) return;
        if (Prefs) Prefs.set({ qt_captionPos: zero });
        else chrome.storage.sync.set({ qt_captionPos: zero });
      });
    }
    QT._lastWpm = 0;
    QT._smoothWpm = 0;
    QT._speechWpm = 0;
    QT._baseWpm = 0;
    QT._tw = null;
    QT._twN = 0;
    QT._baseN = 0;
    QT._dispCur = null;
    QT._clockKey = "";
    QT._clockWall = 0;
    QT._mediaT = null;
    QT._hold1xFrom = QT._userRate || 1;
    shortsPlayerCache = null;
    shortsPlayerCacheAt = 0;
    nextTrackPullAt = 0;
    /* _cuesAreAsr was just cleared. adoptOriginalCues repaints on the
       false->true transition, but nothing repainted on true->false, so an
       ASR video followed by a no-ASR one kept enabled Lock / Trim rows — and
       clicking one wrote the persisted preference the contract protects. */
    renderMenu();
    renderCluster();
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  });
  setTimeout(() => {
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  }, 400);
})();
