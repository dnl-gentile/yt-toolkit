/* Allow-listed Video.js adapter for UNIP course players. */
(function () {
  const isFixture = document.documentElement?.hasAttribute("data-qt-videojs-fixture");
  if (location.hostname !== "tvweb3.unip.br" && !isFixture) return;
  if (globalThis.__ytToolkitVideoJsAdapter) return;
  globalThis.__ytToolkitVideoJsAdapter = true;

  const Core = globalThis.YtToolkitVideoJs;
  const Clock = globalThis.YtToolkitClock;
  const Prefs = globalThis.YtToolkitPrefs;
  if (!Core || !Clock) return;

  const SOURCE_MAIN = "quiettube-videojs-main";
  const SOURCE_ISOLATED = "quiettube-videojs-isolated";
  const CHANNEL_ID = crypto.randomUUID();
  const PRESETS = [1, 1.25, 1.5, 2, 3];
  const MAX_BRIDGE_PAYLOAD_BYTES = 360000;
  const MAX_BRIDGE_TRACKS = 32;
  const MAX_BRIDGE_CUES = 4000;
  const DISCOVERY_TTL_MS = 15000;
  const BRIDGE_MIN_GAP_MS = 100;
  const BRIDGE_REQUEST_TIMEOUT_MS = 1200;
  const WORD_TIMING_HINT =
    "This course player supplies sentence timing, not per-word timing. " +
    "The saved preference is preserved and will only activate with real word timestamps.";
  const ICO = {
    speed:
      '<svg class="qt-vjs-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19a8 8 0 1 0-7.3-11.7"/><path d="M12 12l3.8-3.2"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/></svg>',
    lock:
      '<svg class="qt-vjs-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-9-2a3 3 0 0 1 6 0v2H9V6Zm9 14H6V10h12v10Z"/></svg>',
    cut:
      '<svg class="qt-vjs-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.64 7.64A4 4 0 1 0 7.64 9.64L10 12l-2.36 2.36A4 4 0 1 0 9.64 16.36L12 14l7 7h3v-1L9.64 7.64ZM6 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm6-7.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1ZM19 3l-6 6 2 2 7-7V3h-3Z"/></svg>',
    check:
      '<svg class="qt-vjs-check" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  };

  const state = {
    root: null,
    video: null,
    controlBar: null,
    cluster: null,
    menu: null,
    clock: null,
    captions: null,
    tracks: [],
    primary: "",
    secondary: "",
    preferredPrimary: "",
    preferredSecondary: "",
    userEditedSlots: false,
    slotsChosen: false,
    dualWanted: false,
    userRate: 1,
    hold1x: false,
    hold1xFrom: 1,
    prefsReady: false,
    menuOpen: false,
    menuOpening: false,
    rateWriteUntil: 0,
    rateWriteValue: 1,
    captionCommandSig: "",
    rootObserver: null,
    resizeObserver: null,
    listenerAbort: null,
    externalRateTimer: 0,
    rangeActive: false,
    rangeFixed1xWasOn: false,
    rangeStartRate: 1,
    rangeDirty: false,
    menuNeedsRender: false,
    nativeRateIntentUntil: 0,
    cueRetryToken: 0,
    bridgeGeneration: 0,
    parentObserver: null,
    discoveryObserver: null,
    discoveryTimer: 0,
    bridgeTimer: 0,
    pendingBridgeRaw: "",
    lastBridgeRaw: "",
    bridgeRequestId: "",
    bridgeRequestAt: -Infinity,
    bridgeRequestTimer: 0,
    bridgeResponseReserved: false,
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function send(type, value) {
    globalThis.postMessage(
      {
        source: SOURCE_ISOLATED,
        type,
        channel: CHANNEL_ID,
        payload: value === undefined ? "" : JSON.stringify(value),
      },
      "*",
    );
  }

  function requestTracks() {
    const now = performance.now();
    const wait = Math.max(
      0,
      BRIDGE_REQUEST_TIMEOUT_MS - (now - state.bridgeRequestAt),
    );
    if (wait > 0) {
      if (!state.bridgeRequestTimer)
        state.bridgeRequestTimer = setTimeout(() => {
          state.bridgeRequestTimer = 0;
          requestTracks();
        }, wait);
      return;
    }
    state.bridgeRequestId = crypto.randomUUID();
    state.bridgeRequestAt = now;
    send("QT_VIDEOJS_REQUEST_TRACKS", { requestId: state.bridgeRequestId });
  }

  function dualActive() {
    return !!(
      state.dualWanted &&
      captionTrack(state.primary) &&
      captionTrack(state.secondary) &&
      state.primary !== state.secondary
    );
  }

  function nativeCaptionsOn() {
    return state.tracks.some(
      (track) => track.mode === "showing" || track.mode === "hidden",
    );
  }

  function dualReady() {
    if (!dualActive()) return false;
    return !!(
      captionTrack(state.primary)?.cues?.length &&
      captionTrack(state.secondary)?.cues?.length
    );
  }

  function persist(patch) {
    if (Prefs) Prefs.set(patch);
    else {
      try {
        chrome.storage.local.set(patch);
        chrome.storage.sync.set(patch);
      } catch {
        /* invalidated extension context */
      }
    }
  }

  function persistCaptionState() {
    persist({
      qt_vjs_dualCaptions: state.dualWanted,
      qt_vjs_primaryTrack: state.preferredPrimary,
      qt_vjs_secondaryTrack: state.preferredSecondary,
      qt_vjs_slotsChosen: state.slotsChosen,
    });
  }

  function nativePreferredLanguage() {
    const showing = state.tracks.find((track) => track.mode === "showing");
    if (showing) return showing.language;
    try {
      return localStorage.getItem("idioma") || "";
    } catch {
      return "";
    }
  }

  function reconcileTrackSlots() {
    const available = Core.availableLanguages(state.tracks);
    if (!available.length) return;
    if (state.userEditedSlots) return;
    if (!state.slotsChosen) {
      const slots = Core.reconcileSlots(
        { primary: "", secondary: state.secondary },
        state.tracks,
        nativePreferredLanguage(),
      );
      state.primary = slots.primary;
      state.secondary = slots.secondary;
      return;
    }
    const effective = Core.fillVacancies(
      {
        primary: state.preferredPrimary,
        secondary: state.preferredSecondary,
      },
      state.tracks,
    );
    state.primary = effective.primary;
    state.secondary = effective.secondary;
  }

  function syncCaptionBridge(forceNativeSelection) {
    if (!state.tracks.length) return;
    const primary = captionTrack(state.primary)?.language || "";
    const secondary = captionTrack(state.secondary)?.language || "";
    const configuredDual = !!(
      state.dualWanted && primary && secondary && primary !== secondary
    );
    const activateDual = configuredDual && (forceNativeSelection || nativeCaptionsOn());
    let command;
    if (activateDual) {
      command = {
        primary,
        secondary,
        dual: true,
        render: dualReady() && nativeCaptionsOn(),
      };
    } else if (forceNativeSelection && (primary || secondary)) {
      command = {
        primary: primary || secondary,
        secondary: "",
        dual: false,
        render: false,
      };
    } else {
      command = {
        primary: "",
        secondary: "",
        dual: false,
        render: false,
        preserve: true,
      };
    }
    const signature = JSON.stringify(command);
    if (signature === state.captionCommandSig) return;
    state.captionCommandSig = signature;
    if (command.primary) {
      try {
        localStorage.setItem("idioma", command.primary);
      } catch {
        /* storage denied */
      }
    }
    send("QT_VIDEOJS_CAPTION_MODE", command);
  }

  function captionTrack(language) {
    const normalized = Core.normalizeLanguage(language);
    return state.tracks.find((track) => track.language === normalized) || null;
  }

  function renderCaptions() {
    const layer = state.captions;
    const video = state.video;
    if (!layer || !video) return;
    const active = dualReady() && nativeCaptionsOn();
    state.root?.classList.toggle("qt-vjs-dual-active", active);
    layer.hidden = !active;
    if (!active) return;
    const time = Number(video.currentTime) || 0;
    const primary = Core.cueAt(captionTrack(state.primary)?.cues, time);
    const secondary = Core.cueAt(captionTrack(state.secondary)?.cues, time);
    const primaryLine = layer.querySelector(".qt-vjs-caption-primary");
    const secondaryLine = layer.querySelector(".qt-vjs-caption-secondary");
    setText(primaryLine, primary?.text || "");
    setText(secondaryLine, secondary?.text || "");
    primaryLine.hidden = !primary?.text;
    secondaryLine.hidden = !secondary?.text;
  }

  function effectiveRate() {
    if (state.hold1x) return 1;
    const live = Number(state.video?.playbackRate);
    return Number.isFinite(live) && live > 0.08 ? live : state.userRate;
  }

  function renderClock() {
    if (!state.clock || !state.video) return;
    const duration = Number(state.video.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      state.clock.hidden = true;
      state.root?.classList.remove("qt-vjs-clock-ready");
      return;
    }
    state.clock.hidden = false;
    state.root?.classList.add("qt-vjs-clock-ready");
    const adjusted = Core.adjustedTimes(state.video.currentTime, duration, effectiveRate());
    const html = Clock.clockHtml(adjusted.current, adjusted.duration, adjusted.original);
    if (state.clock.innerHTML !== html) state.clock.innerHTML = html;
    state.clock.title = state.clock.textContent || "";
  }

  function renderCluster() {
    if (!state.cluster) return;
    setText(state.cluster.querySelector(".qt-vjs-cluster-label"), Core.formatRate(effectiveRate()));
    state.cluster.classList.toggle("is-neutral", state.hold1x);
    syncVisibility();
  }

  function applyRate(value, options) {
    if (!state.video) return;
    const opts = options || {};
    const rate = Core.clamp(value, Core.RATE_MIN, Core.RATE_MAX);
    const exitsFixed1x = opts.exitNeutral !== false;
    if (exitsFixed1x) state.hold1x = false;
    state.rateWriteValue = rate;
    state.rateWriteUntil = performance.now() + 400;
    if (Math.abs((state.video.playbackRate || 1) - rate) > 0.005)
      state.video.playbackRate = rate;
    if (opts.persist !== false) {
      state.userRate = rate;
      const patch = { qt_playbackRate: rate };
      if (exitsFixed1x) patch.qt_fixed1x = false;
      persist(patch);
    }
    /* Keep the host's own restore path aligned with the saved custom profile.
       Fixed 1x has its own persisted preference and never replaces that rate. */
    try {
      if (opts.syncHostStorage !== false)
        localStorage.setItem(
          "videoPlaybackSpeed",
          String(opts.persist === false ? state.userRate : rate),
        );
    } catch {
      /* storage denied */
    }
    renderCluster();
    renderClock();
    if (opts.renderMenu !== false) refreshMenu();
  }

  function setFixed1x(on, options) {
    const opts = options || {};
    const next = !!on;
    if (next) {
      if (!state.hold1x)
        state.hold1xFrom = state.userRate || state.video?.playbackRate || 1;
      state.hold1x = true;
      if (state.video)
        applyRate(1, {
          persist: false,
          exitNeutral: false,
        });
    } else {
      const wasFixed = state.hold1x;
      state.hold1x = false;
      if (wasFixed && opts.restore !== false && state.video)
        applyRate(state.userRate || 1, {
          persist: false,
          exitNeutral: false,
        });
      else {
        renderCluster();
        renderClock();
        refreshMenu();
      }
    }
    if (opts.persist !== false) persist({ qt_fixed1x: next });
  }

  function toggleNeutral() {
    setFixed1x(!state.hold1x);
  }

  function nudgeRate(direction) {
    const base = state.hold1x ? state.userRate : state.userRate || effectiveRate();
    applyRate(Core.stepRate(base, direction));
  }

  function disabledRow(icon, label, hint) {
    return (
      '<div class="qt-vjs-row qt-vjs-row-disabled" aria-disabled="true" title="' +
      escapeHtml(hint) +
      '"><span class="qt-vjs-row-icon">' +
      icon +
      '</span><span class="qt-vjs-row-label">' +
      escapeHtml(label) +
      '</span><span class="qt-vjs-switch" aria-hidden="true"></span></div>'
    );
  }

  function dualRow() {
    const available = Core.availableLanguages(state.tracks);
    const disabled = available.length < 2;
    const hint = disabled ? "This player has fewer than two caption tracks loaded." : "";
    return (
      '<button type="button" class="qt-vjs-row qt-vjs-row-button' +
      (disabled ? " qt-vjs-row-disabled" : "") +
      '" data-action="dual" aria-disabled="' +
      disabled +
      '" title="' +
      escapeHtml(hint) +
      '"><span class="qt-vjs-row-label">Dual subtitles</span><span role="switch" aria-checked="' +
      dualActive() +
      '" class="qt-vjs-switch' +
      (dualActive() ? " is-on" : "") +
      '"></span></button>'
    );
  }

  function languageRows() {
    if (!state.tracks.length)
      return '<p class="qt-vjs-capability">Caption tracks will appear here after the player loads them.</p>';
    return (
      '<div class="qt-vjs-language-list" role="listbox" aria-label="Dual subtitle languages">' +
      state.tracks
        .map((track) => {
          const slot =
            track.language === state.primary
              ? "primary"
              : track.language === state.secondary
                ? "secondary"
                : "";
          return (
            '<button type="button" class="qt-vjs-language' +
            (slot ? " is-" + slot : "") +
            '" data-language="' +
            escapeHtml(track.language) +
            '" role="option" aria-selected="' +
            !!slot +
            '"><span class="qt-vjs-language-check">' +
            (slot ? ICO.check : "") +
            '</span><span class="qt-vjs-language-label">' +
            escapeHtml(track.label || track.language) +
            '</span></button>'
          );
        })
        .join("") +
      "</div>"
    );
  }

  function refreshMenu() {
    if (state.menuOpen) renderMenu();
  }

  function beginCueRetries() {
    if (!dualActive() || dualReady()) return;
    const token = ++state.cueRetryToken;
    for (const delay of [600, 1800, 4000, 8000, 15000, 30000]) {
      setTimeout(() => {
        if (token !== state.cueRetryToken || !dualActive() || dualReady()) return;
        requestTracks();
      }, delay);
    }
  }

  function renderMenu() {
    const menu = state.menu;
    if (!menu) return;
    if (state.rangeActive) {
      state.menuNeedsRender = true;
      return;
    }
    state.menuNeedsRender = false;
    const rate = effectiveRate();
    menu.innerHTML =
      '<div class="qt-vjs-menu-head">' +
      ICO.speed +
      '<span>Playback speed</span></div>' +
      '<p class="qt-vjs-menu-sub">' +
      Core.formatRate(rate) +
      '</p><div class="qt-vjs-rule"></div>' +
      '<p class="qt-vjs-big">' +
      Core.formatRate(rate) +
      '</p><div class="qt-vjs-slider-row">' +
      '<button type="button" class="qt-vjs-circle" data-action="rate-minus" aria-label="Decrease playback speed">−</button>' +
      '<input type="range" min="' +
      Core.RATE_MIN +
      '" max="' +
      Core.RATE_MAX +
      '" step="0.05" value="' +
      rate +
      '" data-action="rate-range" aria-label="Playback speed" aria-valuetext="' +
      Core.formatRate(rate) +
      '">' +
      '<button type="button" class="qt-vjs-circle" data-action="rate-plus" aria-label="Increase playback speed">+</button></div>' +
      '<div class="qt-vjs-presets">' +
      PRESETS.map(
        (preset) =>
          '<button type="button" class="qt-vjs-preset' +
          (Math.abs(rate - preset) < 0.02 ? " is-selected" : "") +
          '" data-rate="' +
          preset +
          '">' +
          Core.formatRate(preset) +
          "</button>",
      ).join("") +
      '</div><div class="qt-vjs-rule"></div>' +
      disabledRow(ICO.lock, "Pace lock", WORD_TIMING_HINT) +
      disabledRow(ICO.cut, "Trim silence", WORD_TIMING_HINT) +
      '<div class="qt-vjs-rule"></div><div class="qt-vjs-section-title">Captions</div>' +
      dualRow() +
      languageRows() +
      disabledRow("", "Color highlight", WORD_TIMING_HINT) +
      disabledRow("", "Center word", WORD_TIMING_HINT) +
      '<p class="qt-vjs-capability">Manual speed, adjusted time and cue-level Dual subtitles are available. Word-rhythm features stay off without authoritative word timestamps.</p>';

    menu.querySelector("[data-action='rate-minus']")?.addEventListener("click", () => nudgeRate(-1));
    menu.querySelector("[data-action='rate-plus']")?.addEventListener("click", () => nudgeRate(1));
    const range = menu.querySelector("[data-action='rate-range']");
    range?.addEventListener("pointerdown", () => {
      state.rangeFixed1xWasOn = state.hold1x;
      state.rangeStartRate = state.userRate;
      state.rangeDirty = false;
      state.rangeActive = true;
    });
    range?.addEventListener("input", (event) => {
      if (!state.rangeActive) {
        state.rangeFixed1xWasOn = state.hold1x;
        state.rangeStartRate = state.userRate;
      }
      state.rangeActive = true;
      state.rangeDirty = true;
      applyRate(Number(event.target.value), {
        persist: false,
        renderMenu: false,
        syncHostStorage: false,
      });
      event.target.setAttribute("aria-valuetext", Core.formatRate(event.target.value));
      setText(menu.querySelector(".qt-vjs-big"), Core.formatRate(event.target.value));
      setText(menu.querySelector(".qt-vjs-menu-sub"), Core.formatRate(event.target.value));
    });
    range?.addEventListener("change", (event) => {
      state.rangeActive = false;
      state.rangeFixed1xWasOn = false;
      state.rangeDirty = false;
      applyRate(Number(event.target.value));
    });
    range?.addEventListener("pointerup", (event) => {
      const value = Number(event.target.value);
      setTimeout(() => {
        if (!state.rangeActive) return;
        state.rangeActive = false;
        const changed = state.rangeDirty;
        state.rangeFixed1xWasOn = false;
        state.rangeDirty = false;
        if (changed) applyRate(value);
      }, 0);
    });
    range?.addEventListener("pointercancel", () => {
      const restoreFixed1x = state.rangeFixed1xWasOn;
      const restoreRate = state.rangeStartRate || state.userRate;
      state.rangeActive = false;
      state.rangeFixed1xWasOn = false;
      state.rangeDirty = false;
      if (restoreFixed1x) setFixed1x(true, { persist: false });
      else
        applyRate(restoreRate, {
          persist: false,
          exitNeutral: false,
        });
    });
    menu.querySelectorAll("[data-rate]").forEach((button) =>
      button.addEventListener("click", () => applyRate(Number(button.dataset.rate))),
    );
    menu.querySelector("[data-action='dual']")?.addEventListener("click", (event) => {
      if (event.currentTarget.getAttribute("aria-disabled") === "true") return;
      const turningOn = !dualActive();
      if (turningOn) {
        const filled = Core.fillVacancies(
          { primary: state.primary, secondary: state.secondary },
          state.tracks,
        );
        state.primary = filled.primary;
        state.secondary = filled.secondary;
        if (!state.preferredPrimary) state.preferredPrimary = state.primary;
        if (!state.preferredSecondary) state.preferredSecondary = state.secondary;
        state.userEditedSlots = true;
      }
      state.dualWanted = turningOn && !!state.primary && !!state.secondary;
      state.slotsChosen = true;
      persistCaptionState();
      syncCaptionBridge(true);
      if (state.dualWanted) beginCueRetries();
      renderMenu();
      renderCaptions();
    });
    menu.querySelectorAll("[data-language]").forEach((button) =>
      button.addEventListener("click", () => {
        const next = Core.selectLanguage(
          {
            primary: captionTrack(state.primary)?.language || "",
            secondary: captionTrack(state.secondary)?.language || "",
          },
          button.dataset.language,
          state.tracks,
        );
        if (next.primary === state.primary && next.secondary === state.secondary) return;
        state.primary = next.primary;
        state.secondary = next.secondary;
        state.preferredPrimary = state.primary;
        state.preferredSecondary = state.secondary;
        state.userEditedSlots = true;
        state.slotsChosen = true;
        if (!state.primary || !state.secondary) state.dualWanted = false;
        persistCaptionState();
        syncCaptionBridge(true);
        if (state.dualWanted) beginCueRetries();
        renderMenu();
        renderCaptions();
      }),
    );
  }

  function nativeMenuOpen() {
    const selectors = [
      "app-settings [aria-expanded='true']",
      "app-settings .vjs-menu-button-active",
      "app-settings .vjs-menu-content:not(.vjs-hidden)",
    ];
    return selectors.some((selector) => {
      const node = state.root?.querySelector(selector);
      return !!(node && node.getClientRects().length && getComputedStyle(node).display !== "none");
    });
  }

  function closeNativeMenu() {
    const button = state.root?.querySelector(
      "app-settings [aria-expanded='true'], app-settings .vjs-menu-button-active",
    );
    if (button && typeof button.click === "function") button.click();
  }

  function openMenu() {
    if (!state.menu || !state.root) return;
    if (state.menuOpening) return;
    const finish = (attempt) => {
      if (nativeMenuOpen()) {
        if (attempt >= 2) {
          state.menuOpening = false;
          return;
        }
        closeNativeMenu();
        setTimeout(() => finish(attempt + 1), 40);
        return;
      }
      state.menuOpening = false;
      state.menuOpen = true;
      state.menu.hidden = false;
      state.root.classList.add("qt-vjs-menu-open");
      const trigger = state.cluster?.querySelector(".qt-vjs-speed-button");
      trigger?.setAttribute("aria-expanded", "true");
      renderMenu();
      syncVisibility();
    };
    if (nativeMenuOpen()) {
      state.menuOpening = true;
      closeNativeMenu();
      setTimeout(() => finish(1), 40);
    } else finish(0);
  }

  function closeMenu(options) {
    if (!state.menu) return;
    state.menuOpening = false;
    if (state.rangeActive) {
      state.rangeActive = false;
      const live = effectiveRate();
      const changed = state.rangeDirty;
      state.rangeFixed1xWasOn = false;
      state.rangeDirty = false;
      if (changed) applyRate(live, { renderMenu: false });
    }
    state.menuOpen = false;
    state.menu.hidden = true;
    state.root?.classList.remove("qt-vjs-menu-open");
    state.cluster
      ?.querySelector(".qt-vjs-speed-button")
      ?.setAttribute("aria-expanded", "false");
    if (options?.focus) state.cluster?.querySelector(".qt-vjs-speed-button")?.focus();
    syncVisibility();
  }

  function syncVisibility() {
    if (!state.root || !state.cluster) return;
    const hidden =
      state.root.classList.contains("vjs-user-inactive") &&
      state.root.classList.contains("vjs-playing") &&
      !state.menuOpen;
    state.cluster.classList.toggle("qt-vjs-hidden", hidden);
    state.cluster.inert = hidden;
    state.cluster.setAttribute("aria-hidden", String(hidden));
    const button = state.cluster.querySelector(".qt-vjs-speed-button");
    if (button) button.tabIndex = hidden ? -1 : 0;
    if (hidden && state.menuOpen) closeMenu();
  }

  function syncHostMetrics() {
    if (!state.root || !state.controlBar) return;
    const rootRect = state.root.getBoundingClientRect();
    const barRect = state.controlBar.getBoundingClientRect();
    const barStyle = getComputedStyle(state.controlBar);
    const menuSurface = state.root.querySelector(".vjs-menu-content");
    const menuColor = menuSurface ? getComputedStyle(menuSurface).backgroundColor : "";
    const barHeight = Math.max(28, Math.min(44, barRect.height || 30));
    const captionSize = Math.max(16, Math.min(28, rootRect.height * 0.045));
    const surface =
      barStyle.backgroundColor && barStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
        ? barStyle.backgroundColor
        : "rgba(43, 51, 63, 0.88)";
    const menuPaint =
      menuColor && menuColor !== "rgba(0, 0, 0, 0)"
        ? menuColor
        : "rgba(43, 51, 63, 0.96)";
    const vars = {
      "--qt-vjs-control-height": barHeight.toFixed(2) + "px",
      "--qt-vjs-caption-size": captionSize.toFixed(2) + "px",
      "--qt-vjs-surface": surface,
      "--qt-vjs-menu-surface": menuPaint,
    };
    for (const [name, value] of Object.entries(vars)) {
      if (state.root.style.getPropertyValue(name) !== value)
        state.root.style.setProperty(name, value);
    }
    state.root.classList.toggle("qt-vjs-narrow", rootRect.width < 560);
  }

  function ensureClock() {
    if (!state.controlBar) return;
    let clock = state.controlBar.querySelector(".qt-vjs-clock");
    if (!clock) {
      clock = document.createElement("div");
      clock.className = "qt-vjs-clock vjs-control";
      clock.setAttribute("role", "timer");
      clock.setAttribute("aria-label", "Adjusted playback time");
      const volume = state.controlBar.querySelector(".vjs-volume-panel");
      if (volume?.nextSibling) state.controlBar.insertBefore(clock, volume.nextSibling);
      else state.controlBar.appendChild(clock);
    }
    state.clock = clock;
    renderClock();
  }

  function ensureUi() {
    if (!state.root) return;
    let cluster = state.root.querySelector(".qt-vjs-cluster");
    if (!cluster) {
      cluster = document.createElement("div");
      cluster.className = "qt-vjs-cluster";
      cluster.innerHTML =
        '<div class="qt-vjs-pill"><span class="qt-vjs-cluster-label">1x</span>' +
        '<button type="button" class="qt-vjs-speed-button" aria-label="Playback speed" aria-expanded="false" aria-controls="qt-vjs-menu">' +
        ICO.speed +
        "</button></div>";
      cluster.querySelector(".qt-vjs-speed-button").addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.menuOpen) closeMenu();
        else openMenu();
      });
      state.root.appendChild(cluster);
    }
    state.cluster = cluster;

    let menu = state.root.querySelector(".qt-vjs-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "qt-vjs-menu";
      menu.id = "qt-vjs-menu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", "Toolkit playback and captions");
      menu.hidden = true;
      menu.addEventListener("click", (event) => event.stopPropagation());
      state.root.appendChild(menu);
    }
    state.menu = menu;

    let captions = state.root.querySelector(".qt-vjs-captions");
    if (!captions) {
      captions = document.createElement("div");
      captions.className = "qt-vjs-captions";
      captions.hidden = true;
      captions.innerHTML =
        '<div class="qt-vjs-caption qt-vjs-caption-secondary" hidden></div>' +
        '<div class="qt-vjs-caption qt-vjs-caption-primary" hidden></div>';
      state.root.appendChild(captions);
    }
    state.captions = captions;
    ensureClock();
    renderCluster();
    renderCaptions();
  }

  function invalidateLocalMediaSnapshot() {
    state.tracks = [];
    state.captionCommandSig = "";
    state.cueRetryToken++;
    state.bridgeRequestId = "";
    state.bridgeResponseReserved = false;
    state.pendingBridgeRaw = "";
    clearTimeout(state.bridgeTimer);
    state.bridgeTimer = 0;
    state.lastBridgeRaw = "";
    state.root?.classList.remove("qt-vjs-dual-active");
    if (state.captions) state.captions.hidden = true;
    refreshMenu();
  }

  function nativeRateChoiceFromEvent(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    const rateValue = /(?:^|\s)\d+(?:[.,]\d+)?\s*x(?:\s|$)/i;
    const rateLabel =
      /\b(?:playback\s+speed|speed|rate|velocidade|velocidad|geschwindigkeit)\b/i;
    for (const node of path) {
      if (node?.nodeType !== 1) continue;
      if (node.tagName === "APP-SETTINGS") break;
      if (
        node.matches?.(
          "[data-playback-rate],[data-rate],[data-speed],.vjs-playback-rate,[class*='playback-rate'],[class*='playback-speed']",
        )
      )
        return true;
      const interactive = node.matches?.(
        "button,[role='button'],[role='menuitem'],[role='menuitemradio'],li",
      );
      if (!interactive) {
        if (rateValue.test(String(node.textContent || "").trim())) return true;
        continue;
      }
      const label = [
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      return rateValue.test(label) || (rateLabel.test(label) && /\d/.test(label));
    }
    return false;
  }

  function markNativeRateIntent(event) {
    if (nativeRateChoiceFromEvent(event))
      state.nativeRateIntentUntil = performance.now() + 1500;
  }

  function onRateChange() {
    if (!state.video) return;
    const live = Core.clamp(state.video.playbackRate || 1, Core.RATE_MIN, Core.RATE_MAX);
    let explicitNativeChoice = false;
    if (
      performance.now() <= state.rateWriteUntil &&
      Math.abs(live - state.rateWriteValue) < 0.005
    ) {
      renderCluster();
      renderClock();
      return;
    }
    if (state.hold1x) {
      if (Math.abs(live - 1) < 0.005) return;
      explicitNativeChoice = performance.now() <= state.nativeRateIntentUntil;
      state.nativeRateIntentUntil = 0;
      if (!explicitNativeChoice) {
        applyRate(1, { persist: false, exitNeutral: false });
        return;
      }
    }
    if (!state.hold1x && Math.abs(live - state.userRate) < 0.005) {
      renderCluster();
      renderClock();
      return;
    }
    state.hold1x = false;
    state.userRate = live;
    clearTimeout(state.externalRateTimer);
    if (explicitNativeChoice) {
      state.externalRateTimer = 0;
      try {
        localStorage.setItem("videoPlaybackSpeed", String(live));
      } catch {
        /* storage denied */
      }
      /* Persist before Angular/Video.js can replace the media root and cancel
         a deferred timer. The next adapter instance then hydrates this choice. */
      persist({ qt_playbackRate: live, qt_fixed1x: false });
      renderCluster();
      renderClock();
      refreshMenu();
      return;
    }
    state.externalRateTimer = setTimeout(() => {
      if (Math.abs((state.video?.playbackRate || 1) - live) < 0.005) {
        try {
          localStorage.setItem("videoPlaybackSpeed", String(live));
        } catch {
          /* storage denied */
        }
        persist({ qt_playbackRate: live, qt_fixed1x: false });
      }
    }, 160);
    renderCluster();
    renderClock();
    refreshMenu();
  }

  function attach(nextRoot) {
    if (!nextRoot) return false;
    const nextVideo = nextRoot.querySelector("video");
    const nextControlBar = nextRoot.querySelector(".vjs-control-bar");
    if (!nextVideo || !nextControlBar) return false;
    if (
      nextRoot === state.root &&
      nextVideo === state.video &&
      nextControlBar === state.controlBar
    )
      return true;
    state.listenerAbort?.abort();
    clearTimeout(state.externalRateTimer);
    state.externalRateTimer = 0;
    state.cueRetryToken++;
    state.rootObserver?.disconnect();
    state.parentObserver?.disconnect();
    state.resizeObserver?.disconnect();
    state.root = nextRoot;
    state.video = nextVideo;
    state.controlBar = nextControlBar;
    state.listenerAbort = new AbortController();
    const signal = state.listenerAbort.signal;
    state.root.classList.add("qt-host-videojs");
    ensureUi();
    invalidateLocalMediaSnapshot();
    state.video.addEventListener("timeupdate", () => {
      renderClock();
      renderCaptions();
    }, { signal });
    state.video.addEventListener("seeking", () => {
      renderClock();
      renderCaptions();
    }, { signal });
    state.video.addEventListener("loadedmetadata", () => {
      if (state.prefsReady)
        applyRate(state.hold1x ? 1 : state.userRate, {
          persist: false,
          exitNeutral: false,
        });
      renderClock();
      requestTracks();
    }, { signal });
    state.video.addEventListener("loadstart", () => {
      invalidateLocalMediaSnapshot();
      requestTracks();
    }, { signal });
    state.video.addEventListener("emptied", () => {
      invalidateLocalMediaSnapshot();
      requestTracks();
    }, { signal });
    state.video.addEventListener("durationchange", renderClock, { signal });
    state.video.addEventListener("ratechange", onRateChange, { signal });
    state.root.addEventListener(
      "click",
      (event) => {
        if (event.target.closest("app-settings") && state.menuOpen) closeMenu();
      },
      { capture: true, signal },
    );
    state.root.addEventListener("pointerdown", markNativeRateIntent, {
      capture: true,
      signal,
    });
    state.root.addEventListener("keydown", markNativeRateIntent, {
      capture: true,
      signal,
    });
    state.root.addEventListener(
      "focusin",
      (event) => {
        if (event.target.closest("app-settings") && state.menuOpen) closeMenu();
      },
      { capture: true, signal },
    );
    state.rootObserver = new MutationObserver((records) => {
      if (records.some((record) => record.type === "attributes")) syncVisibility();
      if (records.some((record) => record.type === "childList")) {
        const currentVideo = state.root?.querySelector("video");
        const currentBar = state.root?.querySelector(".vjs-control-bar");
        if (currentVideo && currentBar &&
            (currentVideo !== state.video || currentBar !== state.controlBar))
          attach(state.root);
      }
    });
    state.rootObserver.observe(state.root, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
    });
    const rootParent = state.root.parentNode;
    if (rootParent) {
      state.parentObserver = new MutationObserver((records) => {
        if (!state.root?.isConnected) {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (find(node, false)) return;
            }
          }
          startDiscovery();
        }
      });
      let ancestor = rootParent;
      let depth = 0;
      while (ancestor?.nodeType === 1 && depth < 8) {
        state.parentObserver.observe(ancestor, { childList: true });
        if (ancestor === document.body) break;
        ancestor = ancestor.parentNode;
        depth++;
      }
    }
    state.resizeObserver = new ResizeObserver(syncHostMetrics);
    state.resizeObserver.observe(state.root);
    state.resizeObserver.observe(state.controlBar);
    syncHostMetrics();
    requestTracks();
    if (state.prefsReady)
      applyRate(state.hold1x ? 1 : state.userRate, {
        persist: false,
        exitNeutral: false,
      });
    return true;
  }

  function isEditableShortcutTarget(event) {
    const nodes = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return nodes.some((node) => {
      if (!node || node.nodeType !== 1) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        node.isContentEditable ||
        node.getAttribute?.("role") === "textbox"
      );
    });
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (!state.video || !state.root?.isConnected || isEditableShortcutTarget(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key === "Escape" && state.menuOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu({ focus: true });
        return;
      }
      const neutral =
        (!event.shiftKey && (event.key === "a" || event.key === "A")) ||
        (event.shiftKey && event.code === "Backquote");
      if (neutral) {
        event.preventDefault();
        event.stopPropagation();
        toggleNeutral();
        return;
      }
      if (!event.shiftKey && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        event.stopPropagation();
        nudgeRate(-1);
        return;
      }
      if (!event.shiftKey && (event.key === "d" || event.key === "D")) {
        event.preventDefault();
        event.stopPropagation();
        nudgeRate(1);
      }
    },
    true,
  );

  document.addEventListener("click", (event) => {
    if (!state.menuOpen) return;
    if (event.target.closest?.(".qt-vjs-menu, .qt-vjs-cluster")) return;
    closeMenu();
  });

  function processBridgePayload(raw) {
    if (!raw || raw === state.lastBridgeRaw) return false;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.tracks))
      return false;
    state.lastBridgeRaw = raw;
    const nextGeneration = Math.max(0, Number(payload.generation) || 0);
    if (nextGeneration !== state.bridgeGeneration) {
      state.bridgeGeneration = nextGeneration;
      state.captionCommandSig = "";
      state.userEditedSlots = false;
    }
    const byLanguage = new Map();
    let cueBudget = MAX_BRIDGE_CUES;
    const incoming = Array.isArray(payload.tracks)
      ? payload.tracks.slice(0, MAX_BRIDGE_TRACKS)
      : [];
    for (const track of incoming) {
      if (!track || typeof track !== "object") continue;
      const language = Core.normalizeLanguage(track.language);
      if (!/^[a-z0-9-]{1,40}$/.test(language)) continue;
      const cues = [];
      if (Array.isArray(track.cues)) {
        for (const cue of track.cues) {
          if (cueBudget-- <= 0) break;
          const start = Number(cue?.start);
          const end = Number(cue?.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
          cues.push({
            start,
            end,
            text: String(cue?.text || "").slice(0, 1000),
          });
        }
      }
      const normalized = {
        id: String(track.id || language).slice(0, 120),
        language,
        label: String(track.label || language).slice(0, 160),
        mode: String(track.mode || "disabled").slice(0, 16),
        cueCount: Math.max(0, Number(track.cueCount) || cues.length),
        cues,
      };
      const previous = byLanguage.get(language);
      if (!previous || normalized.cues.length > previous.cues.length || normalized.mode === "showing")
        byLanguage.set(language, normalized);
    }
    state.tracks = Array.from(byLanguage.values());
    reconcileTrackSlots();
    syncCaptionBridge(false);
    if (dualReady()) state.cueRetryToken++;
    refreshMenu();
    renderCaptions();
    return true;
  }

  function flushBridgePayload() {
    state.bridgeTimer = 0;
    const raw = state.pendingBridgeRaw;
    state.pendingBridgeRaw = "";
    let accepted = false;
    try {
      accepted = processBridgePayload(raw);
    } catch {
      accepted = false;
    } finally {
      state.bridgeResponseReserved = false;
      if (!isFixture && !accepted) requestTracks();
    }
    if (state.pendingBridgeRaw && !state.bridgeTimer)
      state.bridgeTimer = setTimeout(flushBridgePayload, BRIDGE_MIN_GAP_MS);
  }

  globalThis.addEventListener("message", (event) => {
    if (event.source !== globalThis || event.data?.source !== SOURCE_MAIN) return;
    if (!isFixture && event.data.channel !== CHANNEL_ID) return;
    if (event.data.type === "QT_VIDEOJS_DIRTY") {
      requestTracks();
      return;
    }
    if (event.data.type !== "QT_VIDEOJS_TRACKS") return;
    if (!isFixture) {
      if (!state.bridgeRequestId || event.data.requestId !== state.bridgeRequestId) return;
      if (performance.now() - state.bridgeRequestAt > BRIDGE_REQUEST_TIMEOUT_MS) {
        state.bridgeRequestId = "";
        requestTracks();
        return;
      }
      if (state.bridgeResponseReserved) return;
      state.bridgeResponseReserved = true;
      state.bridgeRequestId = "";
    }
    const raw = typeof event.data.payload === "string" ? event.data.payload : "";
    if (
      !raw ||
      raw.length > MAX_BRIDGE_PAYLOAD_BYTES ||
      raw === state.lastBridgeRaw ||
      raw === state.pendingBridgeRaw
    ) {
      state.bridgeResponseReserved = false;
      if (!isFixture && raw !== state.lastBridgeRaw) requestTracks();
      return;
    }
    state.pendingBridgeRaw = raw;
    if (!state.bridgeTimer)
      state.bridgeTimer = setTimeout(flushBridgePayload, BRIDGE_MIN_GAP_MS);
  });

  const loadPrefs = (values) => {
    state.userRate = Core.clamp(Number(values.qt_playbackRate) || 1, Core.RATE_MIN, Core.RATE_MAX);
    state.hold1x = Prefs
      ? Prefs.bool(values.qt_fixed1x, false)
      : values.qt_fixed1x === true;
    state.hold1xFrom = state.userRate;
    state.dualWanted = !!values.qt_vjs_dualCaptions;
    state.preferredPrimary = Core.normalizeLanguage(values.qt_vjs_primaryTrack);
    state.preferredSecondary = Core.normalizeLanguage(values.qt_vjs_secondaryTrack);
    state.primary = state.preferredPrimary;
    state.secondary = state.preferredSecondary;
    state.slotsChosen = !!values.qt_vjs_slotsChosen;
    state.userEditedSlots = false;
    state.prefsReady = true;
    state.captionCommandSig = "";
    reconcileTrackSlots();
    syncCaptionBridge(false);
    if (state.dualWanted) beginCueRetries();
    if (state.video)
      applyRate(state.hold1x ? 1 : state.userRate, {
        persist: false,
        exitNeutral: false,
      });
    refreshMenu();
    renderCaptions();
  };
  const keys = [
    "qt_playbackRate",
    "qt_fixed1x",
    "qt_vjs_dualCaptions",
    "qt_vjs_primaryTrack",
    "qt_vjs_secondaryTrack",
    "qt_vjs_slotsChosen",
  ];
  if (Prefs) Prefs.get(keys, loadPrefs);
  else chrome.storage.sync.get(keys, loadPrefs);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" && area !== "local") return;
      if (changes.qt_playbackRate) {
        const rate = Core.clamp(
          Number(changes.qt_playbackRate.newValue) || 1,
          Core.RATE_MIN,
          Core.RATE_MAX,
        );
        state.userRate = rate;
        state.hold1xFrom = rate;
        if (!state.hold1x && state.prefsReady && state.video)
          applyRate(rate, { persist: false, exitNeutral: false });
      }
      if (changes.qt_fixed1x) {
        const next = !!changes.qt_fixed1x.newValue;
        if (next !== state.hold1x) setFixed1x(next, { persist: false });
      }
    });
  } catch {
    /* invalidated extension context */
  }

  function candidateFromNode(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.matches?.(".video-js")) return node;
    const parent = node.closest?.(".video-js");
    if (parent) return parent;
    return node.querySelector?.(".video-js") || null;
  }

  function find(node, allowGlobalFallback) {
    const next = allowGlobalFallback
      ? document.querySelector(".video-js")
      : candidateFromNode(node);
    return attach(next);
  }

  function startDiscovery() {
    if (find(document.documentElement, true) || !document.documentElement) return;
    if (state.discoveryObserver) return;
    state.discoveryObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (find(node, false)) {
            state.discoveryObserver?.disconnect();
            state.discoveryObserver = null;
            clearTimeout(state.discoveryTimer);
            state.discoveryTimer = 0;
            return;
          }
        }
      }
    });
    state.discoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
    state.discoveryTimer = setTimeout(() => {
      state.discoveryObserver?.disconnect();
      state.discoveryObserver = null;
      state.discoveryTimer = 0;
    }, DISCOVERY_TTL_MS);
  }

  send("QT_VIDEOJS_HELLO");
  if (document.documentElement) startDiscovery();
  else document.addEventListener("DOMContentLoaded", startDiscovery, { once: true });
})();
