/* Persist toggles. local wins over sync. Missing key → default, never overwrite. */
(function (root) {
  const DEFAULTS = {
    noDistractionsEnabled: true,
    qt_targetWpm: 180,
    qt_paceLock: true,
    qt_trimSilence: true,
    qt_playbackRate: 1,
    qt_fixed1x: false,
    qt_wordHighlight: true,
    qt_centerWord: false,
    qt_dualCaptions: false,
    qt_captionBg: true,
    qt_captionLangs: [],
    qt_primaryTrack: "",
    qt_secondaryTrack: "",
    qt_vjs_dualCaptions: false,
    qt_vjs_primaryTrack: "",
    qt_vjs_secondaryTrack: "",
    qt_vjs_slotsChosen: false,
    /* null means the user has not explicitly chosen yet: follow YouTube. */
    qt_captionsEnabled: null,
  };

  function alive() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function bool(v, fallback) {
    if (v === true || v === false) return v;
    return fallback;
  }

  function get(keys, cb) {
    const list = Array.isArray(keys) ? keys : [keys];
    const finish = (s) => {
      const out = {};
      list.forEach((k) => {
        out[k] = s[k] !== undefined ? s[k] : DEFAULTS[k];
      });
      cb(out);
    };
    if (!alive() || !chrome.storage) {
      finish({});
      return;
    }
    const pull = (area, next) => {
      try {
        chrome.storage[area].get(list, (s) => {
          try {
            if (chrome.runtime.lastError) return next({});
          } catch {
            return next({});
          }
          next(s || {});
        });
      } catch {
        next({});
      }
    };
    pull("sync", (sync) => {
      pull("local", (local) => {
        finish(Object.assign({}, sync, local));
      });
    });
  }

  function set(obj) {
    if (!obj || !Object.keys(obj).length) return;
    if (!alive() || !chrome.storage) return;
    try {
      chrome.storage.local.set(obj);
    } catch {
      /* invalidated */
    }
    try {
      chrome.storage.sync.set(obj);
    } catch {
      /* invalidated */
    }
  }

  /* First install only fills holes. Reload of unpacked must not reset toggles. */
  function seedDefaults() {
    if (!alive() || !chrome.storage) return;
    get(Object.keys(DEFAULTS), (s) => {
      const patch = {};
      Object.keys(DEFAULTS).forEach((k) => {
        if (s[k] === undefined) patch[k] = DEFAULTS[k];
      });
      /* get() already fills defaults into `s` — distinguish stored vs filled: */
    });
    try {
      chrome.storage.sync.get(Object.keys(DEFAULTS), (s) => {
        const patch = {};
        Object.keys(DEFAULTS).forEach((k) => {
          if (s[k] === undefined) patch[k] = DEFAULTS[k];
        });
        if (Object.keys(patch).length) set(patch);
      });
    } catch {
      /* invalidated */
    }
  }

  const api = { DEFAULTS, bool, get, set, seedDefaults, alive };
  root.YtToolkitPrefs = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
