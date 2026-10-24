/**
 * BlockComposer — the Exercises page's Blocks view: pick a block (or start
 * one), then click exercises from the library on one side to build it on the
 * other, in order, with a rough duration from the doses. A finished block
 * can be saved as a session template for the builder's "+ from template".
 */
import { useMemo, useState } from 'react';
import {
  addBlock,
  addExerciseToBlock,
  blockToSessionTemplate,
  moveExerciseInBlock,
  removeBlock,
  removeExerciseFromBlock,
  renameBlock,
  type ExerciseBlock,
  type LibraryExercise,
} from '../../lib/library';
import { rankExercises } from '../../lib/librarySearch';
import { blockDuration } from '../../lib/exerciseInsights';
import { doseText } from '../../lib/e08plan';
import { CatDot, CatDots } from '../CatDot';
import { fill, useT } from '../../i18n';

const PICK_LIMIT = 60;

function fmtDuration(sec: number): string {
  if (sec < 90) return `${sec} s`;
  return `${Math.round(sec / 60)} min`;
}

export function BlockComposer({
  blocks,
  exercises,
  categories,
  activeId,
  onActive,
  onTemplates,
}: {
  blocks: ExerciseBlock[];
  exercises: LibraryExercise[];
  categories: string[];
  /** The block being edited (falls back to the first). */
  activeId: string | null;
  onActive: (id: string | null) => void;
  /** Jump to the Templates view (after saving one). */
  onTemplates: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const block = blocks.find((b) => b.id === activeId) ?? blocks[0] ?? null;
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const items = (block?.exerciseIds ?? []).map((id) => byId.get(id)).filter((e): e is LibraryExercise => !!e);
  const inBlock = new Set(block?.exerciseIds ?? []);
  const live = useMemo(() => exercises.filter((e) => !e.archived), [exercises]);

  const picks = useMemo(() => {
    const base = cat ? live.filter((e) => e.categories?.includes(cat)) : live;
    return q.trim()
      ? rankExercises(base, q)
      : [...base].sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0) || a.description.localeCompare(b.description));
  }, [live, q, cat]);

  const dur = blockDuration(items.map((e) => e.defaultDose));

  const create = () => {
    const name = draft.trim();
    if (!name) return;
    onActive(addBlock(name));
    setDraft('');
  };

  return (
    <div className="min-w-0 space-y-4">
      {/* Blocks + a new one */}
      <div className="flex flex-wrap items-center gap-1.5">
        {blocks.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              onActive(b.id);
              setSaved(null);
            }}
            aria-pressed={block?.id === b.id}
            className={`pill px-3 py-1 text-sm ${block?.id === b.id ? 'pill-on' : ''}`}
          >
            {b.name} <span className="font-num text-xs opacity-70">{b.exerciseIds.length}</span>
          </button>
        ))}
        <span className="flex items-center gap-1.5">
          <input
            className="field h-8 w-44 py-1 text-sm"
            placeholder={t('New block name, e.g. CO₂ set')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button onClick={create} className="pill px-3 py-1 text-sm text-accent">
            + {t('Add block')}
          </button>
        </span>
      </div>

      {!block ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
          {t(
            'No blocks yet. Group exercises you use together (a warm-up, a CO₂ set), then add the whole block to a session at once from the builder.',
          )}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          {/* The block being built */}
          <section className="board space-y-3 p-4 lg:order-2">
            <input
              key={block.id}
              className="field font-heading"
              defaultValue={block.name}
              onBlur={(e) => {
                const n = e.target.value.trim();
                if (n && n !== block.name) renameBlock(block.id, n);
                else if (!n) e.target.value = block.name;
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label={t('Block name')}
            />
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-textDim">
                {t('Click exercises in the library to add them here.')}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {items.map((ex, i) => (
                  <li key={ex.id} className="flex items-center gap-2 rounded-lg border border-border bg-abyss px-2.5 py-1.5">
                    <span className="w-4 shrink-0 text-center font-num text-xs text-textDim">{i + 1}</span>
                    <CatDot name={ex.categories?.[0]} size={8} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">{ex.description}</span>
                      {ex.defaultDose?.length ? (
                        <span className="block truncate text-xs text-textDim">{doseText(ex.defaultDose, t)}</span>
                      ) : null}
                    </span>
                    <button
                      onClick={() => moveExerciseInBlock(block.id, i, i - 1)}
                      disabled={i === 0}
                      className="px-1 text-textDim hover:text-text disabled:opacity-30"
                      title={t('Move up')}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveExerciseInBlock(block.id, i, i + 1)}
                      disabled={i === items.length - 1}
                      className="px-1 text-textDim hover:text-text disabled:opacity-30"
                      title={t('Move down')}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeExerciseFromBlock(block.id, ex.id)}
                      className="px-1 text-textDim hover:text-red"
                      title={t('Remove from block')}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs text-textDim">
                {items.length === 0
                  ? ''
                  : dur.timed === 0
                    ? t('Give doses a hold, rest or time (like 1:30 or 10 min) to see how long the block takes.')
                    : dur.timed === dur.total
                      ? fill(t('About {time}'), { time: fmtDuration(dur.seconds) })
                      : fill(t('About {time} from {n} of {total} exercises with a time'), {
                          time: fmtDuration(dur.seconds),
                          n: dur.timed,
                          total: dur.total,
                        })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {items.length > 0 && (
                  <button
                    onClick={() => {
                      blockToSessionTemplate(block);
                      setSaved(block.name);
                    }}
                    className="pill pill-on btn-raised px-3 py-1.5 text-sm"
                    title={t('Templates carry a whole session (label, notes, doses) and are inserted via + from template in the builder.')}
                  >
                    {t('Save as session template')}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!confirm(`${t('Delete block')} "${block.name}"?`)) return;
                    removeBlock(block.id);
                    onActive(null);
                  }}
                  className="ml-auto text-xs text-red hover:underline"
                >
                  {t('Delete block')}
                </button>
              </div>
              {saved && (
                <p className="text-xs text-recover">
                  {fill(t('Saved "{name}" as a session template.'), { name: saved })}{' '}
                  <button onClick={onTemplates} className="font-bold underline">
                    {t('See templates')}
                  </button>
                </p>
              )}
            </div>
          </section>

          {/* The library to pick from */}
          <section className="space-y-2 lg:order-1">
            <input
              className="field"
              placeholder={t('Search exercises')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setCat(null)}
                  className={`pill px-2.5 py-0.5 text-xs ${cat == null ? 'pill-on' : ''}`}
                >
                  {t('All')}
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(cat === c ? null : c)}
                    className={`pill gap-1 px-2.5 py-0.5 text-xs ${cat === c ? 'pill-on' : ''}`}
                  >
                    <CatDot name={c} size={7} />
                    {c}
                  </button>
                ))}
              </div>
            )}
            <ul className="space-y-1">
              {picks.slice(0, PICK_LIMIT).map((ex) => {
                const added = inBlock.has(ex.id);
                return (
                  <li key={ex.id}>
                    <button
                      onClick={() => addExerciseToBlock(block.id, ex.id)}
                      disabled={added}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-left text-sm hover:border-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-border"
                    >
                      <CatDots names={ex.categories} size={7} />
                      <span className="min-w-0 flex-1 truncate text-text">{ex.description}</span>
                      <span className={`shrink-0 text-xs ${added ? 'text-recover' : 'text-accent'}`}>
                        {added ? '✓' : '+'}
                      </span>
                    </button>
                  </li>
                );
              })}
              {picks.length === 0 && <li className="text-sm text-textDim">{t('No exercises match.')}</li>}
              {picks.length > PICK_LIMIT && (
                <li className="px-1 text-xs text-textDim">
                  {picks.length - PICK_LIMIT} {t('more, keep typing to narrow down')}
                </li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
