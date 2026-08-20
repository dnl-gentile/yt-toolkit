/* Hide native Playback speed. Inject Dual / Color highlight / Center word
   ONLY into the Subtitles/CC submenu — never the root settings panel. */
(function () {
  const SPEED_LABELS = [
    "playback speed",
    "velocidade de reprodução",
    "velocidad de reproducción",
    "vitesse de lecture",
    "wiedergabegeschwindigkeit",
    "velocità di riproduzione",
    "再生速度",
    "재생 속도",
    "скорость воспроизведения",
    "播放速度",
    "afspelingssnelheid",
  ];
  const CAPTIONS_LABELS = [
    "subtitles/cc",
    "subtitles",
    "captions",
    "legendas",
    "legendas/cc",
    "subtítulos",
    "sous-titres",
    "untertitel",
    "sottotitoli",
    "字幕",
    "자막",
    "субтитры",
  ];
  const OFF_LABELS = [
    "off",
    "desativadas",
    "desligar",
    "desactivar",
    "désactivé",
    "aus",
    "disattivate",
    "オフ",
    "끄기",
  ];
  const AUTO_XL = [
    "auto-translate",
    "traduzir automaticamente",
    "auto-traducir",
    "traduction automatique",
    "automatisch übersetzen",
    "traduci automaticamente",
  ];
  const MAIN_MARKERS = [
    "stable volume",
    "volume estável",
    "quality",
    "qualidade",
    "ambient mode",
    "modo ambiente",
    "sleep timer",
    "temporizador",
  ];

  const SLOT_COL = ["#3ea6ff", "#ffcc00"];
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  function langBase(token) {
    return String(token || "")
      .toLowerCase()
      .replace(/^tlang:/, "")
      .split("-")[0];
  }
  function uniqueLangs(list) {
    const out = [];
    const seen = new Set();
    (list || []).forEach((t) => {
      if (!t) return;
      const b = langBase(t);
      if (!b || seen.has(b)) return;
      seen.add(b);
      out.push(t);
    });
    return out.slice(0, 2);
  }

  function items(root) {
    return [...(root || document).querySelectorAll(".ytp-menuitem")];
  }

  function hideSpeed(root) {
    for (const it of items(root)) {
      if (it.hasAttribute("data-qt-hidden-speed")) continue;
      const label = norm(
        it.querySelector(".ytp-menuitem-label")?.textContent || "",
      );
      if (SPEED_LABELS.some((l) => label === l || label.startsWith(l))) {
        it.style.display = "none";
        it.setAttribute("data-qt-hidden-speed", "1");
      }
    }
  }

  function isMainSettings(root) {
    const t = norm(root.textContent);
    return MAIN_MARKERS.filter((m) => t.includes(m)).length >= 2;
  }

  function isAutoXlPanel(root) {
    if (!root) return false;
    const headerEl = root.querySelector(
      ".ytp-panel-header, .ytp-panel-title, .ytp-menuitem-header",
    );
    const header = norm(headerEl?.textContent);
    return AUTO_XL.some((l) => header.includes(l));
  }

  function isCaptionsPanel(root) {
    if (!root || isMainSettings(root) || isAutoXlPanel(root)) return false;
    const headerEl = root.querySelector(
      ".ytp-panel-header, .ytp-panel-title, .ytp-menuitem-header",
    );
    const header = norm(headerEl?.textContent);
    if (AUTO_XL.some((l) => header.includes(l))) return false;
    if (CAPTIONS_LABELS.some((l) => header === l || header.includes(l))) return true;
    const labels = items(root).map((it) =>
      norm(it.querySelector(".ytp-menuitem-label")?.textContent),
    );
    const hasOff = labels.some((l) => OFF_LABELS.includes(l));
    const hasAuto = labels.some((l) => AUTO_XL.some((a) => l.includes(a)));
    return hasOff && hasAuto;
  }

  function switchHtml(on) {
    return (
      '<div class="ytp-menuitem-toggle-checkbox qt-switch' +
      (on ? " on" : "") +
      '" aria-hidden="true"></div>'
    );
  }

  function makeToggle(key, label, on, offItem) {
    const row = document.createElement("div");
    row.className = "ytp-menuitem qt-cap-toggle";
    row.setAttribute("data-qt-cap", key);
    row.setAttribute("role", "menuitemcheckbox");
    row.setAttribute("aria-checked", on ? "true" : "false");
    row.setAttribute("tabindex", "0");
    const hasIcon = !!(offItem && offItem.querySelector(".ytp-menuitem-icon"));
    row.innerHTML =
      (hasIcon ? '<div class="ytp-menuitem-icon"></div>' : "") +
      '<div class="ytp-menuitem-label">' +
      label +
      "</div>" +
      '<div class="ytp-menuitem-content">' +
      switchHtml(on) +
      "</div>";
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sw = row.querySelector(".qt-switch");
      const next = !sw.classList.contains("on");
      sw.classList.toggle("on", next);
      row.setAttribute("aria-checked", next ? "true" : "false");
      chrome.storage.sync.set({ [key]: next });
      if (key === "qt_dualCaptions") {
        dualOn = next;
        if (next && selectedLangs.length === 0) {
          const panel = row.closest(".ytp-panel") || row.parentElement;
          const checked = items(panel).find(
            (it) =>
              it.getAttribute("aria-checked") === "true" &&
              !isOffItem(it) &&
              !isAutoXlItem(it) &&
              !it.hasAttribute("data-qt-cap"),
          );
          const c = checked && codeFromItem(checked);
          if (c) {
            selectedLangs = uniqueLangs([c]);
            chrome.storage.sync.set({
              qt_captionLangs: selectedLangs.slice(),
              qt_primaryTrack: selectedLangs[0] || "",
            });
          }
        }
        const panel = row.closest(".ytp-panel") || row.parentElement;
        paintLangChecks(panel);
      }
    });
    return row;
  }

  let dualOn = false;
  let selectedLangs = [];

  chrome.storage.sync.get(["qt_dualCaptions", "qt_captionLangs"], (s) => {
    dualOn = s.qt_dualCaptions === true;
    selectedLangs = uniqueLangs(
      Array.isArray(s.qt_captionLangs) ? s.qt_captionLangs : [],
    );
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    if (ch.qt_dualCaptions) dualOn = ch.qt_dualCaptions.newValue === true;
    if (ch.qt_captionLangs && Array.isArray(ch.qt_captionLangs.newValue))
      selectedLangs = uniqueLangs(ch.qt_captionLangs.newValue);
    if (menuIsOpen()) schedulePatch();
  });

  function isOffItem(it) {
    return OFF_LABELS.includes(
      norm(it.querySelector(".ytp-menuitem-label")?.textContent),
    );
  }
  function isAutoXlItem(it) {
    const t = norm(it.querySelector(".ytp-menuitem-label")?.textContent);
    return AUTO_XL.some((l) => t.includes(l));
  }

  const LANG_NAMES = {
    english: "en", inglês: "en", ingles: "en",
    portuguese: "pt", português: "pt", portugues: "pt",
    spanish: "es", español: "es", espanhol: "es", castellano: "es",
    french: "fr", français: "fr", frances: "fr",
    german: "de", deutsch: "de", alemão: "de", alemao: "de",
    italian: "it", italiano: "it",
    japanese: "ja", japonês: "ja", japones: "ja",
    korean: "ko", coreano: "ko",
    chinese: "zh", chinês: "zh", chines: "zh",
    russian: "ru", russo: "ru",
    arabic: "ar", árabe: "ar", arabe: "ar",
    hindi: "hi",
    dutch: "nl", holandês: "nl", holandes: "nl",
    polish: "pl", polonês: "pl", polones: "pl",
    turkish: "tr", turco: "tr",
    vietnamese: "vi",
    thai: "th",
    indonesian: "id",
    swedish: "sv", sueco: "sv",
    greek: "el", grego: "el",
    hebrew: "he", hebraico: "he",
    czech: "cs", tcheco: "cs",
    romanian: "ro", romeno: "ro",
    hungarian: "hu", húngaro: "hu", hungaro: "hu",
    ukrainian: "uk", ucraniano: "uk",
    catalan: "ca", catalão: "ca",
    finnish: "fi", finlandês: "fi",
    danish: "da", dinamarquês: "da",
    norwegian: "no", norueguês: "no",
    slovak: "sk",
    croatian: "hr",
    serbian: "sr",
    bulgarian: "bg",
    lithuanian: "lt",
    latvian: "lv",
    estonian: "et",
    slovenian: "sl",
    filipino: "fil", tagalog: "tl",
    malay: "ms",
    bengali: "bn",
    tamil: "ta",
    telugu: "te",
    urdu: "ur",
    persian: "fa", farsi: "fa",
    afar: "aa",
    albanian: "sq", albanês: "sq", albanes: "sq",
    amharic: "am",
    armenian: "hy",
    azerbaijani: "az",
    basque: "eu",
    belarusian: "be",
    bosnian: "bs",
    burmese: "my",
    cebuano: "ceb",
    corsican: "co",
    esperanto: "eo",
    galician: "gl",
    georgian: "ka",
    gujarati: "gu",
    haitian: "ht",
    hausa: "ha",
    icelandic: "is",
    igbo: "ig",
    irish: "ga",
    javanese: "jv",
    kannada: "kn",
    kazakh: "kk",
    khmer: "km",
    kurdish: "ku",
    kyrgyz: "ky",
    lao: "lo",
    latin: "la",
    luxembourgish: "lb",
    macedonian: "mk",
    malagasy: "mg",
    malayalam: "ml",
    maltese: "mt",
    maori: "mi",
    marathi: "mr",
    mongolian: "mn",
    nepali: "ne",
    pashto: "ps",
    punjabi: "pa",
    samoan: "sm",
    sindhi: "sd",
    sinhala: "si",
    somali: "so",
    swahili: "sw",
    tajik: "tg",
    tatar: "tt",
    turkmen: "tk",
    uyghur: "ug",
    uzbek: "uz",
    welsh: "cy",
    xhosa: "xh",
    yiddish: "yi",
    yoruba: "yo",
    zulu: "zu",
  };

  function codeFromItem(it) {
    const attr =
      it.getAttribute("data-language-code") ||
      it.getAttribute("data-lang") ||
      it.dataset.languageCode ||
      "";
    if (attr) return attr.toLowerCase().split("-")[0];
    const label = (
      it.querySelector(".ytp-menuitem-label")?.textContent || ""
    ).trim();
    const n = label.toLowerCase();
    const tracks = (window.QuietTube && window.QuietTube.tracks) || [];
    let hit = tracks.find((t) => (t.name || "").toLowerCase() === n);
    if (!hit)
      hit = tracks.find((t) => {
        const c = (t.languageCode || "").toLowerCase();
        return c && (n === c || n.startsWith(c + " ") || n.includes("(" + c));
      });
    if (hit) return (hit.languageCode || "").toLowerCase().split("-")[0];
    const names = Object.entries(LANG_NAMES).sort((a, b) => b[0].length - a[0].length);
    for (const [name, code] of names) {
      if (n === name || n.startsWith(name + " ") || n.startsWith(name + "("))
        return code;
    }
    return "";
  }

  function paintLangChecks(menu) {
    items(menu).forEach((it) => {
      if (it.hasAttribute("data-qt-cap")) return;
      const content = it.querySelector(".ytp-menuitem-content");
      if (!content) return;
      const old = content.querySelector(".qt-lang-check");
      const panel = it.closest(".ytp-panel") || menu;
      const inXl = isAutoXlPanel(panel);
      if (isAutoXlItem(it) && !inXl) {
        if (old) old.remove();
        return;
      }
      if (!dualOn) {
        if (old) old.remove();
        content.querySelectorAll("svg").forEach((svg) => {
          svg.style.display = "";
        });
        return;
      }
      if (isOffItem(it)) {
        if (old) old.remove();
        return;
      }
      const code = codeFromItem(it);
      if (!code) {
        if (old) old.remove();
        return;
      }
      const token = inXl ? "tlang:" + code : code;
      const slot = selectedLangs.indexOf(token);
      if (slot >= 0) {
        content.querySelectorAll("svg").forEach((svg) => {
          svg.style.display = "none";
        });
        if (old) old.style.color = SLOT_COL[slot];
        else {
          const mark = document.createElement("span");
          mark.className = "qt-lang-check";
          mark.textContent = "✓";
          mark.style.color = SLOT_COL[slot];
          content.appendChild(mark);
        }
        it.setAttribute("aria-checked", "true");
      } else if (old) {
        old.remove();
        content.querySelectorAll("svg").forEach((svg) => {
          svg.style.display = "";
        });
        it.setAttribute("aria-checked", "false");
      }
    });
  }

  function bindLangClicks(menu) {
    const root =
      menu.closest(".ytp-settings-menu") ||
      menu.closest(".ytp-popup") ||
      menu;
    if (root.dataset.qtLangBound) return;
    root.dataset.qtLangBound = "1";
    root.addEventListener(
      "click",
      (e) => {
        if (!dualOn) return;
        const it = e.target.closest(".ytp-menuitem");
        if (!it || !root.contains(it)) return;
        if (it.hasAttribute("data-qt-cap")) return;
        const panel = it.closest(".ytp-panel") || menu;
        if (!isCaptionsPanel(panel) && !isAutoXlPanel(panel)) return;
        const xl = isAutoXlPanel(panel);
        if (isAutoXlItem(it) && !xl) return;
        if (isOffItem(it)) return;
        const code = codeFromItem(it);
        if (!code) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const token = xl ? "tlang:" + code : code;
        const i = selectedLangs.indexOf(token);
        if (i >= 0) selectedLangs.splice(i, 1);
        else if (selectedLangs.some((s) => langBase(s) === langBase(token))) {
          /* en ≡ tlang:en — cannot occupy both slots */
        } else if (selectedLangs.length < 2) selectedLangs.push(token);
        else selectedLangs[1] = token;
        selectedLangs = uniqueLangs(selectedLangs);
        chrome.storage.sync.set({
          qt_captionLangs: selectedLangs.slice(),
          qt_primaryTrack: selectedLangs[0] || "",
          qt_secondaryTrack: selectedLangs[1] || "",
        });
        paintLangChecks(panel);
      },
      true,
    );
  }

  function alignToggleLabels(menu) {
    const off = items(menu).find(isOffItem);
    const toggles = menu.querySelectorAll("[data-qt-cap]");
    if (!off || !toggles.length) return;
    const offCs = getComputedStyle(off);
    const offLabel = off.querySelector(".ytp-menuitem-label");
    const labCs = offLabel ? getComputedStyle(offLabel) : null;
    toggles.forEach((row) => {
      row.style.paddingLeft = offCs.paddingLeft;
      row.style.paddingRight = offCs.paddingRight;
      const lab = row.querySelector(".ytp-menuitem-label");
      if (lab && labCs) {
        lab.style.paddingLeft = labCs.paddingLeft;
        lab.style.marginLeft = labCs.marginLeft;
        lab.style.textAlign = "left";
      }
    });
  }

  function injectCaptionsToggles(root) {
    if (!isCaptionsPanel(root)) return;
    const menu =
      root.querySelector(".ytp-panel-menu") ||
      root.querySelector(".ytp-panel") ||
      root;
    if (menu.querySelector("[data-qt-cap]")) {
      alignToggleLabels(menu);
      return;
    }

    const offItem = items(menu).find(isOffItem);

    chrome.storage.sync.get(
      ["qt_dualCaptions", "qt_wordHighlight", "qt_centerWord"],
      (s) => {
        if (!isCaptionsPanel(root)) return;
        if (menu.querySelector("[data-qt-cap]")) return;
        const dual = makeToggle(
          "qt_dualCaptions",
          "Dual subtitles",
          s.qt_dualCaptions === true,
          offItem,
        );
        const hi = makeToggle(
          "qt_wordHighlight",
          "Color highlight",
          s.qt_wordHighlight !== false,
          offItem,
        );
        const ctr = makeToggle(
          "qt_centerWord",
          "Center word",
          s.qt_centerWord === true,
          offItem,
        );
        const frag = document.createDocumentFragment();
        frag.appendChild(dual);
        frag.appendChild(hi);
        frag.appendChild(ctr);
        if (offItem && offItem.parentNode) {
          offItem.parentNode.insertBefore(frag, offItem.nextSibling);
        } else {
          menu.appendChild(frag);
        }
        requestAnimationFrame(() => alignToggleLabels(menu));
      },
    );
  }

  function scrub() {
    document.querySelectorAll("[data-qt-cap]").forEach((el) => {
      const panel = el.closest(".ytp-panel") || el.parentElement;
      if (!isCaptionsPanel(panel)) el.remove();
    });
  }

  function settingsMenu() {
    return document.querySelector(".ytp-popup.ytp-settings-menu, .ytp-settings-menu");
  }

  function menuIsOpen() {
    const m = settingsMenu();
    if (!m) return false;
    if (m.hasAttribute("hidden")) return false;
    if (m.getAttribute("aria-hidden") === "true") return false;
    const st = getComputedStyle(m);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return true;
  }

  function patch() {
    if (!menuIsOpen()) return;
    scrub();
    document
      .querySelectorAll(
        ".ytp-popup.ytp-settings-menu .ytp-panel, .ytp-settings-menu .ytp-panel",
      )
      .forEach((panel) => {
        hideSpeed(panel);
        injectCaptionsToggles(panel);
        const menu = panel.querySelector(".ytp-panel-menu") || panel;
        menu.querySelectorAll("[data-qt-2nd]").forEach((el) => el.remove());
        if (isCaptionsPanel(panel) || isAutoXlPanel(panel)) {
          bindLangClicks(menu);
          paintLangChecks(menu);
          if (menu.querySelector("[data-qt-cap]")) alignToggleLabels(menu);
        }
      });
  }

  let patchQueued = false;
  function schedulePatch() {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      setTimeout(() => {
        patchQueued = false;
        if (menuIsOpen()) patch();
      }, 40);
    });
  }

  let menuObs = null;
  let playerObs = null;

  function detachMenuObserver() {
    if (!menuObs) return;
    menuObs.disconnect();
    menuObs = null;
  }

  function attachMenuObserver() {
    const m = settingsMenu();
    if (!m || !menuIsOpen()) {
      detachMenuObserver();
      return;
    }
    if (menuObs && menuObs._root === m) {
      schedulePatch();
      return;
    }
    detachMenuObserver();
    menuObs = new MutationObserver(() => {
      if (!menuIsOpen()) {
        detachMenuObserver();
        return;
      }
      schedulePatch();
    });
    menuObs._root = m;
    menuObs.observe(m, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "hidden", "aria-hidden", "class"],
    });
    patch();
  }

  function isSettingsMenuNode(n) {
    return (
      n &&
      n.nodeType === 1 &&
      (n.classList.contains("ytp-settings-menu") ||
        (n.querySelector && n.querySelector(".ytp-settings-menu")))
    );
  }

  function attachPlayerObserver() {
    const p = document.querySelector("#movie_player, .html5-video-player");
    if (!p) return;
    if (playerObs && playerObs._root === p) return;
    if (playerObs) playerObs.disconnect();
    playerObs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (isSettingsMenuNode(n)) {
            attachMenuObserver();
            return;
          }
        }
        for (const n of m.removedNodes) {
          if (isSettingsMenuNode(n)) {
            detachMenuObserver();
            return;
          }
        }
      }
    });
    playerObs._root = p;
    playerObs.observe(p, { childList: true });
    attachMenuObserver();
  }

  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      requestAnimationFrame(() => {
        if (t && t.closest && (t.closest(".ytp-settings-button") || t.closest(".ytp-settings-menu"))) {
          attachMenuObserver();
        } else if (!menuIsOpen()) {
          detachMenuObserver();
        }
      });
    },
    true,
  );

  document.addEventListener("yt-navigate-finish", () => {
    detachMenuObserver();
    if (playerObs) {
      playerObs.disconnect();
      playerObs = null;
    }
    attachPlayerObserver();
  });

  let bootTries = 0;
  function boot() {
    attachPlayerObserver();
    if (document.querySelector("#movie_player, .html5-video-player")) return;
    if (bootTries++ < 40) setTimeout(boot, 250);
  }
  boot();
})();
