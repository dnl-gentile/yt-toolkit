/* MAIN world — always pull the ORIGINAL asr timedtext (no tlang) so WPM
   / lock / trim / clock stay on the spoken language (SPEC 1.6.1). */
(function () {
  if (window.__qtMain) return;
  window.__qtMain = true;

  let lastTimedOriginal = null;
  let lastTracks = null;
  let originalTrack = null;
  let originalFetchInflight = false;

  function post(payload) {
    if (payload.type === "QT_TRACKS") lastTracks = payload;
    if (payload.type === "QT_TIMEDTEXT" && payload.original === true) {
      lastTimedOriginal = payload;
    }
    window.postMessage({ source: "quiettube", ...payload }, "*");
  }

  function withJson3(url, keepTlang) {
    if (!url) return url;
    try {
      const u = new URL(url, location.origin);
      u.searchParams.set("fmt", "json3");
      if (!keepTlang) u.searchParams.delete("tlang");
      return u.toString();
    } catch {
      return url + (url.includes("?") ? "&" : "?") + "fmt=json3";
    }
  }

  function stripTlang(url) {
    try {
      const u = new URL(url, location.origin);
      u.searchParams.delete("tlang");
      return u.toString();
    } catch {
      return String(url).replace(/([?&])tlang=[^&]*/g, "").replace(/&&/g, "&");
    }
  }

  function langFromUrl(url) {
    if (!url) return { lang: "", tlang: "", kind: "" };
    try {
      const u = new URL(url, location.origin);
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

  function langsMatch(a, b) {
    const x = String(a || "").toLowerCase();
    const y = String(b || "").toLowerCase();
    if (!x || !y) return false;
    return x === y || x.startsWith(y + "-") || y.startsWith(x);
  }

  function isOriginalPayload(url, lang) {
    const meta = langFromUrl(url);
    const key = String(lang || "").toLowerCase();
    if (meta.tlang || key.startsWith("tlang:")) return false;
    const origLang = ((originalTrack && originalTrack.languageCode) || "").toLowerCase();
    const k = (key.replace(/^tlang:/, "") || meta.lang).toLowerCase();
    if (!origLang) {
      return meta.kind === "asr" || !k || k === "primary";
    }
    if (k && langsMatch(k, origLang)) return true;
    if (meta.kind === "asr" && (!meta.lang || langsMatch(meta.lang, origLang))) {
      return true;
    }
    return false;
  }

  function playerResponse() {
    try {
      const mp = document.querySelector("#movie_player");
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
    return new URLSearchParams(location.search).get("v") || "";
  }

  function looksLikeCues(text) {
    if (!text || text.length < 20) return false;
    if (text[0] === "<") return /<text[\s>]/i.test(text);
    try {
      const j = JSON.parse(text);
      return (j.events || []).some((e) => e.segs && e.segs.length);
    } catch {
      return false;
    }
  }

  function hasPostedOriginal() {
    const vid = pageVid();
    return !!(
      lastTimedOriginal &&
      originalTrack &&
      originalTrack.videoId === vid
    );
  }

  function resetIfNewVideo(vid) {
    if (!vid) return;
    if (originalTrack && originalTrack.videoId === vid) return;
    originalTrack = null;
    lastTimedOriginal = null;
    lastTracks = null;
    lastFetchKey = "";
    sendTracks._vid = "";
    originalFetchInflight = false;
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

  function fetchOriginal() {
    if (!originalTrack || !originalTrack.baseUrl) return;
    if (originalFetchInflight) return;
    originalFetchInflight = true;
    fetchTrack(originalTrack.baseUrl, originalTrack.languageCode, { original: true });
  }

  function fetchTrack(url, lang, opts) {
    const vid = pageVid();
    const token = String(lang || "");
    const forceOriginal = !!(opts && opts.original);
    const keep =
      !forceOriginal &&
      (/[?&]tlang=/.test(String(url)) || token.startsWith("tlang:"));
    const urls = [];
    const add = (u) => {
      if (u && !urls.includes(u)) urls.push(u);
    };
    add(withJson3(forceOriginal ? stripTlang(url) : url, keep));
    if (!keep && token && !token.startsWith("tlang:")) {
      add(
        location.origin +
          "/api/timedtext?v=" +
          encodeURIComponent(vid) +
          "&lang=" +
          encodeURIComponent(token) +
          "&fmt=json3",
      );
      add(
        location.origin +
          "/api/timedtext?v=" +
          encodeURIComponent(vid) +
          "&lang=" +
          encodeURIComponent(token) +
          "&fmt=json3&kind=asr",
      );
    }
    let i = 0;
    const done = () => {
      if (forceOriginal) originalFetchInflight = false;
    };
    const tryNext = () => {
      if (i >= urls.length) {
        done();
        return;
      }
      const u = urls[i++];
      origFetch(u)
        .then((r) => r.text())
        .then((text) => {
          if (looksLikeCues(text)) {
            lastFetchKey = u;
            const original = forceOriginal || isOriginalPayload(u, token);
            post({
              type: "QT_TIMEDTEXT",
              url: u,
              text,
              lang: timedLang(u, token, original),
              original,
            });
            done();
            if (!original) ensureOriginal();
          } else tryNext();
        })
        .catch(tryNext);
    };
    tryNext();
  }

  function identifyOriginal(tracks, vid) {
    if (originalTrack && originalTrack.videoId === vid) return originalTrack;
    const asr = tracks.find((t) => t.kind === "asr") || tracks[0];
    if (!asr) return null;
    originalTrack = {
      languageCode: asr.languageCode || "",
      baseUrl: asr.baseUrl,
      videoId: vid,
    };
    return originalTrack;
  }

  function sendTracks(forceFetch) {
    try {
      const vid = pageVid();
      if (!vid) return;
      resetIfNewVideo(vid);
      const parsed = playerResponse();
      const prVid = parsed?.videoDetails?.videoId || "";
      if (prVid && prVid !== vid) return;
      const tracks =
        parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (!tracks.length) return;
      const mapped = tracks.map((t) => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode,
        name: t.name?.simpleText || t.languageCode,
        kind: t.kind || "",
        vssId: t.vssId,
      }));
      post({ type: "QT_TRACKS", tracks: mapped, videoId: vid });
      identifyOriginal(mapped, vid);
      const key = vid + ":orig";
      if (forceFetch || key !== sendTracks._vid || !hasPostedOriginal()) {
        sendTracks._vid = key;
        lastFetchKey = "";
        fetchOriginal();
      }
    } catch {
      /* player not ready */
    }
  }

  function onPlayerTimedtext(raw, text) {
    const original = isOriginalPayload(raw, "");
    post({
      type: "QT_TIMEDTEXT",
      url: raw,
      text,
      lang: timedLang(raw, "", original),
      original,
    });
    if (!original) ensureOriginal();
  }

  window.fetch = function (...args) {
    const req = args[0];
    const url = typeof req === "string" ? req : req && req.url;
    return origFetch(...args).then((res) => {
      if (url && String(url).includes("/api/timedtext")) {
        const raw = String(url);
        res
          .clone()
          .text()
          .then((text) => onPlayerTimedtext(raw, text))
          .catch(() => {});
      }
      return res;
    });
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__qtUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      if (this.__qtUrl && String(this.__qtUrl).includes("/api/timedtext")) {
        onPlayerTimedtext(String(this.__qtUrl), this.responseText);
      }
    });
    return origSend.apply(this, args);
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== "quiettube-iso") return;
    if (d.type === "QT_FETCH_TRACK" && d.url) {
      lastFetchKey = "";
      const asOrig = isOriginalPayload(d.url, d.lang);
      fetchTrack(d.url, d.lang, asOrig ? { original: true } : undefined);
    }
    if (d.type === "QT_NEED_TRACKS") {
      const vid = pageVid();
      resetIfNewVideo(vid);
      if (lastTimedOriginal) post({ ...lastTimedOriginal });
      sendTracks(true);
      if (lastTracks) post({ ...lastTracks });
    }
  });

  const boot = () => sendTracks(true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("yt-navigate-finish", () => {
    sendTracks._vid = "";
    lastFetchKey = "";
    originalTrack = null;
    lastTimedOriginal = null;
    lastTracks = null;
    originalFetchInflight = false;
    setTimeout(() => sendTracks(true), 400);
  });
  setInterval(() => sendTracks(false), 3000);
})();
