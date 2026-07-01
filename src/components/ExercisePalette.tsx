import { useMemo, useState } from 'react';
import { blockExercises, useBlocks, useCategories, useExercises } from '../lib/library';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';
import { categoryColor } from '../lib/categoryColor';
import { CatDot } from './CatDot';

interface AssignTarget {
  id: string;
  label: string;
}

/** A compact, searchable picker over the coach's exercise library + saved blocks.
 *  Click a chip/block to add to the open session; the "⋯" opens "assign to many"
 *  to add it to several sessions at once. Authoring lives in the Exercises tab.
 *  `onUse` appends to the open session; `onAssign` appends to many sessions. */
export function ExercisePalette({
  onUse,
  targets,
  onAssign,
}: {
  onUse: (descriptions: string[]) => void;
  targets: AssignTarget[];
  onAssign: (sessionIds: string[], descriptions: string[]) => void;
}) {
  const t = useT();
  const exercises = useExercises();
  const categories = useCategories();
  const blocks = useBlocks();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [assigning, setAssigning] = useState<{ name: string; descriptions: string[] } | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (filter !== 'all' && ex.category !== filter) return false;
      if (q && !ex.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, filter, search]);

  const usedCats = useMemo(
    () => categories.filter((c) => exercises.some((e) => e.category === c)),
    [categories, exercises],
  );
  const nonEmptyBlocks = useMemo(() => blocks.filter((b) => b.exerciseIds.length > 0), [blocks]);

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
            {nonEmptyBlocks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-textDim text-xs">{t('Blocks: click to add to the open session, or ⋯ to assign to many.')}</p>
                <div className="flex flex-wrap gap-2">
                  {nonEmptyBlocks.map((b) => (
                    <span
                      key={b.id}
                      className="group flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-sm"
                    >
                      <button
                        onClick={() => onUse(blockExercises(b).map((e) => e.description))}
                        className="flex items-center gap-1.5 text-text"
                        title={t('Add all exercises in this block to the open session')}
                      >
                        <span className="text-accent">▦</span>
                        {b.name}
                        <span className="text-textDim text-xs">{b.exerciseIds.length}</span>
                      </button>
                      <button
                        onClick={() => setAssigning({ name: b.name, descriptions: blockExercises(b).map((e) => e.description) })}
                        className="text-textDim opacity-0 group-hover:opacity-100 hover:text-accent"
                        title={t('Assign to sessions…')}
                      >
                        ⋯
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                    <Pill key={c} color={categoryColor(c)} active={filter === c} onClick={() => setFilter(c)}>
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
                  {t('Drag a chip into a session, click to add to the open one, or ⋯ to assign to many.')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {shown.map((ex) => (
                    <span
                      key={ex.id}
                      className="group flex items-center gap-1.5 rounded-lg border border-border bg-abyss px-2.5 py-1.5 text-sm hover:border-accent"
                    >
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', ex.description);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onUse([ex.description])}
                        className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
                        title={t('Drag into a session, or click to add to the open session')}
                      >
                        {ex.category && <CatDot name={ex.category} size={7} />}
                        {ex.description}
                      </span>
                      <button
                        onClick={() => setAssigning({ name: ex.description, descriptions: [ex.description] })}
                        className="text-textDim opacity-0 group-hover:opacity-100 hover:text-accent"
                        title={t('Assign to sessions…')}
                      >
                        ⋯
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        ))}

      {assigning && (
        <AssignModal
          name={assigning.name}
          descriptions={assigning.descriptions}
          targets={targets}
          onAssign={onAssign}
          onClose={() => setAssigning(null)}
        />
      )}
    </section>
  );
}

function AssignModal({
  name,
  descriptions,
  targets,
  onAssign,
  onClose,
}: {
  name: string;
  descriptions: string[];
  targets: AssignTarget[];
  onAssign: (sessionIds: string[], descriptions: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="glass-card w-full max-w-md rounded-xl p-4 space-y-3 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base">{t('Add to sessions')}</h3>
          <p className="text-textDim text-sm truncate">{name}</p>
        </div>

        {targets.length === 0 ? (
          <p className="text-textDim text-sm">{t('Add sessions to your plan first.')}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setSel(new Set(targets.map((x) => x.id)))} className="text-accent hover:underline">
                {t('Select all')}
              </button>
              <button onClick={() => setSel(new Set())} className="text-textDim hover:text-text">
                {t('Clear')}
              </button>
            </div>
            <div className="flex-1 overflow-auto space-y-1">
              {targets.map((tg) => (
                <label
                  key={tg.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-abyss px-3 py-2 text-sm cursor-pointer hover:border-accent"
                >
                  <input type="checkbox" className="accent-accent" checked={sel.has(tg.id)} onChange={() => toggle(tg.id)} />
                  <span className="truncate">{tg.label}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            {t('Cancel')}
          </button>
          <button
            disabled={sel.size === 0}
            onClick={() => {
              onAssign([...sel], descriptions);
              onClose();
            }}
            className="glow-accent text-sm bg-accent text-ink rounded-lg px-4 py-1.5 font-heading tracking-wide disabled:opacity-50"
          >
            {t('Add to selected')} ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textDim hover:border-accent hover:text-text'
      }`}
    >
      {color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}
