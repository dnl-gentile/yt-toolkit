/* MAIN-world bridge for Video.js TextTrack objects. No network interception. */
(function () {
  if (globalThis.__ytToolkitVideoJsBridge) return;
  globalThis.__ytToolkitVideoJsBridge = true;

  const SOURCE_MAIN = "quiettube-videojs-main";
  const SOURCE_ISOLATED = "quiettube-videojs-isolated";
  const TRACK_KINDS = new Set(["captions", "subtitles"]);
  const MAX_TRACKS = 32;
  const MAX_TRACK_ENTRIES_INSPECTED = 128;
  const MAX_CUES_TOTAL = 4000;
  const MAX_TEXT_TOTAL = 240000;
  const MAX_TEXT_PER_CUE = 1000;
  const MAX_PAYLOAD_BYTES = 360000;
  const MAX_COMMAND_BYTES = 512;
  const HELLO_TTL_MS = 3000;
  const DISCOVERY_TTL_MS = 15000;
  const REQUEST_MIN_GAP_MS = 1200;
  const COMMAND_MIN_GAP_MS = 1200;

  let root = null;
  let video = null;
  let trackedLists = [];
  let requestedLanguages = new Set();
  let listenerAbort = null;
  let trackAbort = null;
  let structureObserver = null;
  let discoveryObserver = null;
  let discoveryTimer = 0;
  let emitTimer = 0;
  let lastPayload = "";
  let lastFingerprint = "";
  let generation = 0;
  let boundTrackNodes = new WeakSet();
  let boundCueTracks = new WeakSet();
  let cueSignatures = new WeakMap();
  let channel = "";
  let lastRequestAt = -Infinity;
  let lastCommandAt = -Infinity;
  let lastCommandRaw = "";
  let lastCommandGeneration = 0;
  let pendingCommandRaw = "";
  let commandTimer = 0;
  let pendingRequestId = "";
  const bridgeStartedAt = performance.now();
  const captionProbeTimers = new Set();
  const attachProbeTimers = new Set();
  let lastMediaResetAt = 0;

  function normalize(value) {
    return String(value || "").trim().replace(/_/g, "-").toLowerCase();
  }

  function cueSignature(track) {
    try {
      const cues = track?.cues;
      const count = Number(cues?.length) || 0;
      if (!count) return "0";
      const positions = Array.from(new Set([0, Math.floor((count - 1) / 2), count - 1]));
      const samples = positions.map((index) => {
        const cue = cues[index];
        return [
          Number(cue?.startTime) || 0,
          Number(cue?.endTime) || 0,
          String(cue?.text || cue?.payload || "").slice(0, 80),
        ];
      });
      return JSON.stringify([count, samples]);
    } catch {
      return "unavailable";
    }
  }

  function invalidateMediaGeneration() {
    const now = performance.now();
    if (now - lastMediaResetAt < 80) return;
    lastMediaResetAt = now;
    generation++;
    requestedLanguages = new Set();
    lastPayload = "";
    lastFingerprint = "";
    lastCommandRaw = "";
    pendingCommandRaw = "";
    pendingRequestId = "";
    clearTimeout(commandTimer);
    commandTimer = 0;
    for (const timer of captionProbeTimers) clearTimeout(timer);
    captionProbeTimers.clear();
    trackAbort?.abort();
    trackAbort = null;
    trackedLists = [];
    boundTrackNodes = new WeakSet();
    boundCueTracks = new WeakSet();
    cueSignatures = new WeakMap();
    bindLists();
    scheduleEmit();
  }

  function textTrackLists() {
    const lists = [];
    const add = (list) => {
      if (!list || typeof list.length !== "number" || lists.includes(list)) return;
      lists.push(list);
    };
    try {
      add(video && video.textTracks);
    } catch {
      /* unavailable */
    }
    const players = [];
    try {
      if (globalThis.videojs && typeof globalThis.videojs.getPlayer === "function") {
        players.push(globalThis.videojs.getPlayer(root?.id));
        players.push(globalThis.videojs.getPlayer(video?.id));
      }
    } catch {
      /* module-local Video.js */
    }
    for (const node of [root, video]) {
      if (!node) continue;
      for (const key of ["player", "player_"]) {
        try {
          players.push(node[key]);
        } catch {
          /* host getter */
        }
      }
    }
    for (const player of players) {
      try {
        if (player && typeof player.textTracks === "function") add(player.textTracks());
      } catch {
        /* not a Video.js player */
      }
    }
    return lists;
  }

  function allTracks() {
    const out = [];
    const seen = new Set();
    let inspected = 0;
    const addTrack = (track) => {
      if (!track || out.length >= MAX_TRACKS) return;
      if (!TRACK_KINDS.has(String(track.kind || "").toLowerCase()) || seen.has(track)) return;
      seen.add(track);
      out.push(track);
    };
    for (const list of textTrackLists()) {
      const length = Number(list?.length);
      if (!Number.isFinite(length) || length <= 0) continue;
      const limit = Math.min(
        Math.floor(length),
        MAX_TRACK_ENTRIES_INSPECTED - inspected,
      );
      for (let index = 0; index < limit && out.length < MAX_TRACKS; index++) {
        inspected++;
        addTrack(list[index]);
      }
      if (inspected >= MAX_TRACK_ENTRIES_INSPECTED) break;
    }
    try {
      const nodes = root?.querySelectorAll("track") || [];
      const limit = Math.min(
        Number(nodes.length) || 0,
        MAX_TRACK_ENTRIES_INSPECTED - inspected,
      );
      for (let index = 0; index < limit && out.length < MAX_TRACKS; index++) {
        inspected++;
        addTrack(nodes[index]?.track);
      }
    } catch {
      /* unavailable */
    }
    return out;
  }

  function cleanCue(cue, budget) {
    if (budget.inspected >= MAX_CUES_TOTAL || budget.full) return null;
    budget.inspected++;
    const start = Number(cue && cue.startTime);
    const end = Number(cue && cue.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    const text = String((cue && (cue.text || cue.payload)) || "")
      .slice(0, MAX_TEXT_PER_CUE * 2)
      .replace(/<[^>]*>/g, "")
      .trim()
      .slice(0, MAX_TEXT_PER_CUE);
    if (budget.text + text.length > MAX_TEXT_TOTAL) {
      budget.full = true;
      return null;
    }
    budget.cues++;
    budget.text += text.length;
    return { start, end, text };
  }

  function trackPayload(track, index, budget) {
    const language = normalize(track.language || track.srclang);
    let cueCount = 0;
    let cues;
    try {
      cueCount = Number(track.cues?.length) || 0;
      if (requestedLanguages.has(language)) {
        cues = [];
        for (
          let i = 0;
          i < cueCount && budget.inspected < MAX_CUES_TOTAL && !budget.full;
          i++
        ) {
          const cue = cleanCue(track.cues[i], budget);
          if (cue) cues.push(cue);
        }
      }
    } catch {
      cueCount = 0;
      cues = requestedLanguages.has(language) ? [] : undefined;
    }
    const item = {
      id: String(track.id || "track-" + index).slice(0, 120),
      language,
      label: String(track.label || track.language || "Caption " + (index + 1)).slice(0, 160),
      kind: String(track.kind || "subtitles").slice(0, 24),
      mode: String(track.mode || "disabled").slice(0, 16),
      cueCount,
    };
    if (cues) item.cues = cues;
    return item;
  }

  function payload(tracks, includeCues) {
    const budget = { cues: 0, inspected: 0, text: 0, full: false };
    const savedRequested = requestedLanguages;
    if (!includeCues) requestedLanguages = new Set();
    let items;
    try {
      items = tracks.map((track, index) => trackPayload(track, index, budget));
    } finally {
      requestedLanguages = savedRequested;
    }
    return {
      generation,
      duration: Number(video?.duration) || 0,
      tracks: items,
    };
  }

  function fingerprint(tracks) {
    return JSON.stringify({
      generation,
      duration: Number(video?.duration) || 0,
      requested: Array.from(requestedLanguages).sort(),
      tracks: tracks.map((track, index) => ({
        id: String(track.id || "track-" + index).slice(0, 120),
        language: normalize(track.language || track.srclang),
        mode: String(track.mode || "disabled").slice(0, 16),
        cueCount: Number(track.cues?.length) || 0,
        cueSignature: requestedLanguages.has(normalize(track.language || track.srclang))
          ? cueSignature(track)
          : "",
      })),
    });
  }

  function emit() {
    clearTimeout(emitTimer);
    emitTimer = 0;
    if (!channel) return;
    const requestId = pendingRequestId;
    pendingRequestId = "";
    if (!requestId) {
      globalThis.postMessage(
        { source: SOURCE_MAIN, type: "QT_VIDEOJS_DIRTY", channel },
        "*",
      );
      return;
    }
    const tracks = allTracks();
    const nextFingerprint = fingerprint(tracks);
    let next = lastPayload;
    if (nextFingerprint !== lastFingerprint || !next) {
      lastFingerprint = nextFingerprint;
      next = JSON.stringify(payload(tracks, true));
      if (next.length > MAX_PAYLOAD_BYTES) next = JSON.stringify(payload(tracks, false));
      lastPayload = next;
    }
    globalThis.postMessage(
      {
        source: SOURCE_MAIN,
        type: "QT_VIDEOJS_TRACKS",
        channel,
        requestId,
        payload: next,
      },
      "*",
    );
  }

  function scheduleEmit(delay) {
    if (emitTimer) return;
    emitTimer = setTimeout(emit, Number(delay) || 120);
  }

  function bindLists() {
    const lists = textTrackLists().filter(
      (list) => typeof list.addEventListener === "function",
    );
    const listsChanged =
      lists.length !== trackedLists.length || lists.some((list) => !trackedLists.includes(list));
    if (listsChanged) {
      trackAbort?.abort();
      trackAbort = new AbortController();
      trackedLists = lists;
      boundTrackNodes = new WeakSet();
      boundCueTracks = new WeakSet();
      cueSignatures = new WeakMap();
    } else if (!trackAbort) {
      trackAbort = new AbortController();
    }
    const signal = trackAbort.signal;
    const listen = (target, type, handler) => {
      try {
        target.addEventListener(type, handler, { signal });
      } catch {
        target.addEventListener(type, handler);
        signal?.addEventListener(
          "abort",
          () => target.removeEventListener?.(type, handler),
          { once: true },
        );
      }
    };
    if (listsChanged) {
      for (const list of trackedLists) {
        listen(list, "addtrack", () => {
          bindLists();
          scheduleEmit();
        });
        listen(list, "removetrack", () => {
          bindLists();
          scheduleEmit();
        });
        listen(list, "change", () => scheduleEmit());
      }
    }
    const trackNodes = root?.querySelectorAll("track") || [];
    const trackNodeLimit = Math.min(
      Number(trackNodes.length) || 0,
      MAX_TRACK_ENTRIES_INSPECTED,
    );
    for (let index = 0; index < trackNodeLimit; index++) {
      const node = trackNodes[index];
      if (boundTrackNodes.has(node)) continue;
      boundTrackNodes.add(node);
      listen(node, "load", () => invalidateMediaGeneration());
    }
    for (const track of allTracks()) {
      if (boundCueTracks.has(track) || typeof track.addEventListener !== "function") continue;
      boundCueTracks.add(track);
      cueSignatures.set(track, cueSignature(track));
      listen(track, "cuechange", () => {
        const nextSignature = cueSignature(track);
        if (nextSignature === cueSignatures.get(track)) return;
        cueSignatures.set(track, nextSignature);
        lastFingerprint = "";
        scheduleEmit();
      });
    }
  }

  function validLanguage(value) {
    const language = normalize(value);
    return /^[a-z0-9-]{1,40}$/.test(language) ? language : "";
  }

  function applyCaptionMode(command) {
    if (!command || typeof command !== "object") return;
    const tracks = allTracks();
    const primary = validLanguage(command.primary);
    const secondary = validLanguage(command.secondary);
    const wantsDual = !!command.dual && !!primary && !!secondary;
    const renderDual = wantsDual && !!command.render;
    requestedLanguages = wantsDual ? new Set([primary, secondary]) : new Set();
    const visibleLanguage = primary || secondary;
    if (!!command.preserve && !wantsDual && !visibleLanguage) {
      bindLists();
      scheduleEmit();
      return;
    }
    for (const track of tracks) {
      const language = normalize(track.language || track.srclang);
      let desired = "disabled";
      if (renderDual && (language === primary || language === secondary)) desired = "hidden";
      else if (wantsDual && language === secondary) desired = "hidden";
      else if (visibleLanguage && language === visibleLanguage) desired = "showing";
      try {
        if (track.mode !== desired) track.mode = desired;
      } catch {
        /* host owns a read-only track */
      }
    }
    bindLists();
    scheduleEmit();
    /* A hidden remote track can populate cues after the mode write. */
    for (const timer of captionProbeTimers) clearTimeout(timer);
    captionProbeTimers.clear();
    for (const delay of [350, 1200, 2500]) {
      const timer = setTimeout(() => {
        captionProbeTimers.delete(timer);
        bindLists();
        scheduleEmit();
      }, delay);
      captionProbeTimers.add(timer);
    }
  }

  function attach(nextRoot) {
    if (!nextRoot) return false;
    const nextVideo = nextRoot.querySelector("video");
    if (!nextVideo) return false;
    if (nextRoot === root && nextVideo === video) {
      bindLists();
      return true;
    }
    listenerAbort?.abort();
    trackAbort?.abort();
    structureObserver?.disconnect();
    clearTimeout(emitTimer);
    emitTimer = 0;
    clearTimeout(commandTimer);
    commandTimer = 0;
    pendingCommandRaw = "";
    pendingRequestId = "";
    lastCommandRaw = "";
    for (const timer of captionProbeTimers) clearTimeout(timer);
    for (const timer of attachProbeTimers) clearTimeout(timer);
    captionProbeTimers.clear();
    attachProbeTimers.clear();
    root = nextRoot;
    video = nextVideo;
    generation++;
    lastMediaResetAt = performance.now();
    trackedLists = [];
    boundTrackNodes = new WeakSet();
    boundCueTracks = new WeakSet();
    cueSignatures = new WeakMap();
    requestedLanguages = new Set();
    lastPayload = "";
    lastFingerprint = "";
    listenerAbort = new AbortController();
    trackAbort = new AbortController();
    const signal = listenerAbort.signal;
    video.addEventListener("loadedmetadata", () => scheduleEmit(), { signal });
    video.addEventListener("durationchange", () => scheduleEmit(), { signal });
    video.addEventListener("loadstart", invalidateMediaGeneration, { signal });
    video.addEventListener("emptied", invalidateMediaGeneration, { signal });
    bindLists();
    structureObserver = new MutationObserver(() => {
      const currentVideo = root?.querySelector("video");
      if (currentVideo && currentVideo !== video) attach(root);
      else bindLists();
    });
    structureObserver.observe(root, { childList: true });
    scheduleEmit();
    for (const delay of [500, 1800]) {
      const timer = setTimeout(() => {
        attachProbeTimers.delete(timer);
        bindLists();
        scheduleEmit();
      }, delay);
      attachProbeTimers.add(timer);
    }
    return true;
  }

  function candidateFromNode(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.matches?.(".video-js")) return node;
    const parent = node.closest?.(".video-js");
    if (parent) return parent;
    return node.querySelector?.(".video-js") || null;
  }

  function findPlayer(node, allowGlobalFallback) {
    const next = allowGlobalFallback
      ? document.querySelector(".video-js")
      : candidateFromNode(node);
    return attach(next);
  }

  function stopDiscovery() {
    discoveryObserver?.disconnect();
    discoveryObserver = null;
    clearTimeout(discoveryTimer);
    discoveryTimer = 0;
  }

  function startDiscovery() {
    if (findPlayer(document.documentElement, true)) return;
    if (discoveryObserver || !document.documentElement) return;
    discoveryObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (findPlayer(node, false)) {
            stopDiscovery();
            return;
          }
        }
      }
    });
    discoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
    discoveryTimer = setTimeout(stopDiscovery, DISCOVERY_TTL_MS);
  }

  globalThis.addEventListener("message", (event) => {
    if (event.source !== globalThis || event.data?.source !== SOURCE_ISOLATED) return;
    const incomingChannel = String(event.data.channel || "");
    if (event.data.type === "QT_VIDEOJS_HELLO") {
      if (!/^[a-f0-9-]{16,64}$/i.test(incomingChannel)) return;
      if (channel) return;
      if (performance.now() - bridgeStartedAt > HELLO_TTL_MS) return;
      channel = incomingChannel;
      scheduleEmit(0);
      return;
    }
    if (!channel || incomingChannel !== channel) return;
    if (event.data.type === "QT_VIDEOJS_REQUEST_TRACKS") {
      const now = performance.now();
      const needsReattach = !root?.isConnected || !video?.isConnected;
      if (now - lastRequestAt < REQUEST_MIN_GAP_MS) return;
      let request;
      try {
        const raw = String(event.data.payload || "");
        if (!raw || raw.length > 160) return;
        request = JSON.parse(raw);
      } catch {
        return;
      }
      const requestId = String(request?.requestId || "");
      if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) return;
      lastRequestAt = now;
      if (needsReattach) findPlayer(document.documentElement, true);
      bindLists();
      pendingRequestId = requestId;
      scheduleEmit(0);
      return;
    }
    if (event.data.type !== "QT_VIDEOJS_CAPTION_MODE") return;
    const raw = String(event.data.payload || "");
    if (!raw || raw.length > MAX_COMMAND_BYTES) return;
    if (
      !commandTimer &&
      raw === lastCommandRaw &&
      generation === lastCommandGeneration
    )
      return;
    pendingCommandRaw = raw;
    if (commandTimer) return;
    const wait = Math.max(0, COMMAND_MIN_GAP_MS - (performance.now() - lastCommandAt));
    commandTimer = setTimeout(() => {
      commandTimer = 0;
      const nextRaw = pendingCommandRaw;
      pendingCommandRaw = "";
      try {
        const command = JSON.parse(nextRaw);
        applyCaptionMode(command);
        lastCommandRaw = nextRaw;
        lastCommandGeneration = generation;
        lastCommandAt = performance.now();
      } catch {
        /* malformed isolated message */
      }
    }, wait);
  });

  if (document.documentElement) startDiscovery();
  else document.addEventListener("DOMContentLoaded", startDiscovery, { once: true });
})();
