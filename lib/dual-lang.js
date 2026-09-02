/* Dual-caption language selection. Max two slots. en ≡ tlang:en. */
(function (root) {
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

  /* Keep the two stored positions stable. Trailing vacancies are omitted, but
     a vacant slot 1 remains explicit while slot 2 is occupied: ["", "pt"]. */
  function serializeSlots(pair) {
    const first = String((pair && pair[0]) || "");
    const second = String((pair && pair[1]) || "");
    if (second) return [first, second];
    if (first) return [first];
    return [];
  }

  function normalizeSlots(list) {
    const source = Array.isArray(list) ? list : [];
    const pair = ["", ""];
    const seen = new Set();
    for (let slot = 0; slot < 2; slot++) {
      const token = String(source[slot] || "");
      const base = langBase(token);
      if (!base || seen.has(base)) continue;
      seen.add(base);
      pair[slot] = token;
    }
    return serializeSlots(pair);
  }

  /* Toggle a base-language identity in two persistent slots. A new language
     fills a vacancy; when both slots are occupied it is deliberately ignored
     until the user clears one. */
  function selectLang(current, token) {
    const cur = normalizeSlots(current);
    const pair = [cur[0] || "", cur[1] || ""];
    const tok = String(token || "");
    const base = langBase(tok);
    if (!base) return cur.slice();
    const i = pair.findIndex((t) => t && langBase(t) === base);
    if (i >= 0) {
      pair[i] = "";
      return serializeSlots(pair);
    }
    const vacancy = pair.findIndex((t) => !t);
    if (vacancy < 0) return cur.slice();
    pair[vacancy] = tok;
    return serializeSlots(pair);
  }

  function slotOf(selected, token) {
    const base = langBase(token);
    if (!base) return -1;
    return normalizeSlots(selected).findIndex(
      (t) => t && langBase(t) === base,
    );
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
    akan: "ak", twi: "ak",
    albanian: "sq", albanês: "sq", albanes: "sq",
    amharic: "am",
    armenian: "hy",
    azerbaijani: "az",
    bangla: "bn", bengali: "bn",
    basque: "eu",
    belarusian: "be",
    bosnian: "bs",
    bulgarian: "bg",
    burmese: "my", myanmar: "my",
    catalan: "ca", catalão: "ca",
    cebuano: "ceb",
    corsican: "co",
    croatian: "hr",
    czech: "cs", tcheco: "cs",
    danish: "da", dinamarquês: "da",
    esperanto: "eo",
    estonian: "et",
    filipino: "fil", tagalog: "tl",
    finnish: "fi", finlandês: "fi",
    galician: "gl",
    georgian: "ka",
    greek: "el", grego: "el",
    gujarati: "gu",
    haitian: "ht",
    hausa: "ha",
    hebrew: "he", hebraico: "he",
    hungarian: "hu", húngaro: "hu", hungaro: "hu",
    icelandic: "is",
    igbo: "ig",
    indonesian: "id",
    irish: "ga",
    javanese: "jv",
    kannada: "kn",
    kazakh: "kk",
    khmer: "km",
    kurdish: "ku",
    kyrgyz: "ky",
    lao: "lo",
    latin: "la",
    latvian: "lv",
    lithuanian: "lt",
    luxembourgish: "lb",
    macedonian: "mk",
    malagasy: "mg",
    malay: "ms",
    malayalam: "ml",
    maltese: "mt",
    maori: "mi",
    marathi: "mr",
    mongolian: "mn",
    nepali: "ne",
    norwegian: "no", norueguês: "no",
    pashto: "ps",
    persian: "fa", farsi: "fa",
    punjabi: "pa",
    romanian: "ro", romeno: "ro",
    samoan: "sm",
    serbian: "sr",
    sindhi: "sd",
    sinhala: "si",
    slovak: "sk",
    slovenian: "sl",
    somali: "so",
    swahili: "sw",
    swedish: "sv", sueco: "sv",
    tajik: "tg",
    tamil: "ta",
    tatar: "tt",
    telugu: "te",
    thai: "th",
    turkmen: "tk",
    ukrainian: "uk", ucraniano: "uk",
    urdu: "ur",
    uyghur: "ug",
    uzbek: "uz",
    vietnamese: "vi",
    welsh: "cy",
    xhosa: "xh",
    yiddish: "yi",
    yoruba: "yo",
    zulu: "zu",
  };

  function codeFromLabel(label, tracks) {
    const n = String(label || "")
      .trim()
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!n) return "";
    const list = tracks || [];
    let hit = list.find((t) => (t.name || "").toLowerCase() === n);
    if (!hit)
      hit = list.find((t) => {
        const c = (t.languageCode || "").toLowerCase();
        return c && (n === c || n.startsWith(c + " ") || n.includes("(" + c));
      });
    if (hit) return (hit.languageCode || "").toLowerCase();
    const names = Object.entries(LANG_NAMES).sort((a, b) => b[0].length - a[0].length);
    for (const [name, code] of names) {
      if (n === name || n.startsWith(name + " ") || n.startsWith(name + "("))
        return code;
    }
    if (/^[a-z]{2,3}$/.test(n)) return n;
    return "";
  }

  const api = {
    langBase,
    uniqueLangs,
    normalizeSlots,
    selectLang,
    slotOf,
    codeFromLabel,
    LANG_NAMES,
  };
  root.YtToolkitDual = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
