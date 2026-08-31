/* Hide native Playback speed. Inject Dual / Color highlight / Center word
   ONLY into the Subtitles/CC submenu — never the root settings panel. */
(function () {
  const Dual = globalThis.YtToolkitDual;
  const SPEED_LABELS = [
    "playback speed",
    "velocidade de reprodução",
    "velocidad de reproducción",
    "vitesse de lecture",
    "wiedergabegeschwindigkeit",
    "velocità di riproduzione",
    "再生速度",
    "재생 속도",
    "скорость воспроизведения",
    "播放速度",
    "afspelingssnelheid",
  ];
  const CAPTIONS_LABELS = [
    "subtitles/cc",
    "subtitles",
    "captions",
    "legendas",
    "legendas/cc",
    "subtítulos",
    "sous-titres",
    "untertitel",
    "sottotitoli",
    "字幕",
    "자막",
    "субтитры",
  ];
  const OFF_LABELS = [
    "off",
    "desativadas",
    "desligar",
    "desactivar",
    "désactivé",
    "aus",
    "disattivate",
    "オフ",
    "끄기",
  ];
  const AUTO_XL = [
    "auto-translate",
    "traduzir automaticamente",
    "auto-traducir",
    "traduction automatique",
    "automatisch übersetzen",
    "traduci automaticamente",
  ];
  const MAIN_MARKERS = [
    "stable volume",
    "volume estável",
    "quality",
    "qualidade",
    "ambient mode",
    "modo ambiente",
    "sleep timer",
    "temporizador",
  ];

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  function isShortsPage() {
    return /^\/shorts(?:\/|$)/.test(location.pathname || "");
  }

  function items(root) {
    return [...(root || document).querySelectorAll(".ytp-menuitem")];
  }

  function shortsRows(menu) {
    if (!menu) return [];
    return Array.from(
      menu.querySelectorAll(":scope > [role='menuitemradio'], :scope > [data-qt-cap]"),
    );
  }

  function shortsRowLabel(row) {
    return norm(row && row.textContent);
  }

  function shortsSheetFor(menu) {
    if (!menu) return null;
    let fallback = menu.parentElement;
    for (let node = menu.parentElement, depth = 0; node && depth < 7; node = node.parentElement, depth++) {
      if (
        node.matches?.(
          "yt-sheet-view-model, yt-contextual-sheet-layout, [role='dialog'], tp-yt-paper-dialog",
        )
      )
        fallback = node;
      if (
        node.querySelector?.(
          "h1, h2, h3, [role='heading'], .ytContextualSheetLayoutHeader, .ytContextualSheetLayoutTitle",
        )
      )
        return node;
      if (node === document.body) break;
    }
    return fallback;
  }

  function shortsCaptionHeading(menu) {
    const sheet = shortsSheetFor(menu);
    const heading = sheet?.querySelector?.(
      "h1, h2, h3, [role='heading'], .ytContextualSheetLayoutHeader, .ytContextualSheetLayoutTitle",
    );
    return norm(heading?.textContent);
  }

  function isShortsCaptionMenu(menu, requireRendered) {
    if (!isShortsPage() || !menu || menu.getAttribute("role") !== "menu") return false;
    if (requireRendered !== false && !menuElementIsOpen(menu)) return false;
    const nativeRows = shortsRows(menu).filter(
      (row) => !row.hasAttribute("data-qt-cap"),
    );
    if (!nativeRows.length) return false;
    const labels = nativeRows.map(shortsRowLabel);
    const heading = shortsCaptionHeading(menu);
    const headingMatches = CAPTIONS_LABELS.some(
      (label) => heading === label || heading.includes(label),
    );
    const hasOff = labels.some((label) => OFF_LABELS.includes(label));
    const hasAuto = labels.some((label) =>
      AUTO_XL.some((candidate) => label.includes(candidate)),
    );
    return headingMatches || (hasOff && hasAuto);
  }

  let shortsCaptionMenuCache = null;
  function shortsCaptionMenu(discover) {
    if (!isShortsPage()) {
      shortsCaptionMenuCache = null;
      return null;
    }
    if (
      shortsCaptionMenuCache?.isConnected &&
      isShortsCaptionMenu(shortsCaptionMenuCache, true)
    )
      return shortsCaptionMenuCache;
    shortsCaptionMenuCache = null;
    if (discover === false) return null;
    shortsCaptionMenuCache =
      Array.from(document.querySelectorAll("[role='menu']")).find((menu) =>
        isShortsCaptionMenu(menu, true),
      ) || null;
    return shortsCaptionMenuCache;
  }

  function hideSpeed(root) {
    for (const it of items(root)) {
      if (it.hasAttribute("data-qt-hidden-speed")) continue;
      const label = norm(
        it.querySelector(".ytp-menuitem-label")?.textContent || "",
      );
      if (SPEED_LABELS.some((l) => label === l || label.startsWith(l))) {
        it.style.display = "none";
        it.setAttribute("data-qt-hidden-speed", "1");
      }
    }
  }

  function isMainSettings(root) {
    const t = norm(root.textContent);
    return MAIN_MARKERS.filter((m) => t.includes(m)).length >= 2;
  }

  function isAutoXlPanel(root) {
    if (!root) return false;
    const headerEl = root.querySelector(
      ".ytp-panel-header, .ytp-panel-title, .ytp-menuitem-header",
    );
    const header = norm(headerEl?.textContent);
    return AUTO_XL.some((l) => header.includes(l));
  }

  function isCaptionsPanel(root) {
    if (!root || isMainSettings(root) || isAutoXlPanel(root)) return false;
    const headerEl = root.querySelector(
      ".ytp-panel-header, .ytp-panel-title, .ytp-menuitem-header",
    );
    const header = norm(headerEl?.textContent);
    if (AUTO_XL.some((l) => header.includes(l))) return false;
    if (CAPTIONS_LABELS.some((l) => header === l || header.includes(l))) return true;
    const labels = items(root).map((it) =>
      norm(it.querySelector(".ytp-menuitem-label")?.textContent),
    );
    const hasOff = labels.some((l) => OFF_LABELS.includes(l));
    const hasAuto = labels.some((l) => AUTO_XL.some((a) => l.includes(a)));
    return hasOff && hasAuto;
  }

  function switchHtml() {
    /* Native player switch — same node YouTube uses for Stable Volume.
       Do not add qt-switch: our CSS was painting the old overhanging thumb
       on top of YouTube's contained pill. */
    return '<div class="ytp-menuitem-toggle-checkbox" aria-hidden="true"></div>';
  }

  function persistSelected() {
    selectedLangs = Dual.normalizeSlots(selectedLangs);
    const payload = {
      qt_captionLangs: selectedLangs.slice(),
      qt_primaryTrack: selectedLangs[0] || "",
      qt_secondaryTrack: selectedLangs[1] || "",
    };
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set(payload);
    else chrome.storage.sync.set(payload);
  }

  function normalizeDisplayCaption(value) {
    if (!value || typeof value !== "object") return null;
    const languageCode = String(value.languageCode || "").trim().toLowerCase();
    const translationLanguageCode = String(
      value.translationLanguageCode || "",
    )
      .trim()
      .toLowerCase();
    const kind = String(value.kind || "").trim().toLowerCase();
    if (!languageCode && !translationLanguageCode) return null;
    return { languageCode, translationLanguageCode, kind };
  }

  function displayDescriptor(code, translated) {
    const qt = window.QuietTube || {};
    const tracks = Array.isArray(qt.tracks) ? qt.tracks : [];
    const exact = tracks.find(
      (track) =>
        String(track.languageCode || "").toLowerCase() ===
        String(code || "").toLowerCase(),
    );
    if (!translated) {
      return normalizeDisplayCaption({
        languageCode: exact?.languageCode || code,
        translationLanguageCode: "",
        kind: exact?.kind || "",
      });
    }
    const TT = globalThis.YtToolkitTimedtext;
    const source =
      tracks.find((track) => TT && TT.trackIsAsr?.(track)) || tracks[0];
    return normalizeDisplayCaption({
      languageCode: source?.languageCode || qt.originalLang || "",
      translationLanguageCode: code,
      kind: source?.kind || "",
    });
  }

  function persistDisplayCaption(descriptor) {
    const next = normalizeDisplayCaption(descriptor);
    if (!next) return;
    displayCaptionPref = next;
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set({ qt_displayCaption: next });
    else chrome.storage.sync.set({ qt_displayCaption: next });
  }

  function persistCaptionsEnabled(enabled) {
    const next = enabled === true;
    if (captionsPref === next) return;
    captionsPref = next;
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set({ qt_captionsEnabled: next });
    else chrome.storage.sync.set({ qt_captionsEnabled: next });
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

  function playerArea(player) {
    if (!player?.getBoundingClientRect) return 0;
    const rect = player.getBoundingClientRect();
    const vw = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
    const vh = Number(window.innerHeight) || Number.POSITIVE_INFINITY;
    const width = Math.max(
      0,
      Math.min(rect.right ?? rect.width, vw) - Math.max(rect.left || 0, 0),
    );
    const height = Math.max(
      0,
      Math.min(rect.bottom ?? rect.height, vh) - Math.max(rect.top || 0, 0),
    );
    return Number.isFinite(width * height)
      ? width * height
      : Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function playerVideoId(player) {
    try {
      const id = player?.getPlayerResponse?.()?.videoDetails?.videoId || "";
      if (id) return id;
    } catch {
      /* use stable host metadata below */
    }
    const reel = player?.closest?.("ytd-reel-video-renderer");
    return (
      player?.dataset?.videoId ||
      reel?.dataset?.video ||
      reel?.getAttribute?.("video-id") ||
      ""
    );
  }

  function resolveWatchPlayer() {
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
    let exactArea = -1;
    let watchVisible = null;
    let watchArea = -1;
    let otherVisible = null;
    let otherArea = -1;
    let exact = null;
    let watchFallback = null;
    for (const candidate of candidates) {
      const area = playerArea(candidate);
      const miniplayer = !!candidate.closest?.("ytd-miniplayer");
      const watch = !!candidate.closest?.("ytd-watch-flexy");
      if (wanted && playerVideoId(candidate) === wanted) {
        exact = exact || candidate;
        if (area > exactArea) {
          exactVisible = candidate;
          exactArea = area;
        }
      }
      if (watch && !miniplayer) {
        watchFallback = watchFallback || candidate;
        if (area > watchArea) {
          watchVisible = candidate;
          watchArea = area;
        }
      }
      if (!miniplayer && area > otherArea) {
        otherVisible = candidate;
        otherArea = area;
      }
    }
    if (exactVisible && exactArea > 0) return exactVisible;
    if (watchVisible && watchArea > 0) return watchVisible;
    if (canonical && !canonical.closest?.("ytd-miniplayer") && playerArea(canonical) > 0)
      return canonical;
    if (otherVisible && otherArea > 0) return otherVisible;
    return exact || watchFallback || canonical || candidates[0] || null;
  }

  function resolveShortsPlayer() {
    const wanted = pageVideoId();
    const candidates = [];
    const add = (node) => {
      if (node && !candidates.includes(node)) candidates.push(node);
    };
    /* Prefer the reel the host itself marks active. Without this, and with an
       unclipped rect, an off-screen Short in the feed has the same width and
       height as the visible one and could win the "largest" tie-break — so a
       CC restore could land on the wrong player. The other two resolvers
       (content/pace.js, content/inject.js) already do both. */
    const activeRoot = document.querySelector(
      "ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active], " +
        "ytd-reel-video-renderer[aria-hidden='false']",
    );
    if (activeRoot && activeRoot.querySelector) {
      add(activeRoot.querySelector("#shorts-player"));
      add(activeRoot.querySelector(".html5-video-player"));
    }
    Array.from(
      document.querySelectorAll(
        "ytd-reel-video-renderer #shorts-player, " +
          "ytd-reel-video-renderer .html5-video-player",
      ),
    ).forEach(add);
    let exact = null;
    let largest = null;
    let largestArea = -1;
    for (const player of candidates) {
      const area = playerArea(player);
      if (playerVideoId(player) === wanted) {
        if (area > 0) return player;
        exact = exact || player;
      }
      if (area > largestArea) {
        largestArea = area;
        largest = player;
      }
    }
    return largestArea > 0 ? largest : exact || largest || null;
  }

  let activePlayerCache = null;
  function activePlayerKey() {
    return (isShortsPage() ? "shorts:" : "watch:") + pageVideoId();
  }
  function invalidateActivePlayer() {
    activePlayerCache = null;
  }
  function activePlayer() {
    const key = activePlayerKey();
    if (
      activePlayerCache &&
      activePlayerCache.key === key &&
      activePlayerCache.player?.isConnected
    )
      return activePlayerCache.player;
    const resolved = isShortsPage() ? resolveShortsPlayer() : resolveWatchPlayer();
    activePlayerCache = { key, player: resolved || null };
    observeActivePlayerLifecycle(resolved);
    return resolved;
  }

  const ACTIVE_PLAYER_NODE_SELECTOR =
    "ytd-reel-video-renderer, ytd-player, #movie_player, #shorts-player";
  let activePlayerObserver = null;
  let activePlayerObserverRoots = [];
  function activePlayerLifecycleNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return (
      node.matches?.(ACTIVE_PLAYER_NODE_SELECTOR) ||
      !!node.querySelector?.(ACTIVE_PLAYER_NODE_SELECTOR)
    );
  }
  function activePlayerLifecycleRoots(player) {
    if (!player) return [];
    if (isShortsPage()) {
      const reel = player.closest?.("ytd-reel-video-renderer");
      if (!reel) return [player];
      const siblings = Array.from(reel.parentElement?.children || []).filter(
        (node) => node.matches?.("ytd-reel-video-renderer"),
      );
      return siblings.length ? siblings : [reel];
    }
    return [
      player.closest?.("ytd-watch-flexy") ||
        player.closest?.("ytd-player") ||
        player,
    ];
  }

  function observeActivePlayerLifecycle(player) {
    const roots = activePlayerLifecycleRoots(player);
    if (
      roots.length === activePlayerObserverRoots.length &&
      roots.every((root, index) => root === activePlayerObserverRoots[index])
    )
      return;
    if (activePlayerObserver) activePlayerObserver.disconnect();
    activePlayerObserver = null;
    activePlayerObserverRoots = roots;
    if (!roots.length) return;
    activePlayerObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === "attributes")
          return record.target?.matches?.("ytd-reel-video-renderer") || false;
        return [...record.addedNodes, ...record.removedNodes].some(
          activePlayerLifecycleNode,
        );
      });
      if (relevant) invalidateActivePlayer();
    });
    roots.forEach((root) => {
      activePlayerObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["is-active", "active", "aria-hidden"],
      });
    });
  }

  function ccButton() {
    const player = activePlayer();
    /* Shorts recycles player DOM ahead of both the URL and timedtext owner.
       Restoring CC is a mutating action, so use the same three-way identity
       gate as caption paint: never click until pathname, QuietTube cues and
       the visible player all name the same Short. */
    if (isShortsPage()) {
      const wanted = pageVideoId();
      const rhythmId = window.QuietTube?.videoId || "";
      const activeId = playerVideoId(player);
      if (
        !wanted ||
        rhythmId !== wanted ||
        activeId !== wanted ||
        playerArea(player) <= 0
      )
        return null;
    }
    const scope =
      player?.closest?.("ytd-reel-video-renderer") || player || document;
    return scope.querySelector(
      ".ytp-subtitles-button, button.ytp-button[aria-label*=ubtitle i], " +
        "button.ytp-button[aria-label*=egend i], ytm-closed-captioning-button button",
    );
  }

  function ccState(button) {
    if (!button) return null;
    const pressed = button.getAttribute("aria-pressed");
    if (pressed === "true" || pressed === "false") return pressed === "true";
    const p = button.closest("#movie_player, .html5-video-player, #shorts-player");
    return p ? p.classList.contains("captions-enabled") : null;
  }

  let ccRestoreGeneration = 0;
  let ccRestoring = false;
  let ccRestoreTimer = 0;

  function restoreCaptionsPreference(generation, state) {
    if (generation !== ccRestoreGeneration) return;
    if (captionsPref !== true && captionsPref !== false) return;
    if (!/^\/(watch|shorts)(?:\/|$)/.test(location.pathname || "")) return;
    const button = ccButton();
    if (!button) {
      if (Date.now() - state.started < 2200)
        ccRestoreTimer = setTimeout(
          () => restoreCaptionsPreference(generation, state),
          180,
        );
      return;
    }
    const current = ccState(button);
    if (current === captionsPref) {
      state.seenDesired = true;
    } else if (
      state.clicks === 0 ||
      (state.seenDesired && state.clicks === 1)
    ) {
      ccRestoring = true;
      state.clicks++;
      button.click();
      ccRestoring = false;
    }
    if (Date.now() - state.started < 2200)
      ccRestoreTimer = setTimeout(
        () => restoreCaptionsPreference(generation, state),
        160,
      );
  }

  function scheduleCaptionsRestore() {
    const generation = ++ccRestoreGeneration;
    clearTimeout(ccRestoreTimer);
    const state = { started: Date.now(), clicks: 0, seenDesired: false };
    ccRestoreTimer = setTimeout(
      () => restoreCaptionsPreference(generation, state),
      120,
    );
  }

  let observedCaptionButton = null;
  function reconcileCaptionButton() {
    const button = ccButton();
    if (!button || button === observedCaptionButton) return;
    observedCaptionButton = button;
    /* A same-video player replacement does not emit yt-navigate-finish. Use
       the shared Toolkit frame only as an identity tripwire, then run the
       existing bounded restore. Explicit OFF never clicks a late replacement:
       hidden ASR acquisition is independent from CC and must not manipulate it. */
    if (captionsPref === true) scheduleCaptionsRestore();
  }

  let displayRestoreGeneration = 0;

  function restoreDisplayPreference(generation) {
    if (generation !== displayRestoreGeneration) return;
    if (
      captionsPref !== true ||
      dualOn ||
      highlightOn ||
      centerOn ||
      !displayCaptionPref
    )
      return;
    const videoId = pageVideoId();
    if (!videoId) return;
    window.postMessage(
      {
        source: "quiettube-iso",
        type: "QT_RESTORE_DISPLAY_TRACK",
        videoId,
        descriptor: displayCaptionPref,
      },
      "*",
    );
  }

  function scheduleDisplayRestore() {
    const generation = ++displayRestoreGeneration;
    [420, 1150].forEach((delay) =>
      setTimeout(() => restoreDisplayPreference(generation), delay),
    );
  }

  function observeCaptionIntent(button, before) {
    const generation = ++ccRestoreGeneration;
    clearTimeout(ccRestoreTimer);
    const started = Date.now();
    const poll = () => {
      if (generation !== ccRestoreGeneration || !button?.isConnected) return;
      const current = ccState(button);
      if (
        (current === true || current === false) &&
        current !== before
      ) {
        persistCaptionsEnabled(current);
        return;
      }
      if (Date.now() - started < 1400) setTimeout(poll, 80);
    };
    setTimeout(poll, 0);
  }

  function paintOpenLangPanels() {
    document
      .querySelectorAll(
        ".ytp-popup.ytp-settings-menu .ytp-panel, .ytp-settings-menu .ytp-panel",
      )
      .forEach((panel) => {
        if (isCaptionsPanel(panel) || isAutoXlPanel(panel)) paintLangChecks(panel);
      });
  }

  const NO_ASR_HINT =
    "Needs the auto-generated caption in the video\u2019s original language. " +
    "This video has none yet \u2014 it turns back on by itself when one arrives.";

  /* Color highlight and Center word paint per-word timing, which only the
     original-language auto-generated track provides. Dual is pure display and
     stays available. The stored preference is never cleared. */
  function asrRhythm() {
    return !!(window.QuietTube && window.QuietTube._cuesAreAsr);
  }
  function needsAsr(key) {
    return key === "qt_wordHighlight" || key === "qt_centerWord";
  }

  function toggleCaptionPreference(row, key) {
    /* Availability is live authority, not an old DOM attribute. The host can
       hide/reuse the popup exactly when ASR is adopted, leaving aria-disabled
       stale. Revalidate both directions at click time. */
    const liveBlocked = needsAsr(key) && !asrRhythm();
    const rowMenu = row.closest(".ytp-panel-menu, [role='menu']") || row.parentElement;
    if (rowMenu && rowMenu.querySelector("[data-qt-cap]"))
      syncCaptionToggles(rowMenu);
    if (liveBlocked) return;
    const stored = capToggleValue(key);
    const next = stored === null ? row.getAttribute("aria-checked") !== "true" : !stored;
    row.setAttribute("aria-checked", next ? "true" : "false");
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs) Prefs.set({ [key]: next });
    else chrome.storage.sync.set({ [key]: next });
    if (key === "qt_dualCaptions") {
      dualOn = next;
      if (next && !selectedLangs.some(Boolean)) {
        const panel = row.closest(".ytp-panel") || row.parentElement;
        const checked = items(panel).find(
          (it) =>
            it.getAttribute("aria-checked") === "true" &&
            !isOffItem(it) &&
            !isAutoXlItem(it) &&
            !it.hasAttribute("data-qt-cap"),
        );
        const code = checked && codeFromItem(checked);
        if (code) selectedLangs = Dual.selectLang(selectedLangs, code);
        if (!selectedLangs.some(Boolean)) {
          const original = (window.QuietTube && window.QuietTube.originalLang) || "";
          if (original) selectedLangs = [original];
        }
      }
      persistSelected();
    }
    if (key === "qt_wordHighlight") highlightOn = next;
    if (key === "qt_centerWord") centerOn = next;
    scheduleDisplayRestore();
    paintOpenLangPanels();
  }

  function makeToggle(key, label, on, offItem) {
    const blocked = needsAsr(key) && !asrRhythm();
    const row = offItem ? offItem.cloneNode(true) : document.createElement("div");
    row.className = (offItem ? offItem.className : "ytp-menuitem") + " qt-cap-toggle";
    row.setAttribute("data-qt-cap", key);
    row.setAttribute("role", "menuitemcheckbox");
    row.setAttribute("aria-checked", on && !blocked ? "true" : "false");
    row.removeAttribute("aria-haspopup");
    setClass(row, "qt-cap-disabled", blocked);
    setAttr(row, "aria-disabled", blocked ? "true" : null);
    setAttr(row, "title", blocked ? NO_ASR_HINT : null);
    let icon = row.querySelector(".ytp-menuitem-icon");
    let lab = row.querySelector(".ytp-menuitem-label");
    let content = row.querySelector(".ytp-menuitem-content");
    if (!lab) {
      row.innerHTML =
        '<div class="ytp-menuitem-icon"></div>' +
        '<div class="ytp-menuitem-label"></div>' +
        '<div class="ytp-menuitem-content"></div>';
      icon = row.querySelector(".ytp-menuitem-icon");
      lab = row.querySelector(".ytp-menuitem-label");
      content = row.querySelector(".ytp-menuitem-content");
    }
    if (!content) {
      content = document.createElement("div");
      content.className = "ytp-menuitem-content";
      row.appendChild(content);
    }
    if (icon) icon.innerHTML = "";
    lab.textContent = label;
    /* Toggle lives in content, like Stable Volume / Ambient mode. */
    content.innerHTML = switchHtml();
    pinCapToggleLayout(row, offItem);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCaptionPreference(row, key);
    });
    return row;
  }

  function makeShortsToggle(key, label, on, offItem) {
    const blocked = needsAsr(key) && !asrRhythm();
    /* Deliberately a plain element, NOT offItem.tagName.
       The native Off row is a <yt-list-item-view-model>, and that is a DEFINED
       custom element on real YouTube. Instantiating it would run YouTube's own
       lifecycle, whose render replaces the children we put in — measured: with
       the element defined, our label is gone and the row shows the host's own
       content instead. Every fixture writes that tag UNDEFINED (there is no
       customElements.define anywhere under tests/), where it is inert and the
       substitution is invisible, which is why this survived the suite.
       Appearance is carried by the copied className and inline style below,
       plus display:flex in styles-toggles.css — none of it is tag-dependent. */
    const row = document.createElement("div");
    if (offItem?.className && typeof offItem.className === "string")
      row.className = offItem.className;
    if (offItem?.style?.cssText) row.style.cssText = offItem.style.cssText;
    row.classList.add("qt-shorts-cap-toggle");
    row.setAttribute("data-qt-cap", key);
    row.setAttribute("data-qt-shorts-cap", "1");
    row.setAttribute("role", "menuitemcheckbox");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-checked", on && !blocked ? "true" : "false");
    setClass(row, "qt-cap-disabled", blocked);
    setAttr(row, "aria-disabled", blocked ? "true" : null);
    setAttr(row, "title", blocked ? NO_ASR_HINT : null);

    const nativeContent = offItem?.querySelector?.("label");
    const content = nativeContent
      ? nativeContent.cloneNode(false)
      : document.createElement("div");
    content.removeAttribute?.("for");
    content.classList.add("qt-shorts-cap-content");
    const text = document.createElement("span");
    text.className = "qt-shorts-cap-label";
    text.textContent = label;
    const toggle = document.createElement("div");
    toggle.className = "qt-switch qt-shorts-cap-switch";
    toggle.setAttribute("aria-hidden", "true");
    content.replaceChildren(text, toggle);
    row.replaceChildren(content);

    const activate = (event) => {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ")
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      toggleCaptionPreference(row, key);
    };
    row.addEventListener("click", activate, true);
    row.addEventListener("keydown", activate, true);
    return row;
  }

  let dualOn = false;
  let highlightOn = true;
  let centerOn = false;
  let selectedLangs = [];
  let captionsPref = null;
  let displayCaptionPref = null;

  function readDualPrefs() {
    const Prefs = globalThis.YtToolkitPrefs;
    const apply = (s) => {
      dualOn = s.qt_dualCaptions === true;
      highlightOn = s.qt_wordHighlight !== false;
      centerOn = s.qt_centerWord === true;
      selectedLangs = Dual.normalizeSlots(
        Array.isArray(s.qt_captionLangs) ? s.qt_captionLangs : [],
      );
      displayCaptionPref = normalizeDisplayCaption(s.qt_displayCaption);
      captionsPref =
        s.qt_captionsEnabled === true || s.qt_captionsEnabled === false
          ? s.qt_captionsEnabled
          : null;
      scheduleCaptionsRestore();
      scheduleDisplayRestore();
    };
    if (Prefs)
      Prefs.get(
        [
          "qt_dualCaptions",
          "qt_wordHighlight",
          "qt_centerWord",
          "qt_captionLangs",
          "qt_captionsEnabled",
          "qt_displayCaption",
        ],
        apply,
      );
    else
      chrome.storage.sync.get(
        [
          "qt_dualCaptions",
          "qt_wordHighlight",
          "qt_centerWord",
          "qt_captionLangs",
          "qt_captionsEnabled",
          "qt_displayCaption",
        ],
        apply,
      );
  }
  readDualPrefs();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync" && area !== "local") return;
    if (ch.qt_dualCaptions) dualOn = ch.qt_dualCaptions.newValue === true;
    if (ch.qt_wordHighlight) highlightOn = ch.qt_wordHighlight.newValue !== false;
    if (ch.qt_centerWord) centerOn = ch.qt_centerWord.newValue === true;
    if (ch.qt_captionLangs && Array.isArray(ch.qt_captionLangs.newValue))
      selectedLangs = Dual.normalizeSlots(ch.qt_captionLangs.newValue);
    if (ch.qt_captionsEnabled) {
      captionsPref =
        ch.qt_captionsEnabled.newValue === true ||
        ch.qt_captionsEnabled.newValue === false
          ? ch.qt_captionsEnabled.newValue
          : null;
      scheduleCaptionsRestore();
      scheduleDisplayRestore();
    }
    if (ch.qt_displayCaption)
      displayCaptionPref = normalizeDisplayCaption(ch.qt_displayCaption.newValue);
    if (ch.qt_dualCaptions || ch.qt_wordHighlight || ch.qt_centerWord)
      scheduleDisplayRestore();
    if (menuIsOpen()) schedulePatch();
  });

  function isOffItem(it) {
    return OFF_LABELS.includes(
      norm(it.querySelector(".ytp-menuitem-label")?.textContent),
    );
  }
  function isAutoXlItem(it) {
    const t = norm(it.querySelector(".ytp-menuitem-label")?.textContent);
    return AUTO_XL.some((l) => t.includes(l));
  }

  function codeFromItem(it) {
    const attr =
      it.getAttribute("data-language-code") ||
      it.getAttribute("data-lang") ||
      it.dataset.languageCode ||
      "";
    if (attr) return attr.toLowerCase().replace(/^tlang:/, "");
    const label = (
      it.querySelector(".ytp-menuitem-label")?.textContent || ""
    ).trim();
    const qt = window.QuietTube || {};
    return Dual.codeFromLabel(label, [
      ...(qt.tracks || []),
      ...(qt.translationLanguages || []),
    ]);
  }

  /* classList.remove() re-serialises the class attribute even when the token
     is absent, and classList.add() does the same when it is already present.
     With "class" in the observer filter that turned every pass into fresh
     mutations, which scheduled another pass. Always test before writing. */
  function setClass(el, name, on) {
    if (on) {
      if (!el.classList.contains(name)) el.classList.add(name);
    } else if (el.classList.contains(name)) {
      el.classList.remove(name);
    }
  }
  function setAttr(el, name, value) {
    if (value == null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }

  let nativeCheckTemplate = null;

  function nativeCheckPx(value, fallback) {
    const matches = String(value || "").match(/-?\d+(?:\.\d+)?px/g) || [];
    const n = parseFloat(matches[0]);
    return Number.isFinite(n) && n >= 6 && n <= 28 ? n : fallback;
  }

  /* YouTube paints its selected-language indicator either as a background on
     the label or as an SVG owned by the row. Capture that real host asset
     before qt-dual-lang suppresses the native white paint; Dual only changes
     its color, never substitutes a typographic check mark. */
  function captureNativeCheck(menu) {
    if (nativeCheckTemplate) return nativeCheckTemplate;
    const checked = items(menu).filter(
      (it) => it.getAttribute("aria-checked") === "true",
    );
    for (const it of checked) {
      const label = it.querySelector(".ytp-menuitem-label");
      if (!label) continue;
      const cs = getComputedStyle(label);
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        nativeCheckTemplate = {
          kind: "background-image",
          image: cs.backgroundImage,
          width: nativeCheckPx(cs.backgroundSize, 12),
          height: (() => {
            const parts = String(cs.backgroundSize || "").match(
              /-?\d+(?:\.\d+)?px/g,
            );
            const n = parts && parseFloat(parts[1]);
            return Number.isFinite(n) && n >= 6 && n <= 28 ? n : 12;
          })(),
          left: nativeCheckPx(cs.backgroundPosition, 10),
        };
        return nativeCheckTemplate;
      }
      const svg = it.querySelector(
        ".ytp-menuitem-content svg, .ytp-menuitem-icon svg, .ytp-menuitem-label svg",
      );
      if (svg) {
        const rect = svg.getBoundingClientRect();
        nativeCheckTemplate = {
          kind: "svg",
          svg: svg.cloneNode(true),
          width: rect.width >= 6 && rect.width <= 28 ? rect.width : 12,
          height: rect.height >= 6 && rect.height <= 28 ? rect.height : 12,
          left: 10,
        };
        return nativeCheckTemplate;
      }
    }
    return null;
  }

  function removeDualCheck(it) {
    it.querySelectorAll(".qt-dual-check").forEach((node) => node.remove());
    setAttr(it, "data-qt-native-check-source", null);
  }

  function ensureDualCheck(it, template) {
    const label = it.querySelector(".ytp-menuitem-label");
    if (!label || !template) {
      removeDualCheck(it);
      return;
    }
    let check = label.querySelector(":scope > .qt-dual-check");
    if (!check) {
      check = document.createElement("span");
      check.className = "qt-dual-check";
      check.setAttribute("aria-hidden", "true");
      label.prepend(check);
    }
    setAttr(check, "data-qt-native-check-source", template.kind);
    setAttr(it, "data-qt-native-check-source", template.kind);
    check.style.setProperty("--qt-check-width", template.width + "px");
    check.style.setProperty("--qt-check-height", template.height + "px");
    check.style.setProperty("--qt-check-left", template.left + "px");
    if (template.kind === "background-image") {
      if (check.childNodes.length) check.replaceChildren();
      check.style.setProperty("--qt-native-check-image", template.image);
      check.classList.remove("qt-dual-check-svg");
    } else {
      check.style.removeProperty("--qt-native-check-image");
      check.classList.add("qt-dual-check-svg");
      if (!check.querySelector("svg")) {
        const svg = template.svg.cloneNode(true);
        [svg, ...svg.querySelectorAll("*")].forEach((node) => {
          ["fill", "stroke"].forEach((attr) => {
            const value = String(node.getAttribute?.(attr) || "").toLowerCase();
            if (value && value !== "none") node.setAttribute(attr, "currentColor");
          });
        });
        check.replaceChildren(svg);
      }
    }
  }

  function restoreNativeLangRow(it) {
    setClass(it, "qt-dual-lang", false);
    setAttr(it, "data-qt-slot", null);
    removeDualCheck(it);
  }

  function paintLangChecks(menu) {
    const nativeCheck = captureNativeCheck(menu);
    items(menu).forEach((it) => {
      if (it.hasAttribute("data-qt-cap")) return;
      const panel = it.closest(".ytp-panel") || menu;
      const inXl = isAutoXlPanel(panel);
      if (!dualOn) {
        restoreNativeLangRow(it);
        return;
      }
      /* Auto-translate parent never receives a language check; its chevron stays. */
      if (isAutoXlItem(it) && !inXl) {
        restoreNativeLangRow(it);
        return;
      }
      if (isOffItem(it)) {
        restoreNativeLangRow(it);
        return;
      }
      const code = codeFromItem(it);
      if (!code) {
        restoreNativeLangRow(it);
        return;
      }
      const token = inXl ? "tlang:" + code : code;
      const slot = Dual.slotOf(selectedLangs, token);
      setClass(it, "qt-dual-lang", true);
      setAttr(it, "data-qt-slot", slot >= 0 ? String(slot) : null);
      if (slot >= 0) ensureDualCheck(it, nativeCheck);
      else removeDualCheck(it);
    });
  }

  function bindLangClicks(menu) {
    const root =
      menu.closest(".ytp-settings-menu") ||
      menu.closest(".ytp-popup") ||
      menu;
    if (root.dataset.qtLangBound) return;
    root.dataset.qtLangBound = "1";
    root.addEventListener(
      "click",
      (e) => {
        const it = e.target.closest(
          ".ytp-menuitem, [role='menuitem'], [role='menuitemradio']",
        );
        if (!it || !root.contains(it)) return;
        if (it.hasAttribute("data-qt-cap")) return;
        const panel = it.closest(".ytp-panel") || menu;
        if (!isCaptionsPanel(panel) && !isAutoXlPanel(panel)) return;
        const xl = isAutoXlPanel(panel);
        if (isAutoXlItem(it) && !xl) return;
        if (isOffItem(it)) {
          /* Visibility is independent from the saved language choice. */
          persistCaptionsEnabled(false);
          return;
        }
        const code = codeFromItem(it);
        if (!code) return;
        const token = xl ? "tlang:" + code : code;
        if (!dualOn) {
          /* Keep the native click and update only the primary vacancy. A
             saved secondary survives while Dual is off, unless the new
             primary is the same base language. */
          const current = Dual.normalizeSlots(selectedLangs);
          const pair = [token, current[1] || ""];
          if (pair[1] && Dual.langBase(pair[1]) === Dual.langBase(token))
            pair[1] = "";
          selectedLangs = Dual.normalizeSlots(pair);
          persistSelected();
          persistDisplayCaption(displayDescriptor(code, xl));
          persistCaptionsEnabled(true);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const before = Dual.normalizeSlots(selectedLangs);
        const next = Dual.selectLang(before, token);
        if (JSON.stringify(next) === JSON.stringify(before)) return;
        selectedLangs = next;
        persistSelected();
        paintOpenLangPanels();
      },
      true,
    );
  }

  /* Same left inset as Off (icon column). Do not center, do not
     display:flex the row (that wraps language names and hides the switch). */
  function pinCapToggleLayout(row, offItem) {
    if (!row) return;
    const icon = row.querySelector(".ytp-menuitem-icon");
    const lab = row.querySelector(".ytp-menuitem-label");
    const content = row.querySelector(".ytp-menuitem-content");
    const sw = row.querySelector(".ytp-menuitem-toggle-checkbox");
    const offIcon = offItem && offItem.querySelector(".ytp-menuitem-icon");
    const offLab = offItem && offItem.querySelector(".ytp-menuitem-label");
    let iconW = 0;
    if (offIcon) {
      iconW = offIcon.getBoundingClientRect().width;
      if (!(iconW >= 20 && iconW <= 56)) {
        iconW = parseFloat(getComputedStyle(offIcon).width) || 0;
      }
    }
    if (!(iconW >= 20 && iconW <= 56)) iconW = 24;
    if (icon) {
      icon.style.setProperty("width", Math.round(iconW) + "px", "important");
      icon.style.setProperty("min-width", Math.round(iconW) + "px", "important");
    }
    if (lab && offLab) {
      const pl = getComputedStyle(offLab).paddingLeft;
      if (pl && pl !== "0px") lab.style.paddingLeft = pl;
    }
    if (content && sw && sw.parentElement !== content) content.appendChild(sw);
    if (content) {
      content.style.minWidth = "40px";
      content.style.overflow = "visible";
    }
  }

  function alignToggleLabels(menu) {
    if (!menu) return;
    const offItem = items(menu).find(isOffItem);
    menu.querySelectorAll("[data-qt-cap]").forEach((row) => {
      pinCapToggleLayout(row, offItem);
    });
  }

  let captionPanelFit = null;
  const FIT_PROPS = ["height", "max-height", "overflow-y"];
  const fitStyleEchoes = new WeakMap();

  function inlineSnapshot(el) {
    const out = {};
    FIT_PROPS.forEach((property) => {
      out[property] = {
        value: el.style.getPropertyValue(property),
        priority: el.style.getPropertyPriority(property),
      };
    });
    return out;
  }

  function setFitStyle(state, el, property, value, priority) {
    if (!state || !el) return;
    const nextPriority = priority || "";
    if (
      el.style.getPropertyValue(property) !== value ||
      el.style.getPropertyPriority(property) !== nextPriority
    )
      el.style.setProperty(property, value, nextPriority);
    let byProperty = state.applied.get(el);
    if (!byProperty) {
      byProperty = new Map();
      state.applied.set(el, byProperty);
    }
    byProperty.set(property, {
      el,
      property,
      value,
      priority: nextPriority,
    });
    fitStyleEchoes.set(el, el.style.cssText);
  }

  function restoreFitElement(state, el, snapshot) {
    if (!el || !snapshot) return;
    FIT_PROPS.forEach((property) => {
      const applied = state.applied.get(el)?.get(property);
      if (!applied) return;
      /* A host write after our fit wins. Never restore over new YouTube state. */
      if (
        el.style.getPropertyValue(property) !== applied.value ||
        el.style.getPropertyPriority(property) !== applied.priority
      )
        return;
      const original = snapshot[property];
      if (original.value)
        el.style.setProperty(property, original.value, original.priority);
      else el.style.removeProperty(property);
    });
    fitStyleEchoes.set(el, el.style.cssText);
  }

  function clearCaptionPanelFit() {
    const state = captionPanelFit;
    if (!state) return;
    captionPanelFit = null;
    restoreFitElement(state, state.popup, state.original.popup);
    restoreFitElement(state, state.panel, state.original.panel);
    restoreFitElement(state, state.menu, state.original.menu);
  }

  function prepareCaptionPanelFit(root, menu) {
    const panel = root.closest?.(".ytp-panel") || root;
    const popup = panel.closest?.(".ytp-popup.ytp-settings-menu, .ytp-settings-menu");
    if (!popup || !panel || !menu) return null;
    if (
      captionPanelFit &&
      captionPanelFit.popup === popup &&
      captionPanelFit.panel === panel &&
      captionPanelFit.menu === menu
    ) {
      if (!captionPanelFit.needsRefresh) return captionPanelFit;
      clearCaptionPanelFit();
    }
    clearCaptionPanelFit();
    captionPanelFit = {
      popup,
      panel,
      menu,
      basePopupHeight: popup.getBoundingClientRect().height,
      basePanelHeight: panel.getBoundingClientRect().height,
      baseMenuHeight: menu.clientHeight,
      original: {
        popup: inlineSnapshot(popup),
        panel: inlineSnapshot(panel),
        menu: inlineSnapshot(menu),
      },
      applied: new Map(),
      needsRefresh: false,
    };
    return captionPanelFit;
  }

  function applyCaptionPanelFit(root, menu) {
    const state = prepareCaptionPanelFit(root, menu);
    if (!state || !menu.querySelector("[data-qt-cap]")) return;
    const addedHeight = Array.from(menu.querySelectorAll("[data-qt-cap]")).reduce(
      (sum, row) => sum + row.getBoundingClientRect().height,
      0,
    );
    if (!(addedHeight > 0)) return;
    const popupRect = state.popup.getBoundingClientRect();
    const playerRect =
      activePlayer()?.getBoundingClientRect?.() ||
      ({ top: 0, bottom: Number(window.innerHeight) || popupRect.bottom });
    const viewportBottom = Number(window.innerHeight) || playerRect.bottom;
    const anchorBottom = Math.min(popupRect.bottom, playerRect.bottom, viewportBottom);
    const topLimit = Math.max(playerRect.top, 0) + 8;
    const limitHeight = Math.max(0, anchorBottom - topLimit);
    const room = Math.max(0, limitHeight - state.basePopupHeight);
    const grow = Math.min(addedHeight, room);
    const popupHeight = state.basePopupHeight + grow;
    const panelHeight = state.basePanelHeight + grow;
    const menuHeight = state.baseMenuHeight + grow;
    const px = (value) => Math.max(0, Math.round(value)) + "px";

    setFitStyle(state, state.popup, "height", px(popupHeight), "important");
    setFitStyle(state, state.popup, "max-height", px(popupHeight), "important");
    setFitStyle(state, state.panel, "height", px(panelHeight), "important");
    setFitStyle(state, state.panel, "max-height", px(panelHeight), "important");
    setFitStyle(state, state.menu, "height", px(menuHeight), "important");
    setFitStyle(state, state.menu, "max-height", px(menuHeight), "important");
    if (grow + 0.5 < addedHeight)
      setFitStyle(state, state.menu, "overflow-y", "auto", "important");
  }

  let captionFitResizeQueued = false;
  function refreshCaptionPanelFit() {
    const state = captionPanelFit;
    if (!state) return;
    const panel = state.panel;
    const menu = state.menu;
    const popup = state.popup;
    clearCaptionPanelFit();
    if (
      popup?.isConnected &&
      panel?.isConnected &&
      menu?.isConnected &&
      menuElementIsOpen(popup) &&
      isCaptionsPanel(panel) &&
      menu.querySelector("[data-qt-cap]")
    )
      applyCaptionPanelFit(panel, menu);
  }

  /* Rows are built once and then reused for the life of the panel. Their
     visible state must therefore be re-applied from the live preference on
     every pass: otherwise a value changed in another tab leaves the row
     showing a stale state and the next click writes that stale state back,
     and a row built while no ASR existed stays disabled after the
     auto-generated track arrives. */
  function capToggleValue(key) {
    if (key === "qt_dualCaptions") return dualOn;
    if (key === "qt_wordHighlight") return highlightOn;
    if (key === "qt_centerWord") return centerOn;
    return null;
  }

  function syncCaptionToggles(menu) {
    menu.querySelectorAll("[data-qt-cap]").forEach((row) => {
      const key = row.getAttribute("data-qt-cap");
      const stored = capToggleValue(key);
      if (stored === null) return;
      const blocked = needsAsr(key) && !asrRhythm();
      const on = !!stored && !blocked;
      setAttr(row, "aria-checked", on ? "true" : "false");
      setClass(row, "qt-cap-disabled", blocked);
      setAttr(row, "aria-disabled", blocked ? "true" : null);
      setAttr(row, "title", blocked ? NO_ASR_HINT : null);
      const shortsSwitch = row.querySelector(".qt-shorts-cap-switch");
      if (shortsSwitch) {
        setClass(shortsSwitch, "on", on);
        setAttr(shortsSwitch, "aria-checked", on ? "true" : "false");
      }
    });
  }

  /* The host can make the settings popup transiently report hidden while it
     reuses the same DOM for root -> captions. If ASR adoption lands in that
     window, the one-shot qt-cues handler is allowed to miss its full patch,
     leaving already-connected rows disabled even though the rhythm engine is
     live (numeric WPM and word paint are the visible contradiction). Reconcile
     the existing rows from QuietTube's live authority on the normal Toolkit
     frame too. Attribute/class helpers above make the steady state a no-op. */
  function syncOpenCaptionToggleState(discover) {
    /* A Shorts sheet can close by hiding an ancestor while leaving the menu
       node itself connected. Its subtree observer cannot see that ancestor
       style change, so release it from the normal Toolkit frame instead of
       retaining a dormant observer for the lifetime of the Shorts feed. */
    if (menuObs?._root && !menuElementIsOpen(menuObs._root))
      detachMenuObserver();
    const shortsMenu = shortsCaptionMenu(discover !== false);
    if (shortsMenu?.querySelector("[data-qt-cap]"))
      syncCaptionToggles(shortsMenu);
    const observedClassic =
      menuObs?._root?.matches?.(".ytp-settings-menu, .ytp-popup.ytp-settings-menu") &&
      menuElementIsOpen(menuObs._root)
        ? menuObs._root
        : null;
    const root =
      observedClassic ||
      (discover === false ? null : menuIsOpen() ? settingsMenu() : null);
    if (root) {
      root?.querySelectorAll(".ytp-panel").forEach((panel) => {
        if (!isCaptionsPanel(panel)) return;
        const menu = panel.querySelector(".ytp-panel-menu") || panel;
        if (menu.querySelector("[data-qt-cap]")) syncCaptionToggles(menu);
      });
    }
  }

  function injectCaptionsToggles(root) {
    if (!isCaptionsPanel(root)) return;
    const menu =
      root.querySelector(".ytp-panel-menu") ||
      root.querySelector(".ytp-panel") ||
      root;
    if (menu.querySelector("[data-qt-cap]")) {
      syncCaptionToggles(menu);
      alignToggleLabels(menu);
      applyCaptionPanelFit(root, menu);
      return;
    }

    const offItem = items(menu).find(isOffItem);

    const applyToggles = (s) => {
        if (!isCaptionsPanel(root)) return;
        if (menu.querySelector("[data-qt-cap]")) return;
        prepareCaptionPanelFit(root, menu);
        const Prefs = globalThis.YtToolkitPrefs;
        const b = Prefs ? Prefs.bool : (v, d) => (v === true || v === false ? v : d);
        const dual = makeToggle(
          "qt_dualCaptions",
          "Dual subtitles",
          b(s.qt_dualCaptions, false),
          offItem,
        );
        const hi = makeToggle(
          "qt_wordHighlight",
          "Color highlight",
          b(s.qt_wordHighlight, true),
          offItem,
        );
        const ctr = makeToggle(
          "qt_centerWord",
          "Center word",
          b(s.qt_centerWord, false),
          offItem,
        );
        const frag = document.createDocumentFragment();
        frag.appendChild(dual);
        frag.appendChild(hi);
        frag.appendChild(ctr);
        if (offItem && offItem.parentNode) {
          offItem.parentNode.insertBefore(frag, offItem.nextSibling);
        } else {
          menu.appendChild(frag);
        }
        requestAnimationFrame(() => {
          alignToggleLabels(menu);
          applyCaptionPanelFit(root, menu);
        });
    };
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs)
      Prefs.get(["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord"], applyToggles);
    else
      chrome.storage.sync.get(
        ["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord"],
        applyToggles,
      );
  }

  function injectShortsCaptionToggles(menu) {
    if (!isShortsCaptionMenu(menu, true)) return;
    /* Dual remains a saved /watch preference, but never appears or activates
       on Shorts. Do not clear that preference when adapting the host sheet. */
    menu
      .querySelectorAll("[data-qt-cap='qt_dualCaptions']")
      .forEach((row) => row.remove());
    if (menu.querySelector("[data-qt-cap]")) {
      syncCaptionToggles(menu);
      return;
    }
    const nativeRows = shortsRows(menu).filter(
      (row) => !row.hasAttribute("data-qt-cap"),
    );
    const offItem = nativeRows.find((row) => OFF_LABELS.includes(shortsRowLabel(row)));
    if (!offItem || !offItem.parentNode) return;

    const applyToggles = (stored) => {
      if (!menu.isConnected || !isShortsCaptionMenu(menu, true)) return;
      if (menu.querySelector("[data-qt-cap]")) {
        syncCaptionToggles(menu);
        return;
      }
      const Prefs = globalThis.YtToolkitPrefs;
      const bool = Prefs
        ? Prefs.bool
        : (value, fallback) =>
            value === true || value === false ? value : fallback;
      const fragment = document.createDocumentFragment();
      fragment.appendChild(
        makeShortsToggle(
          "qt_wordHighlight",
          "Color highlight",
          bool(stored.qt_wordHighlight, true),
          offItem,
        ),
      );
      fragment.appendChild(
        makeShortsToggle(
          "qt_centerWord",
          "Center word",
          bool(stored.qt_centerWord, false),
          offItem,
        ),
      );
      offItem.after(fragment);
      syncCaptionToggles(menu);
    };
    const Prefs = globalThis.YtToolkitPrefs;
    if (Prefs)
      Prefs.get(["qt_wordHighlight", "qt_centerWord"], applyToggles);
    else
      chrome.storage.sync.get(
        ["qt_wordHighlight", "qt_centerWord"],
        applyToggles,
      );
  }

  function scrub() {
    document.querySelectorAll("[data-qt-cap]").forEach((el) => {
      const shortsMenu = el.closest("[role='menu']");
      if (shortsMenu && isShortsCaptionMenu(shortsMenu, true)) return;
      const panel = el.closest(".ytp-panel") || el.parentElement;
      if (!isCaptionsPanel(panel)) {
        if (captionPanelFit?.panel === panel) clearCaptionPanelFit();
        el.remove();
      }
    });
  }

  function menuElementIsOpen(m) {
    if (!m) return false;
    if (m.hasAttribute("hidden")) return false;
    if (m.getAttribute("aria-hidden") === "true") return false;
    const st = getComputedStyle(m);
    if (st.display === "none" || st.visibility === "hidden") return false;
    /* A descendant of display:none keeps its own computed display:block. Only
       rendered geometry distinguishes that retained/miniplayer menu from the
       popup the user can actually see. */
    if (!m.getClientRects().length) return false;
    const rect = m.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    const vw = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
    const vh = Number(window.innerHeight) || Number.POSITIVE_INFINITY;
    return rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
  }

  function settingsMenu() {
    const menus = Array.from(
      document.querySelectorAll(".ytp-popup.ytp-settings-menu, .ytp-settings-menu"),
    );
    /* YouTube may retain a hidden menu from another player/miniplayer before
       the active popup in DOM order. Selecting it made every open-state check
       false and permanently skipped the visible caption rows. */
    const player = activePlayer();
    const scoped = player ? menus.filter((menu) => player.contains(menu)) : [];
    return (
      scoped.find(menuElementIsOpen) ||
      menus.find(menuElementIsOpen) ||
      scoped[0] ||
      menus[0] ||
      null
    );
  }

  function menuIsOpen() {
    return menuElementIsOpen(settingsMenu());
  }

  function anyCaptionMenuIsOpen() {
    return menuIsOpen() || !!shortsCaptionMenu();
  }

  /* A record we caused ourselves (our injected rows, or our paint attributes
     on a native row) must not schedule another pass. */
  function ownNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.hasAttribute("data-qt-cap") || node.hasAttribute("data-qt-2nd")) return true;
    return !!(node.closest && node.closest("[data-qt-cap], [data-qt-2nd]"));
  }

  function isHostMutation(record) {
    const target =
      record.target && record.target.nodeType === 1
        ? record.target
        : record.target && record.target.parentElement;
    if (target && ownNode(target)) return false;
    if (record.type === "attributes") {
      if (record.attributeName === "data-qt-slot") return false;
      if (record.attributeName === "style" && target) {
        /* MutationObserver delivers a batch after all of our fit writes. The
           exact final cssText identifies that batch without masking a later
           host write to any property on the same element. */
        if (fitStyleEchoes.get(target) === target.style.cssText) return false;
        if (captionPanelFit?.applied.has(target))
          captionPanelFit.needsRefresh = true;
      }
      return true;
    }
    if (record.type === "childList") {
      const touched = [...record.addedNodes, ...record.removedNodes];
      if (touched.length && touched.every(ownNode)) return false;
      return true;
    }
    return true;
  }

  /* YouTube reuses one panel for Subtitles/CC and Auto-translate: it swaps the
     row list first and renames the title only afterwards. Acting on the
     in-between state injected three toggles and tore them out ~143 ms later
     (measured 0 -> 3 -> 0). Wait for a panel to hold one identity for
     STABLE_MS before injecting into it or removing from it. */
  const STABLE_MS = 160;
  const panelState = new WeakMap();

  function panelIdentity(panel) {
    const headerEl = panel.querySelector(
      ".ytp-panel-header, .ytp-panel-title, .ytp-menuitem-header",
    );
    const labels = items(panel)
      .filter((it) => !it.hasAttribute("data-qt-cap"))
      .map((it) => norm(it.querySelector(".ytp-menuitem-label")?.textContent))
      .join("|");
    return (
      (isCaptionsPanel(panel) ? "cap" : isAutoXlPanel(panel) ? "xl" : "other") +
      "\u0000" +
      norm(headerEl?.textContent) +
      "\u0000" +
      labels
    );
  }

  /* True once this panel has shown the same identity for STABLE_MS. Any change
     restarts the window, so a transition never gets acted on. */
  function panelIsStable(panel) {
    const sig = panelIdentity(panel);
    const now = Date.now();
    const prev = panelState.get(panel);
    if (!prev || prev.sig !== sig) {
      panelState.set(panel, { sig, since: now });
      /* Re-check after the window so a panel that goes quiet is still picked
         up without waiting for another host mutation. */
      setTimeout(() => {
        if (menuIsOpen()) schedulePatch();
      }, STABLE_MS + 20);
      return false;
    }
    return now - prev.since >= STABLE_MS;
  }

  function patch() {
    if (!anyCaptionMenuIsOpen()) return;
    scrub();
    const shortsMenu = shortsCaptionMenu();
    if (shortsMenu) injectShortsCaptionToggles(shortsMenu);
    if (
      captionPanelFit &&
      (!isCaptionsPanel(captionPanelFit.panel) ||
        !captionPanelFit.menu.querySelector("[data-qt-cap]"))
    )
      clearCaptionPanelFit();
    if (menuIsOpen()) {
      document
        .querySelectorAll(
          ".ytp-popup.ytp-settings-menu .ytp-panel, .ytp-settings-menu .ytp-panel",
        )
        .forEach((panel) => {
          /* hideSpeed is identity-safe and must stay immediate: the native
             Playback speed row may never be visible, even for a frame. */
          hideSpeed(panel);
          const menu = panel.querySelector(".ytp-panel-menu") || panel;
          /* Injecting or removing our rows waits for the panel to settle. */
          if (panelIsStable(panel)) {
            injectCaptionsToggles(panel);
            menu.querySelectorAll("[data-qt-2nd]").forEach((el) => el.remove());
          }
          if (isCaptionsPanel(panel) || isAutoXlPanel(panel)) {
            bindLangClicks(menu);
            paintLangChecks(menu);
            if (menu.querySelector("[data-qt-cap]")) alignToggleLabels(menu);
          }
        });
    }
  }

  let patchQueued = false;
  function schedulePatch() {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      setTimeout(() => {
        patchQueued = false;
        if (anyCaptionMenuIsOpen()) patch();
      }, 40);
    });
  }

  function retryAttach() {
    [0, 60, 160, 320].forEach((delay) => {
      setTimeout(() => {
        attachMenuObserver();
        if (anyCaptionMenuIsOpen()) patch();
      }, delay);
    });
  }

  let menuObs = null;

  function detachMenuObserver() {
    if (menuObs) menuObs.disconnect();
    menuObs = null;
    clearCaptionPanelFit();
  }

  function attachMenuObserver() {
    const classic = settingsMenu();
    const m = menuElementIsOpen(classic) ? classic : shortsCaptionMenu();
    if (!m || !menuElementIsOpen(m)) {
      detachMenuObserver();
      return;
    }
    if (menuObs && menuObs._root === m) {
      schedulePatch();
      return;
    }
    detachMenuObserver();
    nativeCheckTemplate = null;
    m.querySelectorAll(".qt-dual-lang").forEach(restoreNativeLangRow);
    menuObs = new MutationObserver((records) => {
      if (!menuElementIsOpen(m)) {
        detachMenuObserver();
        if (anyCaptionMenuIsOpen()) retryAttach();
        return;
      }
      if (!records.some(isHostMutation)) return;
      schedulePatch();
    });
    menuObs._root = m;
    /* "class" is our own paint surface (qt-dual-lang / qt-cap-disabled), so
       observing it fed the patch its own writes. characterData is required
       because YouTube renames the reused panel title in place, which is
       otherwise invisible here. */
    menuObs.observe(m, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "hidden", "aria-hidden"],
    });
    patch();
  }

  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      const cc =
        t &&
        t.closest &&
        t.closest(
          ".ytp-subtitles-button, button.ytp-button[aria-label*=ubtitle i], " +
            "button.ytp-button[aria-label*=egend i], ytm-closed-captioning-button button",
        );
      if (cc && e.isTrusted && !ccRestoring) {
        observeCaptionIntent(cc, ccState(cc));
      }
      requestAnimationFrame(() => {
        if (
          t &&
          t.closest &&
          (t.closest(".ytp-settings-button") ||
            t.closest(".ytp-settings-menu") ||
            (isShortsPage() &&
              t.closest(
                "[role='menu'], [role='menuitem'], [role='menuitemradio'], " +
                  "button[aria-label*='More actions' i], button[aria-label*='Captions' i]",
              )))
        ) {
          retryAttach();
        } else if (!anyCaptionMenuIsOpen()) {
          detachMenuObserver();
        }
      });
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (String(e.key || "").toLowerCase() !== "c") return;
      const target = e.target;
      const tag = (target && target.tagName) || "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target && target.isContentEditable)
      )
        return;
      const button = ccButton();
      if (!button) return;
      /* Do not consume YouTube's shortcut. Observe its actual result and make
         that trusted choice the new cross-video preference. */
      observeCaptionIntent(button, ccState(button));
    },
    true,
  );

  document.addEventListener("yt-navigate-finish", () => {
    invalidateActivePlayer();
    detachMenuObserver();
    nativeCheckTemplate = null;
    observedCaptionButton = null;
    scheduleCaptionsRestore();
    scheduleDisplayRestore();
  });

  document.addEventListener("qt-tracks", scheduleDisplayRestore);
  /* Adopting an ASR source re-arms Color highlight / Center word. */
  document.addEventListener("qt-cues", () => {
    syncOpenCaptionToggleState();
    if (anyCaptionMenuIsOpen()) schedulePatch();
  });
  document.addEventListener("qt-toolkit-frame", () => {
    reconcileCaptionButton();
    /* Discovery is driven by the user's menu click / observer lifecycle.
       A steady playback frame only reconciles a menu we already own. */
    syncOpenCaptionToggleState(false);
  });
  window.addEventListener("resize", () => {
    if (!captionPanelFit || captionFitResizeQueued) return;
    captionFitResizeQueued = true;
    requestAnimationFrame(() => {
      captionFitResizeQueued = false;
      refreshCaptionPanelFit();
    });
  });

  let bootTries = 0;
  function boot() {
    attachMenuObserver();
    if (document.querySelector("#movie_player, .html5-video-player")) {
      scheduleCaptionsRestore();
      retryAttach();
      return;
    }
    if (bootTries++ < 40) setTimeout(boot, 250);
  }
  boot();
})();
