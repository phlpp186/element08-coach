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
      className="pill h-9 px-3 font-mono text-[11px] uppercase tracking-widest focus:border-accent focus:outline-none"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} className="bg-panel text-text normal-case tracking-normal">
          {l.name}
        </option>
      ))}
    </select>
  );
}
