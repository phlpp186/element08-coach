/**
 * CategoryPicker — pick up to `max` categories for an exercise by toggling
 * colour chips. Once `max` are selected the rest disable. Shared by the add bar
 * and the exercise card editor in the Exercises tab.
 */
import { categoryColor } from '../lib/categoryColor';
import { MAX_CATEGORIES } from '../lib/library';
import { useT } from '../i18n';

export function CategoryPicker({
  selected,
  categories,
  onChange,
  max = MAX_CATEGORIES,
}: {
  selected: string[];
  categories: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const t = useT();
  if (categories.length === 0) {
    return <p className="text-xs text-textDim">{t('No categories yet.')}</p>;
  }
  const full = selected.length >= max;
  const toggle = (c: string) => {
    if (selected.includes(c)) onChange(selected.filter((x) => x !== c));
    else if (!full) onChange([...selected, c]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((c) => {
        const on = selected.includes(c);
        const disabled = !on && full;
        return (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => toggle(c)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              on
                ? 'border-accent bg-accent/10 text-accent'
                : disabled
                  ? 'cursor-not-allowed border-border text-textDim opacity-40'
                  : 'border-border text-textDim hover:border-accent hover:text-text'
            }`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor(c) }} />
            {c}
          </button>
        );
      })}
    </div>
  );
}
