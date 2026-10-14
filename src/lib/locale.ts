// Language and region for dates and times (and the coach's replies). "auto" follows the device.
// Changing it reloads the app, so formatters made once at load stay correct.

export const LOCALES: { code: string; label: string }[] = [
  { code: "auto", label: "Same as this device" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "es-ES", label: "Español" },
  { code: "es-419", label: "Español (Latinoamérica)" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "it-IT", label: "Italiano" },
  { code: "zh-CN", label: "中文（简体）" },
  { code: "zh-TW", label: "中文（繁體）" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "ru-RU", label: "Русский" },
  { code: "vi-VN", label: "Tiếng Việt" },
];
const KEY = "stoga-locale";

function stored(): string {
  try {
    return localStorage.getItem(KEY) ?? "auto";
  } catch {
    return "auto";
  }
}

/** The chosen setting ("auto" or a code). */
export const localeSetting = () => stored();

/** The locale to format with: the chosen one, else the device's, else US English. Always a valid tag. */
export function appLocale(): string {
  const pick = stored();
  const want = pick !== "auto" ? pick : typeof navigator !== "undefined" ? navigator.language : "en-US";
  try {
    return Intl.getCanonicalLocales(want)[0] ?? "en-US";
  } catch {
    return "en-US";
  }
}

export function setLocale(code: string) {
  try {
    if (code === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, code);
  } catch {
    /* blocked storage: stays on the device's language */
  }
  window.location.reload();
}

/** 0 = Sunday … 6 = Saturday: the first day of the week where the student is. */
export function weekStart(locale = appLocale()): number {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch {
    /* older browsers: fall through */
  }
  // Without week data: Sunday in the US, Canada, Japan, Brazil and a few more; Monday elsewhere.
  return /-(US|CA|JP|BR|IL|KR|TW|PH|MX|IN|SA)$/i.test(locale) || locale === "en" ? 0 : 1;
}

/** The language's own name, in English, for telling the coach which language to reply in. */
export function languageName(locale = appLocale()): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale.split("-")[0]) ?? "English";
  } catch {
    return "English";
  }
}

const cache = new Map<string, Intl.DateTimeFormat>();
/** A date formatter in the student's locale (made once per set of options). */
export function dateFormat(opts: Intl.DateTimeFormatOptions, locale = appLocale()) {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale, opts)));
  return f;
}
