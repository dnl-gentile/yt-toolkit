/*
    YouTube No Distractions - A Chrome extension that removes distractions from YouTube.

    Copyright (C) 2025  Daniel Gentile

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

(function() {
  const QUIET_APP_URL = 'https://yt-search-bar.web.app';

  let noDistractionsButton = null;
  const doNotDisturbOnIconURL = chrome.runtime.getURL('icons/quiet_mode_on.png');
  const doNotDisturbOffIconURL = chrome.runtime.getURL('icons/quiet_mode_off.png');
  const doNotDisturbOnIconBlackURL = chrome.runtime.getURL('icons/quiet_mode_on_black.png');
  const doNotDisturbOffIconBlackURL = chrome.runtime.getURL('icons/quiet_mode_off_black.png');

  // Cache starts null so we do not hide or redirect before storage loads.
  let cachedNoDistractionsEnabled = null;
  let isUnloading = false;
  let isNavigating = false;
  let isInitialPageLoad = true;
  let lastUrl = window.location.href;

  // At most two MutationObserver instances (QUALITY.md / SPEC §9).
  // chromeObserver: ytd-masthead + #guide (+ <html> theme attrs)
  // watchObserver: ytd-watch-flexy + #movie_player
  const chromeObserver = new MutationObserver(onChromeMutations);
  const watchObserver = new MutationObserver(onWatchMutations);
  const observed = {
    masthead: null,
    guide: null,
    watchFlexy: null,
    moviePlayer: null,
    watchInners: [],
    html: null
  };

  let chromeRaf = 0;
  let watchRaf = 0;
  const pendingTimeouts = [];

  function isLightTheme() {
    const html = document.documentElement;
    const body = document.body;

    const hasDarkAttribute = html.hasAttribute('dark') || (body && body.hasAttribute('dark'));
    const hasDarkClass = html.classList.contains('dark') || (body && body.classList.contains('dark'));

    const bgColor = body ? window.getComputedStyle(body).backgroundColor : '';
    const isDarkBg = bgColor && (
      bgColor.includes('rgb(15, 15, 15)') ||
      bgColor.includes('rgb(0, 0, 0)') ||
      bgColor.includes('rgb(18, 18, 18)')
    );

    return !(hasDarkAttribute || hasDarkClass || isDarkBg);
  }

  function isVideoPage() {
    return window.location.pathname.startsWith('/watch');
  }

  function isYoutubeHomePath(path) {
    return path === '/' || path === '/feed' || path === '/feed/';
  }

  function getIconURL(isEnabled) {
    const lightTheme = isLightTheme();
    const onVideoPage = isVideoPage();
    if (lightTheme && !onVideoPage) {
      return isEnabled ? doNotDisturbOnIconBlackURL : doNotDisturbOffIconBlackURL;
    }
    return isEnabled ? doNotDisturbOffIconURL : doNotDisturbOnIconURL;
  }

  function shouldSkipDomWork() {
    return isUnloading || isNavigating;
  }

  function later(fn, ms) {
    const id = setTimeout(() => {
      const i = pendingTimeouts.indexOf(id);
      if (i >= 0) pendingTimeouts.splice(i, 1);
      if (!isUnloading) fn();
    }, ms);
    pendingTimeouts.push(id);
    return id;
  }

  function clearPendingTimeouts() {
    for (let i = 0; i < pendingTimeouts.length; i++) {
      clearTimeout(pendingTimeouts[i]);
    }
    pendingTimeouts.length = 0;
  }

  function createToggleButton() {
    const button = document.createElement('button');
    button.id = 'quiet-mode-toggle-button';
    button.className = 'yt-quiet-mode-button';
    button.type = 'button';

    const icon = document.createElement('img');
    icon.id = 'quiet-mode-toggle-icon';
    icon.width = 24;
    icon.height = 24;
    icon.alt = '';
    button.appendChild(icon);

    const tooltip = document.createElement('div');
    tooltip.className = 'yt-quiet-mode-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    chrome.storage.sync.get(['noDistractionsEnabled'], ({ noDistractionsEnabled }) => {
      const enabled = noDistractionsEnabled ?? true;
      tooltip.textContent = enabled ? 'No Distractions - Off' : 'No Distractions - On';
    });
    button.appendChild(tooltip);

    button.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'toggleNoDistractions' });
    });

    let hoverTimeout;
    button.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimeout);
      const isLight = isLightTheme();
      const onVideoPage = isVideoPage();

      if (onVideoPage || !isLight) {
        button.style.setProperty('background-color', 'rgba(255, 255, 255, 0.18)', 'important');
      } else {
        button.style.setProperty('background-color', 'rgba(0, 0, 0, 0.1)', 'important');
      }
      hoverTimeout = setTimeout(() => {
        tooltip.classList.add('visible');
      }, 200);
    });

    button.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
      button.style.removeProperty('background-color');
      tooltip.classList.remove('visible');
    });

    button.setAttribute('aria-label', 'Toggle No Distractions Mode');

    return button;
  }

  function updateIcon(noDistractionsEnabled) {
    if (!noDistractionsButton) return;

    const icon = noDistractionsButton.querySelector('#quiet-mode-toggle-icon');
    const tooltip = noDistractionsButton.querySelector('.yt-quiet-mode-tooltip');
    if (icon) icon.src = getIconURL(noDistractionsEnabled);
    if (tooltip) {
      tooltip.textContent = noDistractionsEnabled
        ? 'No Distractions - Off'
        : 'No Distractions - On';
    }

    if (noDistractionsEnabled) {
      noDistractionsButton.setAttribute('aria-label', 'No Distractions Mode: ON - Click to disable');
      noDistractionsButton.setAttribute('aria-pressed', 'true');
    } else {
      noDistractionsButton.setAttribute('aria-label', 'No Distractions Mode: OFF - Click to enable');
      noDistractionsButton.setAttribute('aria-pressed', 'false');
    }
  }

  function addToggleButtonToNavbar() {
    const existing = document.getElementById('quiet-mode-toggle-button');
    if (existing) {
      noDistractionsButton = existing;
      if (cachedNoDistractionsEnabled !== null) updateIcon(cachedNoDistractionsEnabled);
      return;
    }

    const navbarButtons = document.querySelector('ytd-masthead #end #buttons');
    if (!navbarButtons) return;

    noDistractionsButton = createToggleButton();

    const notificationButton = navbarButtons.querySelector('ytd-notification-topbar-button-renderer');
    if (notificationButton) {
      if (notificationButton.nextSibling) {
        navbarButtons.insertBefore(noDistractionsButton, notificationButton.nextSibling);
      } else {
        navbarButtons.appendChild(noDistractionsButton);
      }
    } else {
      navbarButtons.appendChild(noDistractionsButton);
    }

    if (cachedNoDistractionsEnabled !== null) {
      updateIcon(cachedNoDistractionsEnabled);
    } else {
      chrome.storage.sync.get(['noDistractionsEnabled'], ({ noDistractionsEnabled }) => {
        updateIcon(noDistractionsEnabled ?? true);
      });
    }
  }

  function disconnectObservers() {
    chromeObserver.disconnect();
    watchObserver.disconnect();
    observed.masthead = null;
    observed.guide = null;
    observed.watchFlexy = null;
    observed.moviePlayer = null;
    observed.watchInners = [];
    observed.html = null;
    if (chromeRaf) {
      cancelAnimationFrame(chromeRaf);
      chromeRaf = 0;
    }
    if (watchRaf) {
      cancelAnimationFrame(watchRaf);
      watchRaf = 0;
    }
  }

  function collectWatchInnerTargets(watchFlexy) {
    if (!watchFlexy) return [];
    const nodes = [];
    const push = (el) => {
      if (!el || nodes.indexOf(el) !== -1) return;
      if (el.id === 'movie_player' || (el.closest && el.closest('#movie_player'))) return;
      nodes.push(el);
    };
    // childList only on ancestors that also wrap the player — never subtree there.
    push(watchFlexy.querySelector('#columns'));
    push(watchFlexy.querySelector('#primary'));
    push(watchFlexy.querySelector('#secondary'));
    push(watchFlexy.querySelector('#related'));
    push(watchFlexy.querySelector('#comments'));
    push(watchFlexy.querySelector('#below'));
    push(watchFlexy.querySelector('#panels'));
    push(watchFlexy.querySelector('ytd-watch-metadata'));
    push(watchFlexy.querySelector('#top-row'));
    return nodes;
  }

  function sameNodeList(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function attachObservers() {
    if (shouldSkipDomWork()) return;

    const masthead = document.querySelector('ytd-masthead');
    const guide = document.querySelector('#guide');
    const watchFlexy = isVideoPage() ? document.querySelector('ytd-watch-flexy') : null;
    const moviePlayer = isVideoPage() ? document.querySelector('#movie_player') : null;
    const html = document.documentElement;

    const chromeChanged =
      masthead !== observed.masthead ||
      guide !== observed.guide ||
      html !== observed.html;

    if (chromeChanged) {
      chromeObserver.disconnect();
      observed.masthead = masthead || null;
      observed.guide = guide || null;
      observed.html = html;
      if (masthead) {
        chromeObserver.observe(masthead, { childList: true, subtree: true });
      }
      if (guide) {
        chromeObserver.observe(guide, {
          attributes: true,
          attributeFilter: ['opened', 'hidden', 'class']
        });
      }
      chromeObserver.observe(html, {
        attributes: true,
        attributeFilter: ['dark', 'class']
      });
    }

    if (!cachedNoDistractionsEnabled || !isVideoPage()) {
      watchObserver.disconnect();
      observed.watchFlexy = null;
      observed.moviePlayer = null;
      observed.watchInners = [];
      return;
    }

    const watchInners = collectWatchInnerTargets(watchFlexy);
    const watchChanged =
      watchFlexy !== observed.watchFlexy ||
      moviePlayer !== observed.moviePlayer ||
      !sameNodeList(watchInners, observed.watchInners);

    if (watchChanged) {
      watchObserver.disconnect();
      observed.watchFlexy = watchFlexy || null;
      observed.moviePlayer = moviePlayer || null;
      observed.watchInners = watchInners;
      if (watchFlexy) {
        watchObserver.observe(watchFlexy, {
          childList: true,
          subtree: false,
          attributes: true,
          attributeFilter: ['theater', 'hidden']
        });
      }
      watchInners.forEach((node) => {
        const subtree = node.id !== 'columns' && node.id !== 'primary';
        watchObserver.observe(node, {
          childList: true,
          subtree: subtree,
          attributes: true,
          attributeFilter: ['visibility', 'hidden', 'theater']
        });
      });
      if (moviePlayer) {
        // Direct children only: caption/progress ticks must not re-enter hide work.
        watchObserver.observe(moviePlayer, { childList: true, subtree: false });
      }
    }
  }

  function isUnderMoviePlayer(node) {
    if (!node || !observed.moviePlayer) return false;
    return node === observed.moviePlayer || (node.closest && node.closest('#movie_player') === observed.moviePlayer);
  }

  function watchMutationIsRelevant(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (isUnderMoviePlayer(m.target)) {
        if (m.type !== 'childList' || !m.addedNodes.length) continue;
        for (let j = 0; j < m.addedNodes.length; j++) {
          const n = m.addedNodes[j];
          if (!n || n.nodeType !== 1) continue;
          const cn = typeof n.className === 'string' ? n.className : '';
          const tag = n.tagName || '';
          if (
            cn.includes('endscreen') ||
            cn.includes('videowall') ||
            cn.includes('suggestion-set') ||
            cn.includes('autonav') ||
            tag.includes('ENDSCREEN')
          ) {
            return true;
          }
        }
        continue;
      }
      return true;
    }
    return false;
  }

  function onChromeMutations() {
    if (shouldSkipDomWork() || cachedNoDistractionsEnabled === null) return;
    if (chromeRaf) return;
    chromeRaf = requestAnimationFrame(() => {
      chromeRaf = 0;
      if (shouldSkipDomWork()) return;
      attachObservers();
      addToggleButtonToNavbar();
      ensureSearchAutocompleteVisible();
      if (noDistractionsButton && cachedNoDistractionsEnabled !== null) {
        updateIcon(cachedNoDistractionsEnabled);
      }
      if (cachedNoDistractionsEnabled) {
        applyNoDistractionsToNavbar();
        collapseLeftSidebar();
      }
    });
  }

  function onWatchMutations(mutations) {
    if (shouldSkipDomWork() || cachedNoDistractionsEnabled === null) return;
    if (!cachedNoDistractionsEnabled || !isVideoPage()) return;
    if (mutations && mutations.length && !watchMutationIsRelevant(mutations)) return;
    if (watchRaf) return;
    watchRaf = requestAnimationFrame(() => {
      watchRaf = 0;
      if (shouldSkipDomWork() || !cachedNoDistractionsEnabled || !isVideoPage()) return;
      attachObservers();
      removeComments();
      removeSuggestions();
      removeEndScreenRecommendations();
      hideActionButtons();
      replaceVerificationTags();
    });
  }

  function redirectToQuietApp() {
    if (isUnloading) return;
    isUnloading = true;
    isNavigating = true;
    clearPendingTimeouts();
    disconnectObservers();
    window.location.replace(QUIET_APP_URL);
  }

  function checkAndRedirect() {
    if (!cachedNoDistractionsEnabled || isUnloading) return;
    const path = window.location.pathname;
    if (isYoutubeHomePath(path) && window.location.hostname === 'www.youtube.com') {
      redirectToQuietApp();
    }
  }

  function interceptLogoClick() {
    document.addEventListener('click', function(e) {
      if (!cachedNoDistractionsEnabled || isUnloading) return;

      let element = e.target;
      let isLogoClick = false;

      for (let i = 0; i < 10 && element; i++) {
        if (
          element.id === 'logo' ||
          element.id === 'logo-container' ||
          (element.classList && element.classList.contains('logo')) ||
          element.tagName === 'YTD-TOPBAR-LOGO-RENDERER' ||
          (element.tagName === 'A' && element.closest && element.closest('ytd-topbar-logo-renderer')) ||
          (element.closest && element.closest('ytd-topbar-logo-renderer'))
        ) {
          isLogoClick = true;
          break;
        }
        element = element.parentElement;
      }

      if (!isLogoClick) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      redirectToQuietApp();
    }, true);
  }

  let guideButtonClickInterceptorAdded = false;
  function interceptGuideButtonClicks() {
    if (guideButtonClickInterceptorAdded) return;

    document.addEventListener('click', function(e) {
      if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;

      const guideButton = e.target.closest && e.target.closest(
        '#guide-button, yt-icon-button#guide-button, button#guide-button, ytd-masthead #guide-button, button[aria-label="Guide"], button[aria-label="Guia"]'
      );
      if (!guideButton) return;
      // Never treat the account cluster as the left guide.
      if (e.target.closest('#end, #avatar-btn, ytd-topbar-menu-button-renderer, #buttons')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      collapseLeftSidebar();
    }, true);

    guideButtonClickInterceptorAdded = true;
  }

  function bindEngagementPanelClicks() {
    document.addEventListener(
      'click',
      (e) => {
        if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;
        const t = e.target && e.target.closest && e.target.closest('button, a, yt-button-shape, ytd-button-renderer, .ytp-button');
        if (!t) return;
        const label = (
          (t.getAttribute('aria-label') || '') +
          ' ' +
          (t.textContent || '')
        ).toLowerCase();
        if (
          /in this video|neste v[ií]deo|transcript|transcri[cç][aã]o|timeline|cap[ií]tulos|chapters/.test(
            label,
          )
        ) {
          const secondary = document.querySelector(
            'ytd-watch-flexy #secondary, #secondary',
          );
          if (secondary) {
            clearSecondaryHiddenStyles(secondary);
            restorePrimaryColumn();
          }
        }
      },
      true,
    );
  }

  function pathFromNavigateEvent(e) {
    const detail = e && e.detail;
    if (!detail) return '';
    const raw = detail.url || detail.pageUrl || '';
    if (!raw) return '';
    try {
      return new URL(raw, window.location.origin).pathname;
    } catch (err) {
      return '';
    }
  }

  function handleNavigateStart(e) {
    isNavigating = true;
    disconnectObservers();
    const path = pathFromNavigateEvent(e);
    if (cachedNoDistractionsEnabled && path && isYoutubeHomePath(path)) {
      isUnloading = true;
      clearPendingTimeouts();
    }
  }

  function handleNavigateFinish() {
    if (isUnloading) return;
    isNavigating = false;
    isInitialPageLoad = true;
    lastUrl = window.location.href;

    if (cachedNoDistractionsEnabled) {
      checkAndRedirect();
      if (isUnloading) return;
    }

    attachObservers();
    addToggleButtonToNavbar();
    ensureSearchAutocompleteVisible();
    if (noDistractionsButton && cachedNoDistractionsEnabled !== null) {
      updateIcon(cachedNoDistractionsEnabled);
    }

    if (cachedNoDistractionsEnabled) {
      applyNoDistractionsToNavbar();
      collapseLeftSidebar();
      if (isVideoPage()) {
        checkAndApplyNoDistractions();
        replaceVerificationTags();
      }
    }

    scheduleAttachRetries();
  }

  function handlePageDataUpdated() {
    if (isUnloading) return;
    isNavigating = false;
    attachObservers();
    addToggleButtonToNavbar();
    if (cachedNoDistractionsEnabled) {
      applyNoDistractionsToNavbar();
      collapseLeftSidebar();
      if (isVideoPage()) applyNoDistractionsToVideoPage();
    } else {
      ensureSearchAutocompleteVisible();
    }
  }

  function teardown() {
    isUnloading = true;
    isNavigating = true;
    clearPendingTimeouts();
    disconnectObservers();
  }

  function scheduleAttachRetries() {
    [0, 100, 400, 1000].forEach((ms) => {
      later(() => {
        if (shouldSkipDomWork()) return;
        attachObservers();
        addToggleButtonToNavbar();
        if (cachedNoDistractionsEnabled) {
          applyNoDistractionsToNavbar();
          collapseLeftSidebar();
          if (isVideoPage()) applyNoDistractionsToVideoPage();
        } else {
          ensureSearchAutocompleteVisible();
        }
      }, ms);
    });
  }

  function applyCurrentMode() {
    if (shouldSkipDomWork() || cachedNoDistractionsEnabled === null) return;
    ensureSearchAutocompleteVisible();
    addToggleButtonToNavbar();
    if (noDistractionsButton) updateIcon(cachedNoDistractionsEnabled);

    if (cachedNoDistractionsEnabled) {
      checkAndRedirect();
      if (isUnloading) return;
      applyNoDistractionsToNavbar();
      collapseLeftSidebar();
      if (isVideoPage()) checkAndApplyNoDistractions();
    } else {
      restoreNavbarButtons();
      restoreLeftSidebar();
    }
  }

  function onNoDistractionsToggle(enabled) {
    cachedNoDistractionsEnabled = enabled;
    if (noDistractionsButton) updateIcon(enabled);

    attachObservers();
    isInitialPageLoad = false;

    if (enabled) {
      clearPendingTimeouts();
      applyNoDistractionsToNavbar();
      collapseLeftSidebar();
      if (isVideoPage()) checkAndApplyNoDistractions();
    } else {
      restoreNavbarButtons();
      restoreLeftSidebar();
      ensureSearchAutocompleteVisible();
      if (isVideoPage()) scheduleRestoreAfterDisable();
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateIcon') {
      if (typeof message.noDistractionsEnabled === 'boolean') {
        cachedNoDistractionsEnabled = message.noDistractionsEnabled;
      }
      updateIcon(message.noDistractionsEnabled);
    }
    if (message.action === 'updateNoDistractions') {
      onNoDistractionsToggle(message.noDistractionsEnabled);
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.noDistractionsEnabled) return;
    const next = changes.noDistractionsEnabled.newValue;
    if (next === cachedNoDistractionsEnabled) return;
    onNoDistractionsToggle(next);
  });

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    checkAndRedirect();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    checkAndRedirect();
  };

  window.addEventListener('popstate', checkAndRedirect);

  document.addEventListener('yt-navigate-start', handleNavigateStart, true);
  document.addEventListener('yt-navigate-finish', handleNavigateFinish, true);
  document.addEventListener('yt-page-data-updated', handlePageDataUpdated, true);
  window.addEventListener('pagehide', teardown);
  window.addEventListener('beforeunload', teardown);
  window.addEventListener('unload', teardown);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      isUnloading = false;
      isNavigating = false;
      attachObservers();
      applyCurrentMode();
    }
  });

  function applyNoDistractionsToVideoPage() {
    if (shouldSkipDomWork() || !cachedNoDistractionsEnabled || !isVideoPage()) {
      return;
    }

    enableTheaterMode();
    removeSuggestions();
    removeComments();
    hideActionButtons();
    removeEndScreenRecommendations();
  }

  function ensureSearchAutocompleteVisible() {
    const searchBoxSelectors = [
      'ytd-searchbox',
      'ytd-searchbox-spt',
      '#searchbox',
      '#searchbox-spt',
      'ytd-searchbox-spt #container',
      'ytd-searchbox-spt ytd-searchbox-renderer',
      'ytd-searchbox-spt #suggestions',
      'ytd-searchbox-spt ytd-searchbox-renderer #suggestions',
      '#searchbox-spt #suggestions'
    ];

    searchBoxSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.dataset.noDistractionsHidden === 'true') {
          element.style.display = '';
          element.style.visibility = '';
          element.style.opacity = '';
          element.removeAttribute('data-no-distractions-hidden');
        }
        if (window.getComputedStyle(element).display === 'none' &&
            !element.dataset.noDistractionsHidden) {
          const isSearchBox = element.tagName === 'YTD-SEARCHBOX' ||
                             element.id === 'searchbox' ||
                             element.id === 'searchbox-spt' ||
                             element.closest('ytd-searchbox') ||
                             selector.includes('searchbox');
          if (isSearchBox) {
            element.style.display = '';
            element.style.visibility = 'visible';
            element.style.opacity = '1';
          }
        }
      });
    });
  }

  function applyNoDistractionsToNavbar() {
    if (shouldSkipDomWork()) return;
    if (!cachedNoDistractionsEnabled) {
      restoreNavbarButtons();
      restoreLeftSidebar();
      ensureSearchAutocompleteVisible();
      return;
    }

    ensureSearchAutocompleteVisible();
    collapseLeftSidebar();

    const createButton = document.querySelector(
      'ytd-button-renderer button[aria-label="Create"], ' +
      'ytd-button-renderer button[aria-label*="Create"], ' +
      'ytd-button-renderer button[aria-label*="create"], ' +
      'ytd-button-renderer[aria-label*="Create"], ' +
      'ytd-topbar-menu-button-renderer[aria-label*="Create"], ' +
      'ytd-topbar-menu-button-renderer[aria-label*="create"], ' +
      '#create-icon, ' +
      'ytd-topbar-menu-button-renderer button[aria-label*="Create"], ' +
      'ytd-topbar-menu-button-renderer button[aria-label*="create"], ' +
      'a[aria-label*="Create"], ' +
      'a[aria-label*="create"]'
    );

    if (createButton) {
      const buttonRenderer = createButton.closest('ytd-button-renderer') || createButton;
      buttonRenderer.style.display = 'none';
      buttonRenderer.dataset.noDistractionsHidden = 'true';
    } else {
      const allButtonRenderers = document.querySelectorAll('ytd-button-renderer, ytd-topbar-menu-button-renderer, a[href*="/create"]');
      allButtonRenderers.forEach(btn => {
        if (btn.id === 'avatar-btn' || btn.closest('#avatar-btn')) return;
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const buttonAriaLabel = btn.querySelector('button')?.getAttribute('aria-label') || '';
        const text = btn.textContent || '';
        const href = btn.getAttribute('href') || '';
        if (ariaLabel.toLowerCase().includes('create') ||
            buttonAriaLabel.toLowerCase().includes('create') ||
            text.toLowerCase().includes('create') ||
            href.includes('/create')) {
          btn.style.display = 'none';
          btn.dataset.noDistractionsHidden = 'true';
        }
      });
    }

    const notificationButton = document.querySelector('ytd-notification-topbar-button-renderer, #notification-button, button[aria-label*="Notifications"], button[aria-label*="notifications"]');
    if (notificationButton) {
      notificationButton.style.display = 'none';
      notificationButton.dataset.noDistractionsHidden = 'true';
    }
  }

  function restoreNavbarButtons() {
    const navbar = document.querySelector('ytd-masthead #end #buttons') || document.querySelector('ytd-masthead');
    if (!navbar) return;

    const hiddenButtons = navbar.querySelectorAll('[data-no-distractions-hidden="true"]');
    hiddenButtons.forEach(btn => {
      btn.style.display = '';
      btn.removeAttribute('data-no-distractions-hidden');
    });
  }

  function collapseLeftSidebar() {
    if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;

    const guideSelectors = [
      '#guide',
      'ytd-guide-renderer',
      '#guide-content',
      'ytd-mini-guide-renderer',
      '#sections'
    ];

    let sidebarCollapsed = false;

    guideSelectors.forEach(selector => {
      const guide = document.querySelector(selector);
      if (guide) {
        const computedStyle = window.getComputedStyle(guide);
        const width = parseFloat(computedStyle.width) || 0;
        const isExpanded = width > 50 ||
                          guide.hasAttribute('opened') ||
                          guide.classList.contains('opened') ||
                          guide.offsetWidth > 50;

        if (isExpanded) {
          if (!guide.dataset.originalDisplay) {
            guide.dataset.originalDisplay = computedStyle.display;
            guide.dataset.originalWidth = computedStyle.width;
          }

          guide.style.setProperty('width', '0px', 'important');
          guide.style.setProperty('min-width', '0px', 'important');
          guide.style.setProperty('max-width', '0px', 'important');
          guide.style.setProperty('opacity', '0', 'important');
          guide.style.setProperty('visibility', 'hidden', 'important');
          guide.style.setProperty('pointer-events', 'none', 'important');
          guide.style.setProperty('transform', 'translateX(-100%)', 'important');
          guide.setAttribute('data-no-distractions-collapsed', 'true');
          sidebarCollapsed = true;
        }
      }
    });

    if (!sidebarCollapsed) {
      const collapseButton = document.querySelector(
        'button[aria-label="Guide"], ' +
        'button[aria-label="Guia"], ' +
        '#guide-button, ' +
        'yt-icon-button#guide-button, ' +
        'button#guide-button, ' +
        'ytd-masthead #guide-button'
      );

      if (collapseButton) {
        const guide = document.querySelector('#guide, ytd-guide-renderer');
        if (guide) {
          const width = parseFloat(window.getComputedStyle(guide).width) || 0;
          const isExpanded = width > 50 || guide.offsetWidth > 50;

          if (isExpanded) {
            guide.style.setProperty('width', '0px', 'important');
            guide.style.setProperty('min-width', '0px', 'important');
            guide.style.setProperty('max-width', '0px', 'important');
            guide.style.setProperty('opacity', '0', 'important');
            guide.style.setProperty('visibility', 'hidden', 'important');
            guide.setAttribute('data-no-distractions-collapsed', 'true');
          }
        }
      }
    }
  }

  function restoreLeftSidebar() {
    if (cachedNoDistractionsEnabled || isUnloading) return;

    const collapsedGuides = document.querySelectorAll('[data-no-distractions-collapsed="true"]');
    collapsedGuides.forEach(guide => {
      if (guide.dataset.originalDisplay) {
        guide.style.removeProperty('width');
        guide.style.removeProperty('min-width');
        guide.style.removeProperty('max-width');
        guide.style.removeProperty('opacity');
        guide.style.removeProperty('visibility');
        guide.style.removeProperty('pointer-events');
        guide.style.removeProperty('transform');
        guide.removeAttribute('data-no-distractions-collapsed');
        guide.removeAttribute('data-original-display');
        guide.removeAttribute('data-original-width');
      }
    });

    const guideButton = document.querySelector(
      'button[aria-label="Guide"], ' +
      'button[aria-label="Guia"], ' +
      '#guide-button, ' +
      'yt-icon-button#guide-button'
    );

    if (guideButton) {
      const guide = document.querySelector('#guide, ytd-guide-renderer');
      if (guide) {
        const isCollapsed = guide.offsetWidth < 50 ||
                           guide.style.width === '0px' ||
                           guide.hasAttribute('data-no-distractions-collapsed');

        if (isCollapsed) {
          guideButton.click();
        }
      }
    }
  }

  function enableTheaterMode() {
    if (shouldSkipDomWork() || !cachedNoDistractionsEnabled) return;

    const isTheaterMode = document.querySelector('.watch-stage-mode, [theater], .watch-wide-mode') ||
                         document.body.classList.contains('watch-stage-mode') ||
                         document.body.classList.contains('watch-wide-mode');

    if (isTheaterMode) return;

    const theaterButton = document.querySelector(
      'button[aria-label*="Theater"], ' +
      'button[title*="Theater"], ' +
      'ytd-size-toggle-renderer button, ' +
      '.ytp-size-button, ' +
      'button[aria-label*="theater mode"], ' +
      '.ytp-size-button:not(.ytp-size-button-small)'
    );

    if (theaterButton) {
      const ariaLabel = theaterButton.getAttribute('aria-label') || '';
      if (ariaLabel.toLowerCase().includes('theater') ||
          !ariaLabel.toLowerCase().includes('fullscreen')) {
        theaterButton.click();
      }
    } else {
      later(() => {
        if (shouldSkipDomWork() || !cachedNoDistractionsEnabled) return;
        const sizeToggle = document.querySelector('ytd-size-toggle-renderer');
        if (sizeToggle) {
          const buttons = sizeToggle.querySelectorAll('button');
          if (buttons.length > 0 && buttons[0]) {
            buttons[0].click();
          }
        }
      }, 500);
    }
  }

  function applySecondaryHiddenStyles(element) {
    if (!element || element.dataset.noDistractionsSecondaryCollapse === 'true') return;

    element.dataset.noDistractionsHidden = 'true';
    element.dataset.noDistractionsSecondaryCollapse = 'true';

    element.style.setProperty('flex', '0 0 0', 'important');
    element.style.setProperty('width', '0px', 'important');
    element.style.setProperty('min-width', '0px', 'important');
    element.style.setProperty('max-width', '0px', 'important');
    element.style.setProperty('margin', '0', 'important');
    element.style.setProperty('padding', '0', 'important');
    element.style.setProperty('opacity', '0', 'important');
    element.style.setProperty('pointer-events', 'none', 'important');
    element.style.setProperty('visibility', 'hidden', 'important');
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('position', 'relative', 'important');
  }

  function clearSecondaryHiddenStyles(element) {
    if (!element || element.dataset.noDistractionsSecondaryCollapse !== 'true') return;

    element.style.removeProperty('flex');
    element.style.removeProperty('width');
    element.style.removeProperty('min-width');
    element.style.removeProperty('max-width');
    element.style.removeProperty('margin');
    element.style.removeProperty('padding');
    element.style.removeProperty('opacity');
    element.style.removeProperty('pointer-events');
    element.style.removeProperty('visibility');
    element.style.removeProperty('display');
    element.style.removeProperty('position');

    element.removeAttribute('data-no-distractions-hidden');
    delete element.dataset.noDistractionsSecondaryCollapse;
  }

  function expandPrimaryColumn() {
    const primary = document.querySelector('ytd-watch-flexy #primary');
    if (!primary) return;
    primary.dataset.noDistractionsPrimaryExpanded = 'true';
    primary.style.setProperty('flex', '1 1 100%', 'important');
    primary.style.setProperty('max-width', '100%', 'important');
  }

  function restorePrimaryColumn() {
    const primaries = document.querySelectorAll('ytd-watch-flexy #primary[data-no-distractions-primary-expanded="true"]');
    primaries.forEach(primary => {
      primary.style.removeProperty('flex');
      primary.style.removeProperty('max-width');
      primary.removeAttribute('data-no-distractions-primary-expanded');
    });
  }

  function inThisVideoOpen() {
    return !!document.querySelector(
      'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
    );
  }

  function hideRelatedOnly() {
    document
      .querySelectorAll(
        '#related, ytd-watch-flexy #related, ytd-watch-next-secondary-results-renderer',
      )
      .forEach((el) => {
        if (el.closest && el.closest('ytd-engagement-panel-section-list-renderer')) return;
        applySecondaryHiddenStyles(el);
      });
  }

  function removeSuggestions() {
    if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;

    hideRelatedOnly();

    const secondary = document.querySelector('ytd-watch-flexy #secondary, #columns #secondary, #secondary');
    if (!secondary) return;

    // Keep #secondary alive so "In this video" / Timeline / Transcript can open.
    if (inThisVideoOpen()) {
      clearSecondaryHiddenStyles(secondary);
      restorePrimaryColumn();
      hideRelatedOnly();
      secondary.querySelectorAll('ytd-engagement-panel-section-list-renderer').forEach((p) => {
        p.style.removeProperty('display');
        p.style.removeProperty('visibility');
        p.style.removeProperty('pointer-events');
        p.style.removeProperty('width');
        p.style.removeProperty('max-width');
        p.style.removeProperty('opacity');
      });
    } else {
      applySecondaryHiddenStyles(secondary);
      expandPrimaryColumn();
    }
  }

  function restoreSuggestions() {
    if (isUnloading) return;
    const selectors = [
      '#secondary',
      'ytd-watch-flexy #secondary',
      'ytd-watch-flexy[role="main"] #secondary',
      '#columns #secondary',
      'ytd-watch-flexy ytd-watch-next-secondary-results-renderer',
      'ytd-watch-next-secondary-results-renderer',
      '#secondary-inner',
      '#related',
      'ytd-watch-flexy #related'
    ];

    selectors.forEach(selector => {
      const matches = document.querySelectorAll(selector);
      matches.forEach(secondary => {
        const computedStyle = window.getComputedStyle(secondary);
        const isHidden = secondary.dataset.noDistractionsHidden === 'true' ||
                        secondary.dataset.noDistractionsSecondaryCollapse === 'true' ||
                        secondary.style.display === 'none' ||
                        computedStyle.display === 'none' ||
                        secondary.getAttribute('hidden') === 'true';

        if (isHidden) {
          if (secondary.hasAttribute('hidden')) {
            secondary.removeAttribute('hidden');
          }

          clearSecondaryHiddenStyles(secondary);

          secondary.style.display = '';
          secondary.style.visibility = '';
          secondary.removeAttribute('data-no-distractions-hidden');
          secondary.removeAttribute('data-original-display');
          secondary.removeAttribute('data-original-visibility');

          if (secondary.getBoundingClientRect().width < 10) {
            secondary.style.display = 'block';
            secondary.style.visibility = 'visible';
          }
        }
      });
    });

    restorePrimaryColumn();
    window.dispatchEvent(new Event('resize'));
  }

  function removeComments() {
    if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;

    const selectors = [
      '#comments',
      'ytd-comments#comments',
      'ytd-watch-flexy #comments',
      '#primary #comments',
      'ytd-comments',
      'ytd-comments-header-renderer',
      '[id="comments"]',
      'ytd-watch-flexy ytd-item-section-renderer[target-id="watch-discussion"]',
      'ytd-item-section-renderer:has(#comments)',
      'ytd-item-section-renderer:has(ytd-comments)'
    ];

    selectors.forEach(selector => {
      try {
        const comments = document.querySelector(selector);
        if (comments) {
          const hasCommentContent = comments.id === 'comments' ||
                                    comments.tagName === 'YTD-COMMENTS' ||
                                    comments.querySelector('ytd-comments') ||
                                    comments.querySelector('#comments') ||
                                    comments.getAttribute('target-id') === 'watch-discussion';

          if (hasCommentContent) {
            if (!comments.dataset.originalDisplay) {
              const computedStyle = window.getComputedStyle(comments);
              comments.dataset.originalDisplay = computedStyle.display;
              comments.dataset.originalVisibility = computedStyle.visibility;
            }

            comments.style.display = 'none';
            comments.style.visibility = 'hidden';
            comments.dataset.noDistractionsHidden = 'true';
          }
        }
      } catch (e) {
        // :has() may be unsupported
      }
    });
  }

  function restoreComments() {
    if (isUnloading) return;
    const selectors = [
      '#comments',
      'ytd-comments#comments',
      'ytd-watch-flexy #comments',
      '#primary #comments',
      'ytd-comments',
      'ytd-comments-header-renderer',
      '[id="comments"]',
      'ytd-watch-flexy ytd-item-section-renderer[target-id="watch-discussion"]'
    ];

    selectors.forEach(selector => {
      try {
        const comments = document.querySelectorAll(selector);
        comments.forEach(comment => {
          const isHidden = comment.dataset.noDistractionsHidden === 'true' ||
                          comment.style.display === 'none' ||
                          comment.style.visibility === 'hidden';

          if (isHidden) {
            if (comment.dataset.originalDisplay) {
              comment.style.display = comment.dataset.originalDisplay;
            } else {
              comment.style.display = '';
            }
            if (comment.dataset.originalVisibility !== undefined) {
              comment.style.visibility = comment.dataset.originalVisibility;
            } else {
              comment.style.visibility = '';
            }
            comment.removeAttribute('data-no-distractions-hidden');
            comment.removeAttribute('data-original-display');
            comment.removeAttribute('data-original-visibility');
          }
        });
      } catch (e) {
        // Continue with other selectors
      }
    });

    const hiddenElements = document.querySelectorAll('[data-no-distractions-hidden="true"]');
    hiddenElements.forEach(element => {
      const isComment = element.id === 'comments' ||
                       element.tagName === 'YTD-COMMENTS' ||
                       element.tagName === 'YTD-COMMENTS-HEADER-RENDERER' ||
                       element.querySelector('ytd-comments') ||
                       element.querySelector('#comments') ||
                       element.getAttribute('target-id') === 'watch-discussion' ||
                       element.classList.contains('ytd-comments') ||
                       element.getAttribute('id') === 'comments';

      if (isComment) {
        if (element.dataset.originalDisplay) {
          element.style.display = element.dataset.originalDisplay;
        } else {
          element.style.display = '';
        }
        if (element.dataset.originalVisibility !== undefined) {
          element.style.visibility = element.dataset.originalVisibility;
        } else {
          element.style.visibility = '';
        }
        element.removeAttribute('data-no-distractions-hidden');
        element.removeAttribute('data-original-display');
        element.removeAttribute('data-original-visibility');
      }
    });
  }

  function removeEndScreenRecommendations() {
    if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;

    const selectors = [
      '.ytp-fullscreen-grid-stills-container',
      '.ytp-modern-videowall-still',
      '.ytp-suggestion-set',
      'ytd-endscreen-renderer',
      'ytd-endscreen-content-renderer',
      '.ytp-endscreen-content',
      '.ytp-endscreen',
      '.ytp-autonav-endscreen-countdown-overlay',
      '.ytp-autonav-endscreen-upnext-tooltip',
      '.ytp-autonav-endscreen-button-container',
      '.ytp-autonav-endscreen'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (!element.dataset.originalDisplay) {
            const computedStyle = window.getComputedStyle(element);
            element.dataset.originalDisplay = computedStyle.display;
            element.dataset.originalVisibility = computedStyle.visibility;
          }

          element.style.display = 'none';
          element.style.visibility = 'hidden';
          element.dataset.noDistractionsHidden = 'true';
        });
      } catch (e) {
        // Continue with other selectors
      }
    });
  }

  function restoreEndScreenRecommendations() {
    if (isUnloading) return;
    const selectors = [
      '.ytp-fullscreen-grid-stills-container',
      '.ytp-modern-videowall-still',
      '.ytp-suggestion-set',
      'ytd-endscreen-renderer',
      'ytd-endscreen-content-renderer',
      '.ytp-endscreen-content',
      '.ytp-endscreen',
      '.ytp-autonav-endscreen-countdown-overlay',
      '.ytp-autonav-endscreen-upnext-tooltip',
      '.ytp-autonav-endscreen-button-container',
      '.ytp-autonav-endscreen'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (element.dataset.noDistractionsHidden === 'true') {
            if (element.dataset.originalDisplay) {
              element.style.display = element.dataset.originalDisplay;
            } else {
              element.style.display = '';
            }
            if (element.dataset.originalVisibility !== undefined) {
              element.style.visibility = element.dataset.originalVisibility;
            } else {
              element.style.visibility = '';
            }
            element.removeAttribute('data-no-distractions-hidden');
            element.removeAttribute('data-original-display');
            element.removeAttribute('data-original-visibility');
          }
        });
      } catch (e) {
        // Continue with other selectors
      }
    });
  }

  function hideActionButtons() {
    if (!cachedNoDistractionsEnabled || shouldSkipDomWork()) return;

    const buttonsContainer = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer, #actions, #menu-container') ||
                             document.querySelector('ytd-watch-metadata #top-level-buttons-computed');

    if (!buttonsContainer) return;

    if (buttonsContainer.dataset.noDistractionsProcessed) return;
    buttonsContainer.dataset.noDistractionsProcessed = 'true';

    const likeButton = buttonsContainer.querySelector('ytd-toggle-button-renderer:first-child, button:first-child, #like-button, ytd-like-button-renderer');

    const buttonsToHide = Array.from(buttonsContainer.children).filter(child => {
      if (child === likeButton) return false;

      const ariaLabel = child.getAttribute('aria-label') || '';
      const textContent = child.textContent || '';

      return ariaLabel.includes('Dislike') ||
             ariaLabel.includes('Share') ||
             ariaLabel.includes('Download') ||
             ariaLabel.includes('Save') ||
             textContent.includes('Share') ||
             textContent.includes('Download') ||
             child.tagName === 'YTD-DISLIKE-BUTTON-RENDERER';
    });

    buttonsToHide.forEach(btn => {
      if (!btn.dataset.originalDisplay) {
        btn.dataset.originalDisplay = window.getComputedStyle(btn).display;
      }

      btn.style.display = 'none';
      btn.dataset.noDistractionsHidden = 'true';
    });
  }

  function showActionButtons() {
    if (isUnloading) return;
    const containers = document.querySelectorAll('#top-level-buttons-computed, ytd-menu-renderer, #actions, #menu-container, ytd-watch-metadata #top-level-buttons-computed');

    containers.forEach(container => {
      const allButtons = Array.from(container.children);
      allButtons.forEach(btn => {
        const isHidden = btn.dataset.noDistractionsHidden === 'true' ||
                        btn.style.display === 'none' ||
                        window.getComputedStyle(btn).display === 'none';

        if (isHidden) {
          if (btn.dataset.originalDisplay) {
            btn.style.display = btn.dataset.originalDisplay;
          } else {
            btn.style.display = '';
          }
          btn.removeAttribute('data-no-distractions-hidden');
          btn.removeAttribute('data-original-display');
        }
      });

      if (container.dataset.noDistractionsProcessed) {
        delete container.dataset.noDistractionsProcessed;
      }
    });

    const menuBtn = document.querySelector('.yt-quiet-mode-actions-menu-btn, .yt-quiet-mode-fallback-menu');
    const menuContainer = document.querySelector('.yt-quiet-mode-actions-menu');

    if (menuBtn) menuBtn.remove();
    if (menuContainer) menuContainer.remove();
  }

  function isLoadingElement(element) {
    if (!element) return false;

    const className = element.className || '';
    const id = element.id || '';

    const loadingPatterns = [
      'loading', 'skeleton', 'spinner', 'placeholder', 'shimmer',
      'ytp-big-mode', 'ytp-loading', 'ytp-spinner', 'ytp-cued-thumbnail',
      'skeleton-text', 'skeleton-image', 'skeleton-button'
    ];

    for (const pattern of loadingPatterns) {
      if (className.toLowerCase().includes(pattern) || id.toLowerCase().includes(pattern)) {
        return true;
      }
    }

    if (className.includes('ytp-') && (
      className.includes('loading') ||
      className.includes('buffering') ||
      className.includes('spinner') ||
      id.includes('loading') ||
      id.includes('buffering')
    )) {
      return true;
    }

    if (element.hasAttribute('loading') ||
        element.hasAttribute('aria-busy') ||
        element.getAttribute('data-loading') === 'true') {
      return true;
    }

    const loadingContainer = element.closest('[class*="loading"], [class*="skeleton"], [class*="spinner"], [id*="loading"]');
    if (loadingContainer) {
      return true;
    }

    const player = element.closest('#movie_player, .html5-video-player, ytd-player');
    if (player && (className.includes('ytp-') || id.includes('ytp-'))) {
      if (className.includes('loading') || className.includes('buffering') ||
          className.includes('spinner') || id.includes('loading') || id.includes('buffering')) {
        return true;
      }
    }

    return false;
  }

  function restoreAllHiddenElements() {
    if (cachedNoDistractionsEnabled || isUnloading) return;

    const hiddenElements = document.querySelectorAll('[data-no-distractions-hidden="true"]');
    hiddenElements.forEach(element => {
      if (isLoadingElement(element)) {
        return;
      }

      clearSecondaryHiddenStyles(element);
      if (element.hasAttribute('hidden')) {
        element.removeAttribute('hidden');
      }

      if (element.dataset.originalDisplay) {
        const displayValue = element.dataset.originalDisplay === 'none' ? '' : element.dataset.originalDisplay;
        element.style.display = displayValue;
      } else {
        element.style.display = '';
      }

      if (element.dataset.originalVisibility !== undefined) {
        element.style.visibility = element.dataset.originalVisibility;
      } else {
        element.style.visibility = '';
      }

      element.removeAttribute('data-no-distractions-hidden');
      element.removeAttribute('data-original-display');
      element.removeAttribute('data-original-visibility');
    });

    restorePrimaryColumn();
    window.dispatchEvent(new Event('resize'));
  }

  function scheduleRestoreAfterDisable() {
    if (cachedNoDistractionsEnabled === null || cachedNoDistractionsEnabled || !isVideoPage() || isUnloading) return;

    const restoreAll = () => {
      if (cachedNoDistractionsEnabled || isUnloading) return;

      if (isInitialPageLoad && (document.readyState !== 'complete' || document.querySelector('video')?.readyState < 3)) {
        return;
      }

      restoreSuggestions();
      restoreComments();
      showActionButtons();
      restoreEndScreenRecommendations();
      restoreAllHiddenElements();
      restoreLeftSidebar();

      const visibleSecondary = Array.from(document.querySelectorAll('#secondary, ytd-watch-flexy #secondary, #related, ytd-watch-flexy #related'))
        .find(el => el.offsetParent !== null || el.getBoundingClientRect().width > 10);
      if (!visibleSecondary) {
        const candidate = document.querySelector('#secondary, ytd-watch-flexy #secondary, #related, ytd-watch-flexy #related');
        if (candidate) {
          candidate.removeAttribute('hidden');
          candidate.style.display = 'block';
          candidate.style.visibility = 'visible';
        }
      }
    };

    if (isInitialPageLoad) {
      [2000, 4000, 8000].forEach(delay => later(restoreAll, delay));
    } else {
      [0, 300, 1000, 3000].forEach(delay => later(restoreAll, delay));
    }
  }

  function checkAndApplyNoDistractions() {
    if (shouldSkipDomWork()) return;
    if (isVideoPage() && cachedNoDistractionsEnabled) {
      applyNoDistractionsToVideoPage();
    }
  }

  function replaceVerificationTags() {
    if (shouldSkipDomWork() || !isVideoPage()) return;

    const selectors = [
      'ytd-badge-supported-renderer',
      'ytd-badge-renderer',
      'yt-chip-cloud-chip-renderer',
      'ytd-metadata-row-renderer',
      '[class*="badge"]',
      '[class*="chip"]',
      '[class*="verified"]'
    ];

    function replaceTextInElement(element) {
      if (!element || element.dataset.tagReplaced === 'true') return;

      const text = element.textContent?.trim() || '';
      const ariaLabel = element.getAttribute('aria-label') || '';
      const title = element.getAttribute('title') || '';

      let changed = false;

      if (text.match(/human\s+verified/i) && !text.match(/likely\s+human/i)) {
        element.textContent = text.replace(/human\s+verified/gi, 'Likely human');
        changed = true;
      }

      if (text.match(/\bai\s+generated\b/i) && !text.match(/likely\s+ai/i)) {
        element.textContent = text.replace(/\bai\s+generated\b/gi, 'Likely AI');
        changed = true;
      } else if (text.trim().toLowerCase() === 'ai' && !text.match(/likely\s+ai/i)) {
        element.textContent = 'Likely AI';
        changed = true;
      }

      if (ariaLabel && (ariaLabel.match(/human\s+verified/i) || ariaLabel.match(/\bai\s+generated\b/i) || ariaLabel.trim().toLowerCase() === 'ai')) {
        let newAriaLabel = ariaLabel;
        if (ariaLabel.match(/human\s+verified/i) && !ariaLabel.match(/likely\s+human/i)) {
          newAriaLabel = newAriaLabel.replace(/human\s+verified/gi, 'Likely human');
        }
        if (ariaLabel.match(/\bai\s+generated\b/i) && !ariaLabel.match(/likely\s+ai/i)) {
          newAriaLabel = newAriaLabel.replace(/\bai\s+generated\b/gi, 'Likely AI');
        } else if (ariaLabel.trim().toLowerCase() === 'ai' && !ariaLabel.match(/likely\s+ai/i)) {
          newAriaLabel = 'Likely AI';
        }
        if (newAriaLabel !== ariaLabel) {
          element.setAttribute('aria-label', newAriaLabel);
          changed = true;
        }
      }

      if (title && (title.match(/human\s+verified/i) || title.match(/\bai\s+generated\b/i) || title.trim().toLowerCase() === 'ai')) {
        let newTitle = title;
        if (title.match(/human\s+verified/i) && !title.match(/likely\s+human/i)) {
          newTitle = newTitle.replace(/human\s+verified/gi, 'Likely human');
        }
        if (title.match(/\bai\s+generated\b/i) && !title.match(/likely\s+ai/i)) {
          newTitle = newTitle.replace(/\bai\s+generated\b/gi, 'Likely AI');
        } else if (title.trim().toLowerCase() === 'ai' && !title.match(/likely\s+ai/i)) {
          newTitle = 'Likely AI';
        }
        if (newTitle !== title) {
          element.setAttribute('title', newTitle);
          changed = true;
        }
      }

      if (changed) {
        element.dataset.tagReplaced = 'true';
      }
    }

    const seen = new Set();
    selectors.forEach((selector) => {
      let nodes;
      try {
        nodes = document.querySelectorAll(selector);
      } catch (e) {
        return;
      }
      nodes.forEach((element) => {
        if (seen.has(element)) return;
        const text = element.textContent?.trim() || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        const title = element.getAttribute('title') || '';
        if ((text.match(/human\s+verified/i) && !text.match(/likely\s+human/i)) ||
            (text.match(/\bai\s+generated\b/i) && !text.match(/likely\s+ai/i)) ||
            (text.trim().toLowerCase() === 'ai' && !text.match(/likely\s+ai/i)) ||
            (ariaLabel.match(/human\s+verified/i) && !ariaLabel.match(/likely\s+human/i)) ||
            (ariaLabel.match(/\bai\s+generated\b/i) && !ariaLabel.match(/likely\s+ai/i)) ||
            (ariaLabel.trim().toLowerCase() === 'ai' && !ariaLabel.match(/likely\s+ai/i)) ||
            (title.match(/human\s+verified/i) && !title.match(/likely\s+human/i)) ||
            (title.match(/\bai\s+generated\b/i) && !title.match(/likely\s+ai/i)) ||
            (title.trim().toLowerCase() === 'ai' && !title.match(/likely\s+ai/i))) {
          seen.add(element);
          replaceTextInElement(element);
        }
      });
    });
  }

  interceptLogoClick();
  interceptGuideButtonClicks();
  bindEngagementPanelClicks();

  chrome.storage.sync.get(['noDistractionsEnabled'], ({ noDistractionsEnabled }) => {
    cachedNoDistractionsEnabled = (noDistractionsEnabled === undefined || noDistractionsEnabled === null)
      ? true
      : noDistractionsEnabled;

    attachObservers();
    addToggleButtonToNavbar();
    applyCurrentMode();
    scheduleAttachRetries();
    if (!cachedNoDistractionsEnabled && isVideoPage()) {
      scheduleRestoreAfterDisable();
    }
  });
})();
