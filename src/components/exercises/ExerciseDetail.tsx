/**
 * ExerciseDetail — the Exercises page's side panel for one exercise: text,
 * pin, categories, default dose, where it is used (blocks, templates), and
 * archive/remove. A sticky column beside the list on wide screens, a bottom
 * sheet on narrow ones.
 */
import { useState } from 'react';
import {
  removeExercises,
  setArchived,
  togglePinned,
  updateExercise,
  type ExerciseBlock,
  type LibraryExercise,
  type SessionTemplate,
  type WeekTemplate,
} from '../../lib/library';
import { whereUsed } from '../../lib/exerciseInsights';
import { CategoryPicker } from '../CategoryPicker';
import { DoseEditor } from '../dose';
import { fill, useT } from '../../i18n';

const LAST_USED_FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function ExerciseDetail({
  ex,
  categories,
  blocks,
  sessionTemplates,
  weekTemplates,
  onClose,
  onOpenBlock,
}: {
  ex: LibraryExercise;
  categories: string[];
  blocks: ExerciseBlock[];
  sessionTemplates: SessionTemplate[];
  weekTemplates: WeekTemplate[];
  onClose: () => void;
  onOpenBlock: (blockId: string) => void;
}) {
  const t = useT();
  const [desc, setDesc] = useState(ex.description);
  const used = whereUsed(ex, blocks, sessionTemplates, weekTemplates);
  const commit = () => {
    const d = desc.trim();
    if (d && d !== ex.description) updateExercise(ex.id, { description: d });
    else if (!d) setDesc(ex.description);
  };
  const label = 'text-xs font-bold text-textDim';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        className="board fixed inset-x-0 bottom-0 z-50 max-h-[80vh] space-y-4 overflow-y-auto rounded-b-none rounded-t-2xl p-4 lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:rounded-[var(--radius-card)]"
        aria-label={t('Exercise details')}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-xs font-heading uppercase tracking-wide text-textDim">{t('Exercise')}</p>
          <button onClick={onClose} className="px-1 text-textDim hover:text-text" title={t('Close')}>
            ✕
          </button>
        </div>

        <textarea
          className="field min-h-[3.5rem] font-bold"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => togglePinned(ex.id)}
            className={`pill px-2.5 py-1 ${ex.pinned ? 'pill-on' : ''}`}
            title={t('Pin to the builder palette')}
          >
            {ex.pinned ? '★' : '☆'} {ex.pinned ? t('Pinned') : t('Pin')}
          </button>
          <span className="text-textDim">
            {ex.useCount
              ? `${fill(t('Used {n}×'), { n: ex.useCount })}${ex.lastUsedAt ? ` · ${LAST_USED_FMT.format(new Date(ex.lastUsedAt))}` : ''}`
              : t('never used')}
          </span>
        </div>

        <div className="space-y-1.5">
          <p className={label}>{t('Categories (up to 3, optional)')}</p>
          <CategoryPicker
            selected={ex.categories ?? []}
            categories={categories}
            onChange={(next) => updateExercise(ex.id, { categories: next })}
          />
        </div>

        <div className="space-y-1.5">
          <p className={label}>{t('Default dose')}</p>
          <p className="text-xs text-textDim">
            {t('Copied into a session when this exercise is added; tweak it there per week. Mix any parts: hold + distance + rest is fine.')}
          </p>
          <DoseEditor dose={ex.defaultDose ?? []} onChange={(d) => updateExercise(ex.id, { defaultDose: d })} />
        </div>

        <div className="space-y-1.5">
          <p className={label}>{t('Used in')}</p>
          {used.blocks.length + used.sessionTemplates.length + used.weekTemplates.length === 0 ? (
            <p className="text-xs text-textDim">{t('No blocks or templates yet.')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {blocks
                .filter((b) => b.exerciseIds.includes(ex.id))
                .map((b) => (
                  <li key={b.id}>
                    <button onClick={() => onOpenBlock(b.id)} className="text-left text-accent hover:underline">
                      <span aria-hidden="true">▦</span> {b.name}
                    </button>
                  </li>
                ))}
              {used.sessionTemplates.map((n) => (
                <li key={`s${n}`} className="text-text">
                  <span className="text-textDim" aria-hidden="true">▤</span> {n}
                </li>
              ))}
              {used.weekTemplates.map((n) => (
                <li key={`w${n}`} className="text-text">
                  <span className="text-textDim" aria-hidden="true">▥</span> {n}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border pt-3">
          {ex.archived ? (
            <button onClick={() => setArchived([ex.id], false)} className="text-sm text-accent hover:underline">
              {t('Restore')}
            </button>
          ) : (
            <button
              onClick={() => setArchived([ex.id], true)}
              className="text-sm text-textDim hover:text-text"
              title={t('Keeps its history; leaves every picker. Find it under Archived.')}
            >
              {t('Archive')}
            </button>
          )}
          <button
            onClick={() => {
              if (!confirm(`${t('Remove')} "${ex.description}"?`)) return;
              removeExercises([ex.id]);
              onClose();
            }}
            className="ml-auto text-sm text-red hover:underline"
          >
            {t('Remove')}
          </button>
        </div>
      </aside>
    </>
  );
}
