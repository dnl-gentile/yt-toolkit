/*
    YouTube Toolkit — options page behavior.

    Copyright (C) 2025  Daniel Gentile
    SPDX-License-Identifier: GPL-3.0-or-later
*/

// Keep in sync with analytics.js. Absent key = enabled (see PRIVACY.md).
const TELEMETRY_KEY = "qt_telemetry";

const el = {
  telemetry: document.getElementById("telemetry"),
  reset: document.getElementById("reset-id"),
  status: document.getElementById("status"),
  version: document.getElementById("version"),
};

let statusTimer = 0;

function say(message) {
  el.status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.status.textContent = "";
  }, 2600);
}

el.version.textContent = chrome.runtime.getManifest().version;

chrome.storage.sync.get([TELEMETRY_KEY], (result) => {
  el.telemetry.checked = result[TELEMETRY_KEY] !== false;
});

el.telemetry.addEventListener("change", () => {
  const on = el.telemetry.checked;
  chrome.storage.sync.set({ [TELEMETRY_KEY]: on }, () => {
    say(on ? "Usage statistics on." : "Usage statistics off. Nothing is sent.");
  });
});

el.reset.addEventListener("click", () => {
  chrome.storage.local.remove(["ga_client_id"], () => {
    say("Installation ID reset.");
  });
});

// Reflect a change made in another window of this page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[TELEMETRY_KEY]) {
    el.telemetry.checked = changes[TELEMETRY_KEY].newValue !== false;
  }
});
