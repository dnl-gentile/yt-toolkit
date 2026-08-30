/*
    YouTube Toolkit - A Chrome extension: No Distractions, constant WPM pace,
    dual captions and word highlight.

    Copyright (C) 2025  Daniel Gentile
    SPDX-License-Identifier: GPL-3.0-or-later

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Import analytics
importScripts('analytics.js');

// Initialize Google Analytics
const analytics = new Analytics('G-Y6EVNLSKLJ', 'JuFahXeVR0anCWYMk94y4g');

// Set the default state on installation
chrome.runtime.onInstalled.addListener((details) => {
  const defaults = {
    noDistractionsEnabled: true,
    qt_targetWpm: 180,
    qt_paceLock: true,
    qt_trimSilence: true,
    qt_playbackRate: 1,
    qt_fixed1x: false,
    qt_overlayMode: "both",
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
    qt_captionsEnabled: null,
    qt_telemetry: true,
  };
  chrome.storage.sync.get(Object.keys(defaults), (s) => {
    const patch = {};
    for (const k of Object.keys(defaults)) {
      if (s[k] === undefined) patch[k] = defaults[k];
    }
    if (Object.keys(patch).length) {
      chrome.storage.sync.set(patch);
      chrome.storage.local.set(patch);
    }
  });
  if (details.reason === "install") analytics.trackInstall();
});

// Listen for navigation events to 'youtube.com'
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    // Only act on top-level navigation, not iframes
    if (details.frameId !== 0) {
      return;
    }

    const url = new URL(details.url);
    // Check if it's the homepage (path is '/' or empty, or just /feed)
    const isHomepage = url.pathname === '/' || 
                       url.pathname === '/index.html' || 
                       url.pathname === '' ||
                       url.pathname === '/feed' ||
                       (url.pathname === '/feed/' && url.search === '');
    
    if (isHomepage) {
      chrome.storage.sync.get(['noDistractionsEnabled'], ({ noDistractionsEnabled }) => {
        if (noDistractionsEnabled) {
          // Track homepage redirect
          analytics.trackHomepageRedirect();
          // Redirect to the quiet app
          chrome.tabs.update(details.tabId, { url: 'https://yt-search-bar.web.app' });
        }
      });
    }
  },
  {
    url: [{ hostEquals: 'www.youtube.com' }]
  }
);

// Also listen for completed navigation to catch SPA navigation
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId !== 0) {
      return;
    }

    const url = new URL(details.url);
    const isHomepage = url.pathname === '/' || 
                       url.pathname === '/index.html' || 
                       url.pathname === '' ||
                       url.pathname === '/feed' ||
                       (url.pathname === '/feed/' && url.search === '');
    
    if (isHomepage) {
      chrome.storage.sync.get(['noDistractionsEnabled'], ({ noDistractionsEnabled }) => {
        if (noDistractionsEnabled) {
          // Track homepage redirect
          analytics.trackHomepageRedirect();
          // Redirect to the quiet app
          chrome.tabs.update(details.tabId, { url: 'https://yt-search-bar.web.app' });
        }
      });
    }
  },
  {
    url: [{ hostEquals: 'www.youtube.com' }]
  }
);

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "QT_FETCH" && message.url) {
    fetch(message.url, { credentials: "include" })
      .then((r) => r.text())
      .then((text) => sendResponse({ text }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (message.action === 'toggleNoDistractions') {
    // Get current state
    chrome.storage.sync.get(['noDistractionsEnabled'], ({ noDistractionsEnabled }) => {
      const newState = !noDistractionsEnabled;

      // Track toggle event
      analytics.trackToggle(newState);

      // Save the new state
      chrome.storage.sync.set({ noDistractionsEnabled: newState }, () => {
        
        // Check if we're on a video page
        chrome.tabs.get(sender.tab.id, (tab) => {
          const isVideoPage = tab.url && tab.url.includes('/watch');
          
          if (isVideoPage) {
            // Track video page interaction
            analytics.trackVideoPage();
            // If on video page, don't reload - let content script handle show/hide dynamically
            // Just notify the content script to update
            chrome.tabs.sendMessage(
              sender.tab.id,
              { action: 'updateNoDistractions', noDistractionsEnabled: newState },
              () => void chrome.runtime.lastError,
            );
          } else {
            // Otherwise navigate normally
            const targetUrl = newState ? 'https://yt-search-bar.web.app' : 'https://www.youtube.com';
            chrome.tabs.update(sender.tab.id, { url: targetUrl });
          }
        });

        // Notify other tabs to update their icons
        notifyAllTabs(newState);
      });
    });
    return true; // Indicates an async response
  }
  
  if (message.action === 'navigateToQuietMode') {
    // Handle logo click redirect
    chrome.tabs.update(sender.tab.id, { url: 'https://yt-search-bar.web.app' });
    return true;
  }
});

// Listen for state changes (e.g., from other tabs) and update all tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.noDistractionsEnabled) {
    const newState = changes.noDistractionsEnabled.newValue;
    notifyAllTabs(newState);
  }
});

function notifyAllTabs(newState) {
  chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://yt-search-bar.web.app/*"] }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'updateIcon', noDistractionsEnabled: newState },
        () => void chrome.runtime.lastError,
      );
    }
  });
}
