import { useMemo, useState } from 'react';
import { useCategories, useExercises } from '../lib/library';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';

/** A compact, searchable picker over the coach's exercise library. Search +
 *  category filter, then drag a chip into a session's exercise list or (with a
 *  session open) click it to add. Authoring the library itself lives in the
 *  Exercises tab. */
export function ExercisePalette({ onUse }: { onUse: (description: string) => void }) {
  const t = useT();
  const exercises = useExercises();
  const categories = useCategories();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (filter !== 'all' && ex.category !== filter) return false;
      if (q && !ex.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, filter, search]);

  // Only the categories that actually have exercises, to keep the filter tidy.
  const usedCats = useMemo(
    () => categories.filter((c) => exercises.some((e) => e.category === c)),
    [categories, exercises],
  );

  return (
    <section className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-lg flex items-center gap-2">
          <span className="text-textDim text-sm">{open ? '▾' : '▸'}</span> {t('Exercise library')}
        </button>
        <span className="text-textDim text-xs">{exercises.length}</span>
        <button
          onClick={() => navigate('/exercises')}
          className="ml-auto text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
        >
          {t('Manage exercises')}
        </button>
      </div>

      {open &&
        (exercises.length === 0 ? (
          <p className="text-textDim text-sm">
            {t('No exercises yet.')}{' '}
            <button onClick={() => navigate('/exercises')} className="text-accent hover:underline">
              {t('Add some in the Exercises tab')}
            </button>
            {t(', then drag or click them into a session here.')}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field flex-1 min-w-40"
                placeholder={t('Search exercises')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {usedCats.length > 0 && (
                <>
                  <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
                    {t('All')}
                  </Pill>
                  {usedCats.map((c) => (
                    <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
                      {c}
                    </Pill>
                  ))}
                </>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="text-textDim text-sm">{t('No exercises match.')}</p>
            ) : (
              <>
                <p className="text-textDim text-xs">
                  {t('Drag a chip into a session, or open a session and click it.')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {shown.map((ex) => (
                    <span
                      key={ex.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', ex.description);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => onUse(ex.description)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-abyss px-2.5 py-1.5 text-sm cursor-grab active:cursor-grabbing hover:border-accent"
                      title={t('Drag into a session, or click to add to the open session')}
                    >
                      {ex.category && <span className="h-1.5 w-1.5 rounded-full bg-accent/70 shrink-0" />}
                      {ex.description}
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        ))}
    </section>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textDim hover:border-accent hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
