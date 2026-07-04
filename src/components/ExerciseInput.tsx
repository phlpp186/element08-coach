import { useMemo, useState } from 'react';
import { loadLibrary, recordUseByDescription } from '../lib/library';
import { rankExercises } from '../lib/librarySearch';
import { useT } from '../i18n';

const PAGE = 100;

/** A text input that suggests matching exercises from the saved library as you
 *  type. Suggestions are ranked (match quality → pinned → usage) and uncapped:
 *  the dropdown scrolls, and past the first page an honest "N more" row shows
 *  instead of silently hiding matches. Picking a suggestion records usage. */
export function ExerciseInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return rankExercises(loadLibrary(), q)
      .map((i) => i.description)
      .filter((d) => d.toLowerCase() !== q);
  }, [value]);
  const page = suggestions.slice(0, PAGE);

  const show = focused && page.length > 0;

  const pick = (s: string) => {
    recordUseByDescription([s]);
    onChange(s);
    setFocused(false);
    setHighlight(-1);
  };

  return (
    <div className="relative flex-1">
      <input
        className="field w-full"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(-1);
        }}
        onFocus={() => setFocused(true)}
        // Delay so a suggestion's mousedown/click registers before we hide.
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, page.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && highlight >= 0) {
            e.preventDefault();
            pick(page[highlight]);
          } else if (e.key === 'Escape') {
            setFocused(false);
          }
        }}
      />
      {show && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-panel shadow-lg max-h-52 overflow-auto">
          {page.map((s, i) => (
            <li key={s}>
              <button
                // mousedown + preventDefault so the input's onBlur doesn't fire first
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-accent/10 ${
                  i === highlight ? 'bg-accent/10 text-text' : 'text-textDim'
                }`}
              >
                {s}
              </button>
            </li>
          ))}
          {suggestions.length > PAGE && (
            <li className="px-3 py-1.5 text-xs text-textDim">
              {suggestions.length - PAGE} {t('more, keep typing to narrow down')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
