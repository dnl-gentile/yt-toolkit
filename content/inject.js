/* MAIN world — always pull auto-generated (ASR) timedtext (no tlang) so
   WPM / lock / trim / clock / word-rhythm stay on per-word timestamps. */
(function () {
  if (window.__qtMain) return;
  window.__qtMain = true;

  let lastTimedOriginal = null;
  let lastTracks = null;
  let originalTrack = null;
  let originalFetchInflight = false;
  let originalFetchAttempts = 0;
  let originalNextRetryAt = 0;
  let originalTrackRevision = 0;
  let lastSignedTimedtext = "";
  let activeVideoId = "";
  let videoGeneration = 0;
  let lastDisplayRestoreKey = "";
  let needTracksForceAt = 0;
  let bootRetryTimer = 0;
  let nativeTimedtextSequence = 0;
  const acceptedNativeResponses = new Map();

  function post(payload) {
    if (payload.videoId && payload.videoId !== pageVid()) return false;
    if (payload.type === "QT_TRACKS") lastTracks = payload;
    if (
      payload.type === "QT_TIMEDTEXT" &&
      payload.original === true &&
      looksLikeCues(payload.text)
    ) {
      lastTimedOriginal = payload;
    }
    window.postMessage({ source: "quiettube", ...payload }, "*");
    return true;
  }

  /* Do not run timedtext URLs through URLSearchParams: it re-encodes
     `signature` / `pot` (`+` → `%2B`) and YouTube returns an empty body. */
  function stripTlang(url) {
    return String(url)
      .replace(/([?&])tlang=[^&]*/gi, "$1")
      .replace(/[?&]$/g, "")
      .replace(/\?&/g, "?")
      .replace(/&&/g, "&");
  }

  function withJson3(url, keepTlang) {
    if (!url) return url;
    let s = keepTlang ? String(url) : stripTlang(url);
    if (!/[?&]fmt=/i.test(s)) s += (s.includes("?") ? "&" : "?") + "fmt=json3";
    return s;
  }

  function langFromUrl(url) {
    if (!url) return { lang: "", tlang: "", kind: "" };
    try {
      const u = new URL(url, location.origin);
      const kindRaw = (u.searchParams.get("kind") || "").toLowerCase();
      const caps = (u.searchParams.get("caps") || "").toLowerCase();
      return {
        lang: (u.searchParams.get("lang") || "").toLowerCase(),
        tlang: (u.searchParams.get("tlang") || "").toLowerCase(),
        kind: kindRaw || (caps === "asr" ? "asr" : ""),
      };
    } catch {
      const lang = /[?&]lang=([^&]+)/i.exec(url);
      const tlang = /[?&]tlang=([^&]+)/i.exec(url);
      const kind = /[?&]kind=([^&]+)/i.exec(url);
      const caps = /[?&]caps=([^&]+)/i.exec(url);
      const kindVal = kind ? decodeURIComponent(kind[1]).toLowerCase() : "";
      const capsVal = caps ? decodeURIComponent(caps[1]).toLowerCase() : "";
      return {
        lang: lang ? decodeURIComponent(lang[1]).toLowerCase() : "",
        tlang: tlang ? decodeURIComponent(tlang[1]).toLowerCase() : "",
        kind: kindVal || (capsVal === "asr" ? "asr" : ""),
      };
    }
  }

  function langsMatch(a, b) {
    const x = String(a || "").toLowerCase();
    const y = String(b || "").toLowerCase();
    if (!x || !y) return false;
    return x === y || x.startsWith(y + "-") || y.startsWith(x);
  }

  function trackIsAsr(t) {
    if (!t) return false;
    if (String(t.kind || "").toLowerCase() === "asr") return true;
    const id = String(t.id || t.vssId || "");
    return /(^|\.)asr$/i.test(id) || /^a\./.test(id);
  }

  function trackVssId(track) {
    return String((track && (track.vssId || track.id)) || "").toLowerCase();
  }

  function sourceUrlFingerprint(url) {
    if (!url) return "";
    try {
      const parsed = new URL(String(url), location.origin);
      const params = [];
      parsed.searchParams.forEach((value, key) => {
        const lower = key.toLowerCase();
        /* Output format and proof tokens can differ between the caption track
           descriptor and the request derived from it. The signed source URL
           (including signature/expire/video/language) remains the identity. */
        if (lower === "fmt" || lower === "pot" || lower === "potc") return;
        params.push([key, value]);
      });
      params.sort((a, b) =>
        a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : a[0].localeCompare(b[0]),
      );
      const query = params
        .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
        .join("&");
      return parsed.origin + parsed.pathname + (query ? "?" + query : "");
    } catch {
      return String(url)
        .replace(/([?&])(?:fmt|pot|potc)=[^&]*/gi, "$1")
        .replace(/[?&]$/g, "")
        .replace(/\?&/g, "?")
        .replace(/&&/g, "&");
    }
  }

  function matchingAsrTrack(tracks, pinned) {
    const asrTracks = (tracks || []).filter(trackIsAsr);
    if (!asrTracks.length || !pinned) return null;
    const pinnedVss = trackVssId(pinned);
    if (pinnedVss) {
      const exact = asrTracks.find((track) => trackVssId(track) === pinnedVss);
      if (exact) return exact;
    }
    const sameLanguage = asrTracks.filter((track) =>
      langsMatch(track.languageCode, pinned.languageCode),
    );
    /* A unique same-language ASR is still the pinned source when a host
       experiment changes or omits vssId. Ambiguous matches stay pinned to the
       existing descriptor rather than switching rhythm authority by order. */
    return sameLanguage.length === 1 ? sameLanguage[0] : null;
  }

  function mergeAuthParams(target, source) {
    if (!target || !source) return target;
    let out = String(target);
    /* A caption URL signature is track-specific. Only the proof-of-origin
       tokens are shared across caption requests for the same video. */
    const names = ["pot", "potc"];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (new RegExp("[?&]" + name + "=", "i").test(out)) continue;
      const m = new RegExp("[?&]" + name + "=([^&]*)", "i").exec(source);
      if (!m) continue;
      out += (out.includes("?") ? "&" : "?") + name + "=" + m[1];
    }
    return out;
  }

  /* Second source for the proof-of-origin token.
     noteSignedTimedtext can only harvest one by observing a timedtext request
     YouTube itself makes — and with CC off it makes none, which is why the
     hidden pull used to get 200-and-empty until the user toggled captions.
     The player response carries the same class of token directly, so read it
     rather than waiting to overhear one. Costs no request and touches no
     caption state, so SPEC §5 invariant 8 and SPEC §7 both still hold. */
  function playerProofToken() {
    try {
      const token = playerResponse()?.serviceIntegrityDimensions?.poToken;
      return typeof token === "string" && token ? token : "";
    } catch {
      return "";
    }
  }

  function withPlayerProof(url) {
    if (!url || /[?&]pot=/i.test(String(url))) return url;
    const token = playerProofToken();
    if (!token) return url;
    /* Encoded here, unlike mergeAuthParams: that copies an already-encoded
       value out of a URL, this one is a raw string and '+' must survive. */
    const out = String(url);
    return out + (out.includes("?") ? "&" : "?") + "pot=" + encodeURIComponent(token);
  }

  function isOriginalPayload(url, lang) {
    const meta = langFromUrl(url);
    const key = String(lang || "").toLowerCase();
    if (meta.tlang || key.startsWith("tlang:")) return false;
    const origLang = ((originalTrack && originalTrack.languageCode) || "").toLowerCase();
    const origAsr = !!(originalTrack && originalTrack.kind === "asr");
    /* ASR always wins. Uploaded same-lang must not mark original:true. */
    if (origAsr) {
      if (meta.kind === "asr" && (!meta.lang || langsMatch(meta.lang, origLang))) {
        return true;
      }
      return false;
    }
    if (meta.kind === "asr") return true;
    /* No track pinned yet: wait. Uploaded must not win the race. */
    if (!originalTrack) return false;
    const k = (key.replace(/^tlang:/, "") || meta.lang).toLowerCase();
    if (k && langsMatch(k, origLang)) return true;
    return false;
  }

  function activeShortsPlayer() {
    if (!/^\/shorts(?:\/|$)/.test(location.pathname || "")) return null;
    const root = document.querySelector(
      "ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active], ytd-reel-video-renderer[aria-hidden='false']",
    );
    const candidates = [];
    const add = (node) => {
      if (node && !candidates.includes(node)) candidates.push(node);
    };
    if (root && root.querySelector) {
      add(root.querySelector("#shorts-player"));
      add(root.querySelector(".html5-video-player"));
      add(root.querySelector("ytd-player"));
    }
    Array.from(
      document.querySelectorAll(
        "ytd-reel-video-renderer #shorts-player, ytd-reel-video-renderer .html5-video-player",
      ),
    ).forEach(add);
    const wanted = pageVid();
    let exact = null;
    let visible = null;
    let visibleArea = -1;
    for (const node of candidates) {
      let responseId = "";
      if (node && typeof node.getPlayerResponse === "function") {
        try {
          const response = node.getPlayerResponse();
          responseId = response?.videoDetails?.videoId || "";
        } catch {
          /* keep looking */
        }
      }
      if (node && typeof node.getBoundingClientRect === "function") {
        const rect = node.getBoundingClientRect();
        const viewportWidth = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
        const viewportHeight = Number(window.innerHeight) || Number.POSITIVE_INFINITY;
        const width = Math.max(
          0,
          Math.min(rect.right ?? rect.width, viewportWidth) - Math.max(rect.left || 0, 0),
        );
        const height = Math.max(
          0,
          Math.min(rect.bottom ?? rect.height, viewportHeight) - Math.max(rect.top || 0, 0),
        );
        const area = Number.isFinite(width * height)
          ? width * height
          : Math.max(0, rect.width) * Math.max(0, rect.height);
        if (responseId === wanted) {
          if (area > 0) return node;
          exact = exact || node;
        }
        if (area > visibleArea) {
          visibleArea = area;
          visible = node;
        }
      }
    }
    return exact || visible || candidates.find(Boolean) || null;
  }

  function playerResponse() {
    try {
      const mp = activeShortsPlayer() || document.querySelector("#movie_player");
      if (mp && typeof mp.getPlayerResponse === "function") {
        const r = mp.getPlayerResponse();
        if (r) return r;
      }
    } catch {
      /* ignore */
    }
    let pr =
      window.ytInitialPlayerResponse ||
      window.ytplayer?.config?.args?.player_response;
    if (typeof pr === "string") {
      try {
        pr = JSON.parse(pr);
      } catch {
        pr = null;
      }
    }
    return pr || null;
  }

  const origFetch = window.fetch.bind(window);
  let lastFetchKey = "";

  function pageVid() {
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

  function videoIdFromUrl(url) {
    try {
      return new URL(String(url || ""), location.origin).searchParams.get("v") || "";
    } catch {
      const match = /[?&]v=([^&]+)/i.exec(String(url || ""));
      return match ? decodeURIComponent(match[1]) : "";
    }
  }

  function looksLikeCues(text) {
    if (!text || text.length < 12) return false;
    const t = String(text).trim();
    if (t[0] === "<") {
      if (!/<text[\s>]/i.test(t) && !/<p\s[^>]*\bt=/i.test(t)) return false;
      /* A bare <timedtext></timedtext> is a successful HTTP response but has
         zero cues. Do not cache it or stop retries. */
      return t
        .replace(/<[^>]+>/g, " ")
        .replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, "x")
        .trim().length > 0;
    }
    try {
      const j = JSON.parse(t);
      return (j.events || []).some(
        (e) => e && e.segs && e.segs.length && e.segs.some((s) => s && s.utf8),
      );
    } catch {
      return false;
    }
  }

  function hasPostedOriginal() {
    const vid = pageVid();
    if (!lastTimedOriginal || lastTimedOriginal.videoId !== vid) return false;
    if (!originalTrack || originalTrack.videoId !== vid) return false;
    /* An uploaded payload does not satisfy an ASR source track. Without this
       the uploaded fallback posted before YouTube published the
       auto-generated track would count as done and pin rhythm to cue-level
       timings for the whole video. */
    if (originalTrack.kind === "asr" && lastTimedOriginal.asr !== true) return false;
    return true;
  }

  function resetIfNewVideo(vid) {
    if (!vid) return;
    if (activeVideoId === vid) return;
    if (bootRetryTimer) {
      clearTimeout(bootRetryTimer);
      bootRetryTimer = 0;
    }
    activeVideoId = vid;
    videoGeneration++;
    originalTrack = null;
    originalTrackRevision++;
    acceptedNativeResponses.clear();
    lastTimedOriginal = null;
    lastTracks = null;
    lastFetchKey = "";
    sendTracks._vid = "";
    originalFetchInflight = false;
    originalFetchAttempts = 0;
    originalNextRetryAt = 0;
    lastSignedTimedtext = "";
    lastDisplayRestoreKey = "";
    needTracksForceAt = 0;
  }

  function timedLang(url, lang, original) {
    if (original) {
      return (originalTrack && originalTrack.languageCode) || lang || langFromUrl(url).lang || "";
    }
    const token = String(lang || "");
    if (token) return token;
    const meta = langFromUrl(url);
    if (meta.tlang) return "tlang:" + meta.tlang;
    return meta.lang || "";
  }

  function ensureOriginal() {
    if (hasPostedOriginal()) return;
    const vid = pageVid();
    if (originalTrack && originalTrack.videoId === vid) fetchOriginal();
    else sendTracks(false);
  }

  function noteSignedTimedtext(url) {
    const u = String(url || "");
    if (!/[?&](pot|potc)=/.test(u)) return;
    if (u === lastSignedTimedtext) return;
    lastSignedTimedtext = u;
    if (originalTrack && originalTrack.baseUrl) {
      const merged = mergeAuthParams(originalTrack.baseUrl, u);
      if (merged !== originalTrack.baseUrl) {
        originalTrack.baseUrl = merged;
        if (!hasPostedOriginal()) {
          originalNextRetryAt = 0;
          if (!originalFetchInflight) fetchOriginal();
        }
      }
    }
  }

  function fetchOriginal() {
    if (!originalTrack || !originalTrack.baseUrl) return;
    if (originalFetchInflight) return;
    if (Date.now() < originalNextRetryAt) return;
    if (lastSignedTimedtext) {
      originalTrack.baseUrl = mergeAuthParams(originalTrack.baseUrl, lastSignedTimedtext);
    }
    originalFetchInflight = true;
    originalFetchAttempts++;
    fetchTrack(originalTrack.baseUrl, originalTrack.languageCode, {
      original: true,
      originalTrackRevision,
    });
  }

  function fetchTrack(url, lang, opts) {
    const vid = pageVid();
    const generation = videoGeneration;
    const urlVid = videoIdFromUrl(url);
    if (!vid || (urlVid && urlVid !== vid)) return;
    const token = String(lang || "");
    const forceOriginal = !!(opts && opts.original);
    const requestTrackRevision = forceOriginal
      ? opts && Number.isFinite(opts.originalTrackRevision)
        ? opts.originalTrackRevision
        : originalTrackRevision
      : null;
    const current = () =>
      videoGeneration === generation &&
      pageVid() === vid &&
      (!forceOriginal || requestTrackRevision === originalTrackRevision);
    const keep =
      !forceOriginal &&
      (/[?&]tlang=/.test(String(url)) || token.startsWith("tlang:"));
    const urls = [];
    const add = (u) => {
      if (u && !urls.includes(u)) urls.push(u);
    };
    let primary = forceOriginal ? stripTlang(url) : url;
    if (lastSignedTimedtext) primary = mergeAuthParams(primary, lastSignedTimedtext);
    /* An observed token wins — it is known good for this exact session. The
       player-response token only fills the gap when nothing has been overheard,
       which is precisely the CC-off case. */
    primary = withPlayerProof(primary);
    add(withJson3(primary, keep));
    add(primary);
    let i = 0;
    const done = (ok) => {
      if (!current()) return;
      if (!forceOriginal) return;
      originalFetchInflight = false;
      if (ok) {
        originalFetchAttempts = 0;
        originalNextRetryAt = 0;
      } else {
        const delay = Math.min(60_000, 4_000 * 2 ** Math.min(4, originalFetchAttempts - 1));
        originalNextRetryAt = Date.now() + delay;
      }
    };
    const tryNext = () => {
      if (!current()) return;
      if (i >= urls.length) {
        done(false);
        return;
      }
      const u = urls[i++];
      origFetch(u)
        .then((r) => r.text())
        .then((text) => {
          if (!current()) return;
          if (looksLikeCues(text)) {
            lastFetchKey = u;
            const original = forceOriginal || isOriginalPayload(u, token);
            post({
              type: "QT_TIMEDTEXT",
              url: u,
              text,
              lang: timedLang(u, token, original),
              original,
              asr:
                original &&
                !!(
                  (originalTrack && originalTrack.kind === "asr") ||
                  langFromUrl(u).kind === "asr"
                ),
              videoId: vid,
            });
            done(true);
            if (!original) ensureOriginal();
          } else tryNext();
        })
        .catch(() => {
          if (current()) tryNext();
        });
    };
    tryNext();
  }

  function identifyOriginal(tracks, vid) {
    const asrTracks = tracks.filter((track) => trackIsAsr(track));
    const asr = asrTracks[0];
    if (originalTrack && originalTrack.videoId === vid) {
      /* Keep the pinned track — including any pot/potc merged into its
         baseUrl — unless we settled for a non-ASR fallback and YouTube has
         since published the auto-generated track. SPEC 1.6.1: once source
         ASR exists it owns rhythm, so an uploaded pick must be upgraded. */
      if (originalTrack.kind === "asr") {
        const pinnedAsr = matchingAsrTrack(asrTracks, originalTrack);
        if (pinnedAsr && pinnedAsr.baseUrl) {
          const nextSource = String(pinnedAsr.baseUrl);
          const pinnedSource = String(
            originalTrack.sourceBaseUrl || originalTrack.baseUrl || "",
          );
          /* YouTube can replace the player for the same video and renew the
             signed timedtext URL. Keeping the old URL makes every hidden pull
             return an empty body until toggling CC produces a host-owned
             request that our fetch/XHR hook can intercept. Refresh only when
             the player response's source URL really changed; the separately
             merged pot/potc parameters must not make this comparison flap. */
          if (nextSource !== pinnedSource) {
            originalTrack.languageCode =
              pinnedAsr.languageCode || originalTrack.languageCode;
            originalTrack.vssId =
              pinnedAsr.vssId || pinnedAsr.id || originalTrack.vssId || "";
            originalTrack.sourceBaseUrl = nextSource;
            originalTrack.baseUrl = nextSource;
            originalTrackRevision++;
            originalFetchInflight = false;
            originalFetchAttempts = 0;
            originalNextRetryAt = 0;
            lastFetchKey = "";
          }
        }
        return originalTrack;
      }
      if (!asr) return originalTrack;
    }
    const pick = asr || tracks[0];
    if (!pick) return null;
    originalTrack = {
      languageCode: pick.languageCode || "",
      baseUrl: pick.baseUrl,
      sourceBaseUrl: pick.baseUrl || "",
      videoId: vid,
      kind: trackIsAsr(pick) ? "asr" : pick.kind || "",
      vssId: pick.vssId || pick.id || "",
    };
    originalTrackRevision++;
    originalFetchInflight = false;
    originalFetchAttempts = 0;
    originalNextRetryAt = 0;
    return originalTrack;
  }

  function restoreDisplayTrack(payload) {
    const vid = pageVid();
    if (!vid || payload.videoId !== vid) return;
    const descriptor = payload.descriptor || {};
    const languageCode = String(descriptor.languageCode || "").toLowerCase();
    const translationCode = String(
      descriptor.translationLanguageCode || "",
    ).toLowerCase();
    if (!languageCode && !translationCode) return;
    const player = activeShortsPlayer() || document.querySelector("#movie_player");
    if (!player || typeof player.setOption !== "function") return;
    const parsed = playerResponse();
    if (parsed?.videoDetails?.videoId && parsed.videoDetails.videoId !== vid) return;
    const renderer =
      parsed?.captions?.playerCaptionsTracklistRenderer ||
      parsed?.captions?.playerCaptionsRenderer ||
      {};
    const tracks = renderer.captionTracks || [];
    const kind = String(descriptor.kind || "").toLowerCase();
    let track = tracks.find(
      (candidate) =>
        String(candidate.languageCode || "").toLowerCase() === languageCode &&
        (!kind || String(candidate.kind || "").toLowerCase() === kind),
    );
    if (!track)
      track = tracks.find(
        (candidate) =>
          String(candidate.languageCode || "").toLowerCase() === languageCode,
      );
    if (!track && translationCode) track = tracks.find(trackIsAsr) || tracks[0];
    if (!track) return;
    const selected = { ...track };
    if (translationCode) {
      const translated = (renderer.translationLanguages || []).find(
        (candidate) =>
          String(candidate.languageCode || "").toLowerCase() === translationCode,
      );
      selected.translationLanguage = translated || { languageCode: translationCode };
    }
    const key =
      vid +
      "|" +
      String(track.languageCode || "").toLowerCase() +
      "|" +
      String(track.kind || "").toLowerCase() +
      "|" +
      translationCode;
    if (key === lastDisplayRestoreKey) return;
    try {
      player.setOption("captions", "track", selected);
      lastDisplayRestoreKey = key;
    } catch {
      /* Player is still replacing its caption module; the isolated world
         will retry once after the next tracks event. */
    }
  }

  function sendTracks(forceFetch) {
    let posted = false;
    try {
      const vid = pageVid();
      if (!vid) return posted;
      resetIfNewVideo(vid);
      const parsed = playerResponse();
      const prVid = parsed?.videoDetails?.videoId || "";
      if (prVid && prVid !== vid) return posted;
      const renderer =
        parsed?.captions?.playerCaptionsTracklistRenderer ||
        parsed?.captions?.playerCaptionsRenderer ||
        {};
      const tracks = renderer.captionTracks || [];
      if (tracks.length) {
        const mapped = tracks.map((t) => ({
          baseUrl: t.baseUrl,
          languageCode: t.languageCode,
          name: t.name?.simpleText || t.languageCode,
          kind: t.kind || "",
          vssId: t.vssId,
        }));
        const translationLanguages = (renderer.translationLanguages || []).map((t) => ({
          languageCode: t.languageCode || "",
          name:
            t.languageName?.simpleText ||
            t.name?.simpleText ||
            t.languageCode ||
            "",
        }));
        posted = post({
          type: "QT_TRACKS",
          tracks: mapped,
          translationLanguages,
          videoId: vid,
        });
        identifyOriginal(mapped, vid);
        const key = vid + ":orig";
        if (forceFetch || key !== sendTracks._vid || !hasPostedOriginal()) {
          sendTracks._vid = key;
          lastFetchKey = "";
          fetchOriginal();
        }
      }
    } catch {
      /* player not ready */
    }
    return posted;
  }

  function onPlayerTimedtext(raw, text, requestVideoId, requestMeta) {
    const vid = requestVideoId || videoIdFromUrl(raw) || pageVid();
    const generation = requestMeta && requestMeta.generation;
    if (
      !vid ||
      vid !== pageVid() ||
      (generation != null && generation !== videoGeneration)
    )
      return;
    if (requestMeta && requestMeta.trackRevision !== originalTrackRevision) {
      const currentFingerprint = sourceUrlFingerprint(
        originalTrack && (originalTrack.sourceBaseUrl || originalTrack.baseUrl),
      );
      /* MAIN loads at document_start, so a valid host request can begin just
         before sendTracks identifies that same descriptor. Accept that case by
         fingerprint, but reject callbacks tied to a replaced same-video URL. */
      if (
        !currentFingerprint ||
        requestMeta.sourceFingerprint !== currentFingerprint
      )
        return;
    }
    const responseFingerprint =
      (requestMeta && requestMeta.sourceFingerprint) || sourceUrlFingerprint(raw);
    const responseSequence = Number((requestMeta && requestMeta.sequence) || 0);
    if (
      responseSequence &&
      responseSequence < (acceptedNativeResponses.get(responseFingerprint) || 0)
    )
      return;
    noteSignedTimedtext(raw);
    if (!looksLikeCues(text)) {
      if (!hasPostedOriginal()) ensureOriginal();
      return;
    }
    if (responseSequence)
      acceptedNativeResponses.set(
        responseFingerprint,
        Math.max(
          responseSequence,
          acceptedNativeResponses.get(responseFingerprint) || 0,
        ),
      );
    const original = isOriginalPayload(raw, "");
    post({
      type: "QT_TIMEDTEXT",
      url: raw,
      text,
      lang: timedLang(raw, "", original),
      original,
      asr:
        original &&
        !!(
          (originalTrack && originalTrack.kind === "asr") ||
          langFromUrl(raw).kind === "asr"
        ),
      videoId: vid,
    });
    if (!original) {
      ensureOriginal();
    }
  }

  window.fetch = function (...args) {
    const req = args[0];
    const url = typeof req === "string" ? req : req && req.url;
    const requestVideoId = videoIdFromUrl(url) || pageVid();
    const timedtextRequest = !!(
      url && String(url).includes("/api/timedtext")
    );
    if (timedtextRequest && requestVideoId === pageVid())
      resetIfNewVideo(requestVideoId);
    const requestMeta = timedtextRequest
      ? {
          generation: videoGeneration,
          trackRevision: originalTrackRevision,
          sourceFingerprint: sourceUrlFingerprint(url),
          sequence: ++nativeTimedtextSequence,
        }
      : null;
    return origFetch(...args).then((res) => {
      if (timedtextRequest) {
        const raw = String(url);
        res
          .clone()
          .text()
          .then((text) =>
            onPlayerTimedtext(raw, text, requestVideoId, requestMeta),
          )
          .catch(() => {});
      }
      return res;
    });
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__qtUrl = url;
    this.__qtVideoId = videoIdFromUrl(url) || pageVid();
    const timedtextRequest = String(url || "").includes("/api/timedtext");
    if (timedtextRequest && this.__qtVideoId === pageVid())
      resetIfNewVideo(this.__qtVideoId);
    this.__qtRequestMeta = timedtextRequest
      ? {
          generation: videoGeneration,
          trackRevision: originalTrackRevision,
          sourceFingerprint: sourceUrlFingerprint(url),
          sequence: ++nativeTimedtextSequence,
        }
      : null;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      if (this.__qtUrl && String(this.__qtUrl).includes("/api/timedtext")) {
        onPlayerTimedtext(
          String(this.__qtUrl),
          this.responseText,
          this.__qtVideoId,
          this.__qtRequestMeta,
        );
      }
    });
    return origSend.apply(this, args);
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== "quiettube-iso") return;
    if (d.type === "QT_FETCH_TRACK" && d.url) {
      const requestedVid = d.videoId || videoIdFromUrl(d.url);
      if (requestedVid && requestedVid !== pageVid()) return;
      lastFetchKey = "";
      const asOrig = isOriginalPayload(d.url, d.lang);
      fetchTrack(d.url, d.lang, asOrig ? { original: true } : undefined);
    }
    if (d.type === "QT_NEED_TRACKS") {
      const vid = pageVid();
      resetIfNewVideo(vid);
      if (lastTimedOriginal) post({ ...lastTimedOriginal });
      /* A request for current state must never become an unbounded fetch
         loop: force a re-fetch at most once per cooldown, and do not echo
         QT_TRACKS twice (sendTracks already announced it). */
      const now = Date.now();
      const force = now >= needTracksForceAt;
      if (force) needTracksForceAt = now + 2000;
      const announced = sendTracks(force);
      if (!announced && lastTracks) post({ ...lastTracks });
    }
    if (d.type === "QT_RESTORE_DISPLAY_TRACK") restoreDisplayTrack(d);
  });

  const boot = () => sendTracks(true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("yt-navigate-finish", () => {
    const nextVid = pageVid();
    if (nextVid && nextVid === activeVideoId) {
      sendTracks(false);
      return;
    }
    activeVideoId = "";
    videoGeneration++;
    sendTracks._vid = "";
    lastFetchKey = "";
    originalTrack = null;
    originalTrackRevision++;
    acceptedNativeResponses.clear();
    lastTimedOriginal = null;
    lastTracks = null;
    originalFetchInflight = false;
    originalFetchAttempts = 0;
    originalNextRetryAt = 0;
    lastSignedTimedtext = "";
    lastDisplayRestoreKey = "";
    needTracksForceAt = 0;
    /* One pending retry, bound to this navigation. Uncancelled and
       ungenerationed, N navigations inside the 400 ms window left N live
       timers that all fired against whichever video was current when they
       landed — each one a forced re-download of a track already fetched,
       posted and adopted, and each redundant payload re-entered
       adoptOriginalCues() and reset the smoothed-WPM state Pace Lock reads. */
    if (bootRetryTimer) clearTimeout(bootRetryTimer);
    const scheduledFor = videoGeneration;
    const scheduledVid = nextVid;
    bootRetryTimer = setTimeout(() => {
      bootRetryTimer = 0;
      if (videoGeneration !== scheduledFor) return;
      if (pageVid() !== scheduledVid) return;
      sendTracks(true);
    }, 400);
  });
  setInterval(() => sendTracks(false), 3000);
})();
