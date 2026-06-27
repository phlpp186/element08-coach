/**
 * LanguageSwitcher — a small <select> that changes the UI language. Styled to
 * sit in the header next to the auth controls.
 */
import { LANGS, useLangValue, setLang, type Lang } from './useLang';

export function LanguageSwitcher() {
  const lang = useLangValue();
  return (
    <select
      aria-label="Language"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className="rounded-lg border border-border bg-panel/80 px-2 py-1.5 text-xs text-textDim backdrop-blur transition-colors hover:border-accent hover:text-text focus:border-accent focus:outline-none"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} className="bg-panel text-text">
          {l.name}
        </option>
      ))}
    </select>
  );
}
