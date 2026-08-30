/*
    YouTube Toolkit — Google Analytics helper (Measurement Protocol, no external scripts).

    Copyright (C) 2025  Daniel Gentile
    SPDX-License-Identifier: GPL-3.0-or-later

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version. See <https://www.gnu.org/licenses/>.
*/

/*
 * Telemetry is anonymous, aggregate and OPT-OUT.
 * The single switch is `qt_telemetry` in chrome.storage.sync (default true),
 * exposed to the user on the extension's options page. Every send goes through
 * isEnabled() — there is no code path that reports while the switch is off.
 * What is and is not collected is documented in PRIVACY.md.
 */

const TELEMETRY_KEY = 'qt_telemetry';

class Analytics {
  constructor(measurementId, apiSecret) {
    this.measurementId = measurementId; // G-XXXXXXXXXX
    this.apiSecret = apiSecret; // Measurement Protocol API secret
  }

  // Opt-out gate. Absent key = enabled (default on, as declared in PRIVACY.md).
  async isEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get([TELEMETRY_KEY], (result) => {
          resolve(result[TELEMETRY_KEY] !== false);
        });
      } catch {
        resolve(false); // no storage, no reporting
      }
    });
  }

  // Get or create a unique client ID for this installation
  async getOrCreateClientId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ga_client_id'], (result) => {
        if (result.ga_client_id) {
          resolve(result.ga_client_id);
        } else {
          const clientId = this.generateClientId();
          chrome.storage.local.set({ ga_client_id: clientId }, () => {
            resolve(clientId);
          });
        }
      });
    });
  }

  generateClientId() {
    // Random per-installation id. Not derived from any account or device value.
    return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
  }

  // Forget the installation id, so a later opt-in starts from a new one.
  async resetClientId() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(['ga_client_id'], () => resolve(true));
      } catch {
        resolve(false);
      }
    });
  }

  // Send event to Google Analytics
  async sendEvent(eventName, eventParams = {}) {
    try {
      if (!(await this.isEnabled())) return false;

      const clientId = await this.getOrCreateClientId();

      const payload = {
        client_id: clientId,
        events: [{
          name: eventName,
          params: {
            ...eventParams,
            engagement_time_msec: 100
          }
        }]
      };

      const url = `https://www.google-analytics.com/mp/collect?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`;

      await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return true;
    } catch (error) {
      console.error('Analytics error:', error);
      // Fail silently - don't break extension functionality
      return false;
    }
  }

  // Track page view (for extension pages)
  async trackPageView(pagePath, pageTitle = '') {
    return this.sendEvent('page_view', {
      page_path: pagePath,
      page_title: pageTitle
    });
  }

  // Track extension installation
  async trackInstall() {
    return this.sendEvent('extension_installed', {
      extension_version: chrome.runtime.getManifest().version
    });
  }

  // Track toggle action
  async trackToggle(enabled) {
    return this.sendEvent('toggle_no_distractions', {
      enabled: enabled,
      value: enabled ? 1 : 0
    });
  }

  // Track feature usage
  async trackFeature(featureName, action = 'used') {
    return this.sendEvent('feature_usage', {
      feature_name: featureName,
      action: action
    });
  }

  // Track video page visit
  async trackVideoPage() {
    return this.sendEvent('video_page_visited');
  }

  // Track homepage redirect
  async trackHomepageRedirect() {
    return this.sendEvent('homepage_redirected');
  }
}

// Export for use in service worker
if (typeof self !== 'undefined') {
  self.Analytics = Analytics;
}

// Export for tests (Node). No-op inside the extension.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Analytics, TELEMETRY_KEY };
}
