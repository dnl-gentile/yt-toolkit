/* Survive chrome://extensions reload while YouTube tabs stay open.
   chrome.runtime.sendMessage throws "Extension context invalidated" otherwise. */
(function (root) {
  function alive() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function send(msg, cb) {
    if (!alive()) return false;
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (!alive()) return;
        try {
          if (chrome.runtime.lastError) return;
        } catch {
          return;
        }
        if (typeof cb === "function") cb(res);
      });
      return true;
    } catch {
      return false;
    }
  }

  const api = { alive, send };
  root.YtToolkitExt = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
