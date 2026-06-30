/**
 * i18n entry — a tiny source-string-keyed translator. The English string is the
 * key: `t('Add athlete')` returns the active language's translation, or the
 * English string itself when the language is English or a key is missing. So the
 * components stay readable and English is always a safe fallback.
 *
 * Translation dictionaries live in ./locales/<lang>.json (English source string
 * -> translated string). Add a new string by simply wrapping it in t(); then add
 * that exact English string as a key to every locale file.
 */
import { useMemo } from "react";
import { useLangValue, getLang, type Lang } from "./useLang";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";
import ko from "./locales/ko.json";
import ja from "./locales/ja.json";
import th from "./locales/th.json";

type Dict = Record<string, string>;

const DICTS: Record<Exclude<Lang, "en">, Dict> = {
  de,
  fr,
  es,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ko,
  ja,
  th,
};

/** Returns a translate function bound to the current language. Re-renders the
 *  calling component when the language changes (subscribes to the store).
 *  Memoized on `lang` so the returned function keeps a STABLE identity across
 *  renders — otherwise every render hands back a new `t`, which breaks any
 *  useEffect/useCallback that lists `t` in its deps (it caused a reload +
 *  realtime subscribe/unsubscribe storm in ConnectedAthleteView). */
export function useT(): (s: string) => string {
  const lang = useLangValue();
  return useMemo(() => {
    if (lang === "en") return (s: string) => s;
    const dict = DICTS[lang];
    return (s: string) => dict[s] ?? s;
  }, [lang]);
}

/** Non-reactive translate for use outside React render (event handlers, alerts,
 *  lib helpers). Reads the current language once; does not subscribe. */
export function tr(s: string): string {
  const lang = getLang();
  if (lang === "en") return s;
  return DICTS[lang][s] ?? s;
}

export { setLang, useLangValue, LANGS, type Lang } from "./useLang";
