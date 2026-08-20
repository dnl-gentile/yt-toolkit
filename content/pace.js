/* yt-toolkit pace overlay + WPM lock + trim silence + keys. */
(function () {
  const TARGET_MIN = 120;
  const TARGET_MAX = 600;
  const WPM_STEP = 10;
  const WPM_PRESETS = [120, 180, 250, 400, 600];
  const RATE_MIN = 0.25;
  const RATE_MAX = 4;
  const LOCK_MIN = 0.7;
  const LOCK_MAX = 2.5;
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
  QT.tracks = [];
  QT.originalLang = "";
  QT._want = 1;
  QT._writing = false;
  QT._menuOpen = false;
  QT._lastWpm = 0;
  QT._dragging = false;
  QT._userRate = 1;

  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }
  function formatRate(r) {
    const x = Math.round(r * 100) / 100;
    return Number.isInteger(x) ? x + "x" : String(x) + "x";
  }
  function isNoise(text) {
    return TT ? TT.isNoise(text) : !(text || "").trim();
  }

  function load() {
    chrome.storage.sync.get(
      ["qt_targetWpm", "qt_paceLock", "qt_trimSilence", "qt_wordHighlight", "qt_centerWord"],
      (s) => {
        QT.state.targetWpm = s.qt_targetWpm || 180;
        QT.state.paceLock = s.qt_paceLock !== false;
        QT.state.trimSilence = s.qt_trimSilence !== false;
        QT.state.wordHighlight = s.qt_wordHighlight !== false;
        QT.state.centerWord = s.qt_centerWord === true;
        renderMenu();
        renderCluster();
      },
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
    if (Object.keys(out).length) chrome.storage.sync.set(out);
    if (rebuild !== false) renderMenu();
    renderCluster();
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    if (ch.qt_targetWpm && !QT._dragging)
      QT.state.targetWpm = ch.qt_targetWpm.newValue;
    if (ch.qt_paceLock) QT.state.paceLock = ch.qt_paceLock.newValue;
    if (ch.qt_trimSilence) {
      QT.state.trimSilence = ch.qt_trimSilence.newValue;
      QT._dispCur = 0;
      QT._durKey = "";
    }
    if (ch.qt_paceLock) QT._durKey = "";
    if (ch.qt_targetWpm) QT._durKey = "";
    if (ch.qt_wordHighlight) QT.state.wordHighlight = ch.qt_wordHighlight.newValue;
    if (ch.qt_centerWord) QT.state.centerWord = ch.qt_centerWord.newValue;
    if (!QT._dragging && (ch.qt_paceLock || ch.qt_trimSilence)) renderMenu();
    renderCluster();
  });

  function videoEl() {
    return document.querySelector(
      "#movie_player video.html5-main-video, ytd-player video, video.html5-main-video",
    );
  }
  function playerEl() {
    return document.querySelector("#movie_player, .html5-video-player");
  }

  function parseTimedtext(text) {
    return TT ? TT.parseTimedtext(text) : [];
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== "quiettube") return;
    if (d.type === "QT_TIMEDTEXT" && d.text) {
      const cues = parseTimedtext(d.text);
      if (cues.length) {
        const meta = TT ? TT.langFromUrl(d.url) : {};
        let key = (d.lang || "").toLowerCase();
        if (!key && meta.tlang) key = "tlang:" + meta.tlang;
        if (!key && meta.lang) key = meta.lang;
        if (!key) key = "primary";
        QT.cuesByLang[key] = cues;
        const original =
          d.original === true ||
          (TT && TT.isOriginalTrack(key, d.url, QT.originalLang));
        if (original) {
          QT.originalLang = (meta.lang || key).replace(/^tlang:/, "");
          QT.cues = cues;
          QT._tw = null;
          QT._baseWpm = 0;
          QT._smoothWpm = 0;
        }
        document.dispatchEvent(new CustomEvent("qt-cues", { detail: { key, cues, original } }));
      }
    }
    if (d.type === "QT_TRACKS") {
      QT.tracks = d.tracks || [];
      document.dispatchEvent(new CustomEvent("qt-tracks", { detail: QT.tracks }));
      const asr =
        QT.tracks.find((t) => t.kind === "asr") || QT.tracks[0];
      if (asr && !QT.cues.length) bgPull(asr.baseUrl, asr.languageCode);
    }
  });

  function bgPull(url, lang) {
    if (!url || !chrome.runtime || !chrome.runtime.sendMessage) return;
    let u = url;
    if (!/[?&]fmt=/.test(u)) u += (u.includes("?") ? "&" : "?") + "fmt=json3";
    try {
      const parsed = new URL(u, location.origin);
      parsed.searchParams.delete("tlang");
      parsed.searchParams.set("fmt", "json3");
      u = parsed.toString();
    } catch {
      /* keep u */
    }
    chrome.runtime.sendMessage({ type: "QT_FETCH", url: u }, (res) => {
      if (chrome.runtime.lastError || !res || !res.text) return;
      const cues = parseTimedtext(res.text);
      if (!cues.length) return;
      const key = (lang || "primary").toLowerCase();
      QT.cuesByLang[key] = cues;
      if (!QT.originalLang || key === QT.originalLang || key === "primary") {
        QT.originalLang = key === "primary" ? QT.originalLang : key;
        QT.cues = cues;
        QT._tw = null;
        QT._baseWpm = 0;
      }
      document.dispatchEvent(new CustomEvent("qt-cues", { detail: { key, cues, original: true } }));
    });
  }

  function timedWords() {
    if (QT._tw && QT._twN === QT.cues.length) return QT._tw;
    const out = TT ? TT.timedWords(QT.cues) : [];
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
    const live = WPM ? WPM.localWpm(timedWords(), t) : 0;
    if (live === 0) {
      QT._smoothWpm = 0;
      QT._lastWpm = 0;
      return 0;
    }
    QT._smoothWpm = QT._smoothWpm ? QT._smoothWpm * 0.5 + live * 0.5 : live;
    QT._speechWpm = QT._smoothWpm;
    QT._lastWpm = QT._smoothWpm;
    return QT._smoothWpm;
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

  /* The × on the pill IS the clock divisor. 13:09 at 2x → 6:35, not a
     leftover 1.5x total of 8:46. Trim 4×/8× never feeds the clock. */
  function displayRate() {
    if (QT.state.paceLock) {
      const want = WPM
        ? WPM.lockRate(QT.state.targetWpm, baseWpm() || 0)
        : null;
      if (want != null) return want;
    }
    const v = videoEl();
    let r = v && !QT._trimBoost ? v.playbackRate : QT.state.playbackRate;
    if (!(r > 0.08) || r > LOCK_MAX + 0.05) r = QT._userRate || 1;
    return r;
  }

  function stableRate() {
    return displayRate();
  }

  function watchSecs(t0, t1) {
    if (t1 <= t0) return 0;
    let span = t1 - t0;
    if (QT.state.trimSilence && QT.cues.length) {
      span = Math.max(0, span - silenceCut(t0, t1));
    }
    const rate = displayRate();
    return span / (rate > 0.08 ? rate : 1);
  }

  function adjDuration() {
    const v = videoEl();
    if (!v || !isFinite(v.duration) || v.duration < 0.5) return 0;
    const rate = displayRate();
    const key = [
      Math.round(v.duration),
      QT.state.paceLock ? 1 : 0,
      QT.state.trimSilence ? 1 : 0,
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
    let adjCur = watchSecs(0, v.currentTime);
    const adjDur = adjDuration();
    if (
      QT._dispCur != null &&
      Math.abs(v.currentTime - (QT._mediaT || 0)) < 1.5 &&
      adjCur < QT._dispCur - 0.5
    ) {
      adjCur = QT._dispCur;
    }
    QT._mediaT = v.currentTime;
    QT._dispCur = adjCur;
    const fmt = CLK ? CLK.formatClock : formatClock;
    const showOrig = Math.abs(adjDur - v.duration) >= 1.5;
    return (
      fmt(adjCur) +
      " / " +
      fmt(adjDur) +
      (showOrig ? dimOrig(fmt(v.duration)) : "")
    );
  }

  function patchYtTime() {
    /* Native bottom clock is left alone. Time lives in the top-center pill. */
    const native = document.querySelector(".ytp-time-display.qt-time-native-hide");
    if (native) native.classList.remove("qt-time-native-hide");
    const stray = document.getElementById("qt-time-pill");
    if (stray) stray.remove();
  }

  function setRate(v, rate) {
    const r = clamp(rate, 0.25, 16);
    QT._want = r;
    QT.state.playbackRate = r;
    if (r <= LOCK_MAX + 0.05) QT._userRate = r;
    QT._durKey = "";
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
    v.addEventListener("ratechange", () => {
      if (QT._writing) return;
      if (QT._trimBoost) return;
      if (QT._want > LOCK_MAX + 0.02) return;
      if (QT.state.paceLock && Math.abs(v.playbackRate - QT._want) > 0.08) {
        v.playbackRate = QT._want;
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

  function ytSettingsOpen() {
    const menu = document.querySelector(".ytp-popup.ytp-settings-menu, .ytp-settings-menu");
    if (!menu) return false;
    const st = getComputedStyle(menu);
    return st.display !== "none" && menu.offsetHeight > 20;
  }

  function closeYtSettings() {
    if (!ytSettingsOpen()) return;
    const btn = document.querySelector(".ytp-settings-button");
    if (btn) btn.click();
  }

  function closeOurs() {
    QT._menuOpen = false;
    const menu = document.getElementById("qt-speed-menu");
    if (menu) menu.hidden = true;
    const btn = document.querySelector("#qt-cluster .qt-chrome-btn");
    if (btn) btn.classList.remove("is-on");
  }

  function tick() {
    const v = videoEl();
    if (!v) return;
    if (isEndscreen()) {
      closeOurs();
      const wrap = document.getElementById("qt-cluster");
      if (wrap) wrap.classList.add("qt-hidden");
      return;
    }
    bindFightback(v);
    const t = v.currentTime;
    const words = timedWords();
    const boost =
      !v.paused && QT.state.trimSilence && words.length && WPM
        ? WPM.trimBoost(words, t)
        : 0;
    if (boost) {
      QT._trimBoost = true;
      if (Math.abs(v.playbackRate - boost) > 0.3) setRate(v, boost);
    } else {
      /* Speech resumed (or never paused): snap off trim in THIS tick. */
      if (QT._trimBoost || v.playbackRate > LOCK_MAX + 0.02) {
        QT._trimBoost = false;
        setRate(v, stableRate());
      }
      if (!v.paused && QT.state.paceLock && !inSilence(t)) {
        const w = localWpm(t) || QT._speechWpm || baseWpm();
        const want = WPM
          ? WPM.lockRate(QT.state.targetWpm, w)
          : null;
        if (want != null) {
          const cur = v.playbackRate || 1;
          if (cur > LOCK_MAX || Math.abs(cur - want) > 0.18) setRate(v, want);
          else {
            const step = Math.max(-0.05, Math.min(0.05, want - cur));
            setRate(v, cur + step);
          }
        }
      }
    }
    renderCluster();
    patchYtTime();
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
        '<span class="qt-cluster-label">— WPM · 1x</span>' +
        '<div role="button" tabindex="0" class="qt-chrome-btn" aria-label="Playback speed">' +
        ICO.speed +
        "</div></div>";
      const btn = wrap.querySelector(".qt-chrome-btn");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (QT._menuOpen) {
          closeOurs();
          return;
        }
        closeYtSettings();
        QT._menuOpen = true;
        const menu = document.getElementById("qt-speed-menu");
        if (menu) menu.hidden = false;
        btn.classList.add("is-on");
        btn.blur();
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
  }

  function pillText() {
    const v = videoEl();
    const rate = displayRate();
    const measured = Math.round(localWpm(v ? v.currentTime : 0) || 0);
    const wpm = QT.state.paceLock ? QT.state.targetWpm : measured;
    const clock = overlayClock();
    const pace = wpm + " WPM  ·  " + formatRate(rate);
    return clock ? clock + "   ·   " + pace : pace;
  }

  function renderCluster() {
    const label = document.querySelector("#qt-cluster .qt-cluster-label");
    if (label) label.innerHTML = pillText();
    const player = playerEl();
    const wrap = document.getElementById("qt-cluster");
    const menu = document.getElementById("qt-speed-menu");
    if (!player || !wrap) return;
    if (isEndscreen()) {
      wrap.classList.add("qt-hidden");
      if (menu) menu.hidden = true;
      return;
    }
    const hide = player.classList.contains("ytp-autohide") && !QT._menuOpen;
    wrap.classList.toggle("qt-hidden", hide);
    if (hide && menu) {
      menu.hidden = true;
      QT._menuOpen = false;
    }
    if (QT._menuOpen && ytSettingsOpen()) closeOurs();
  }

  function toggleRow(id, label, ico, on) {
    return (
      '<div class="qt-row" data-toggle="' +
      id +
      '"><span class="qt-row-ico">' +
      ico +
      '</span><span class="qt-row-label">' +
      label +
      '</span><div role="switch" aria-checked="' +
      on +
      '" class="qt-switch' +
      (on ? " on" : "") +
      '"></div></div>'
    );
  }

  function renderMenu() {
    const menu = document.getElementById("qt-speed-menu");
    if (!menu) return;
    const st = QT.state;
    const locked = st.paceLock;
    const rate = displayRate();
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
        ? "travado em " + st.targetWpm + " WPM · player " + formatRate(rate)
        : formatRate(rate)) +
      "</p><div class='qt-rule'></div>";
    if (locked) {
      body +=
        '<p class="qt-big" id="qt-big">' +
        st.targetWpm +
        ' <span>WPM</span></p>' +
        '<div class="qt-slider-row">' +
        '<button type="button" class="qt-circle" data-act="wpm-">−</button>' +
        '<input type="range" min="' +
        TARGET_MIN +
        '" max="' +
        TARGET_MAX +
        '" step="10" value="' +
        st.targetWpm +
        '" data-act="wpm-range" />' +
        '<button type="button" class="qt-circle" data-act="wpm+">+</button></div>' +
        '<div class="qt-pills">';
      for (const n of WPM_PRESETS) {
        body +=
          '<button type="button" class="qt-pill' +
          (st.targetWpm === n ? " sel" : "") +
          '" data-wpm="' +
          n +
          '">' +
          n +
          "</button>";
      }
      body +=
        "</div><p class='qt-hint'>" +
        (st.targetWpm === 180 ? "Comfort" : "WPM") +
        "</p>";
    } else {
      body +=
        '<p class="qt-big" id="qt-big">' +
        formatRate(rate) +
        "</p>" +
        '<div class="qt-slider-row">' +
        '<button type="button" class="qt-circle" data-act="rate-">−</button>' +
        '<input type="range" min="' +
        RATE_MIN +
        '" max="' +
        RATE_MAX +
        '" step="0.05" value="' +
        clamp(rate, RATE_MIN, RATE_MAX) +
        '" data-act="rate-range" />' +
        '<button type="button" class="qt-circle" data-act="rate+">+</button></div>' +
        '<div class="qt-pills">';
      for (const n of SPEED_PRESETS) {
        body +=
          '<button type="button" class="qt-pill' +
          (Math.abs(rate - n) < 0.02 ? " sel" : "") +
          '" data-rate="' +
          n +
          '">' +
          n.toFixed(n % 1 === 0 ? 1 : 2) +
          "</button>";
      }
      body += "</div><p class='qt-hint'>Normal</p>";
    }
    body += "<div class='qt-rule'></div>";
    body += toggleRow("paceLock", "Pace lock", ICO.lock, st.paceLock);
    body += toggleRow("trimSilence", "Trim silence", ICO.cut, st.trimSilence);
    menu.innerHTML = body;
    bindMenu(menu);
  }

  function bindMenu(menu) {
    const st = QT.state;
    menu.querySelectorAll("[data-toggle]").forEach((row) => {
      row.addEventListener("click", () => {
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
      wpmRange.addEventListener("pointerdown", () => {
        QT._dragging = true;
      });
      wpmRange.addEventListener("input", (e) => {
        const n = Number(e.target.value);
        QT.state.targetWpm = n;
        const big = menu.querySelector("#qt-big");
        if (big) big.innerHTML = n + ' <span>WPM</span>';
        renderCluster();
      });
      const commit = (e) => {
        QT._dragging = false;
        save({ targetWpm: Number(e.target.value) }, false);
        menu.querySelectorAll("[data-wpm]").forEach((b) => {
          b.classList.toggle("sel", Number(b.dataset.wpm) === QT.state.targetWpm);
        });
      };
      wpmRange.addEventListener("change", commit);
      wpmRange.addEventListener("pointerup", commit);
    }
    menu.querySelector("[data-act='rate-']")?.addEventListener("click", () => {
      const v = videoEl();
      if (v) setRate(v, clamp(v.playbackRate - 0.25, RATE_MIN, RATE_MAX));
      renderMenu();
    });
    menu.querySelector("[data-act='rate+']")?.addEventListener("click", () => {
      const v = videoEl();
      if (v) setRate(v, clamp(v.playbackRate + 0.25, RATE_MIN, RATE_MAX));
      renderMenu();
    });
    const rateRange = menu.querySelector("[data-act='rate-range']");
    if (rateRange) {
      rateRange.addEventListener("pointerdown", () => {
        QT._dragging = true;
      });
      rateRange.addEventListener("input", (e) => {
        const v = videoEl();
        if (v) setRate(v, Number(e.target.value));
        const big = menu.querySelector("#qt-big");
        if (big) big.textContent = formatRate(Number(e.target.value));
        renderCluster();
      });
      const commit = () => {
        QT._dragging = false;
      };
      rateRange.addEventListener("change", commit);
      rateRange.addEventListener("pointerup", commit);
    }
    menu.querySelectorAll("[data-wpm]").forEach((b) =>
      b.addEventListener("click", () => save({ targetWpm: Number(b.dataset.wpm) })),
    );
    menu.querySelectorAll("[data-rate]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = videoEl();
        if (v) setRate(v, Number(b.dataset.rate));
        renderMenu();
      }),
    );
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (!location.pathname.startsWith("/watch")) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      if (!e.shiftKey) return;
      if (e.key === "<" || e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        if (QT.state.paceLock)
          save({
            targetWpm: clamp(QT.state.targetWpm - WPM_STEP, TARGET_MIN, TARGET_MAX),
          });
        else {
          const v = videoEl();
          if (v) setRate(v, clamp(v.playbackRate - 0.25, RATE_MIN, RATE_MAX));
        }
      }
      if (e.key === ">" || e.key === ".") {
        e.preventDefault();
        e.stopPropagation();
        if (QT.state.paceLock)
          save({
            targetWpm: clamp(QT.state.targetWpm + WPM_STEP, TARGET_MIN, TARGET_MAX),
          });
        else {
          const v = videoEl();
          if (v) setRate(v, clamp(v.playbackRate + 0.25, RATE_MIN, RATE_MAX));
        }
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
  setInterval(() => {
    ensureUi();
    tick();
  }, 280);
  document.addEventListener("yt-navigate-finish", () => {
    QT.cues = [];
    QT.cuesByLang = {};
    QT.tracks = [];
    QT.originalLang = "";
    chrome.storage.sync.set({
      qt_captionPos: { p: { x: 0, y: 0 }, s: { x: 0, y: 0 } },
    });
    QT._lastWpm = 0;
    QT._smoothWpm = 0;
    QT._speechWpm = 0;
    QT._baseWpm = 0;
    QT._tw = null;
    QT._twN = 0;
    QT._baseN = 0;
    QT._dispCur = 0;
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  });
  setTimeout(() => {
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
  }, 400);
  setInterval(() => {
    if (!location.pathname.startsWith("/watch")) return;
    if (QT.cues.length) return;
    window.postMessage({ source: "quiettube-iso", type: "QT_NEED_TRACKS" }, "*");
    const asr = (QT.tracks || []).find((t) => t.kind === "asr") || (QT.tracks || [])[0];
    if (asr) bgPull(asr.baseUrl, asr.languageCode);
  }, 2500);
})();
