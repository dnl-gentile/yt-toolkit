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

  /* Toggle token into the 2-slot list. Same base language cannot occupy both. */
  function selectLang(current, token) {
    const cur = uniqueLangs(current);
    const tok = String(token || "");
    const base = langBase(tok);
    if (!base) return cur.slice();
    const i = cur.findIndex((t) => t === tok);
    if (i >= 0) {
      const next = cur.slice();
      next.splice(i, 1);
      return next;
    }
    if (cur.some((t) => langBase(t) === base)) {
      /* en ≡ tlang:en — ignore, do not steal the slot or toggle off */
      return cur.slice();
    }
    if (cur.length < 2) return cur.concat(tok);
    return [cur[0], tok];
  }

  function slotOf(selected, token) {
    const tok = String(token || "");
    const base = langBase(tok);
    return (selected || []).findIndex(
      (t) => t === tok || langBase(t) === base,
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
    if (hit) return (hit.languageCode || "").toLowerCase().split("-")[0];
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
    selectLang,
    slotOf,
    codeFromLabel,
    LANG_NAMES,
  };
  root.YtToolkitDual = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
