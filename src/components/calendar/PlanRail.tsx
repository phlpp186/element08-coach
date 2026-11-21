/**
 * The plan calendar's library rail: session templates (a search box and a
 * list that scrolls, grouped by type, most used first, plus today's picker
 * with every template as a popup: Philipp's remark 1 on the mockup), week
 * templates, saved exercises and the App blocks.
 *
 * Drag one onto the calendar, or click it and then click a day (a week for a
 * week template). An exercise goes onto a session: drag it there, or click
 * it while a session is open in the side panel.
 */
import { useMemo, useState } from 'react';
import { fill, useT } from '../../i18n';
import { TemplatePicker } from '../TemplatePicker';
import { groupTemplates, type PickableTemplate } from '../../lib/templateGroups';
import { useExercises, type WeekTemplate } from '../../lib/library';
import { rankExercises } from '../../lib/librarySearch';
import { navigate } from '../../hooks/useHashRoute';
import type { PlanMode } from '../../lib/e08plan';
import { endDrag, startDrag } from './dnd';

export type Placing = { k: 'template' | 'week'; id: string } | null;

const MODE_EDGE: Record<PlanMode, string> = {
  depth: 'border-l-modeDepth',
  pool: 'border-l-modePool',
  dry: 'border-l-modeDry',
  general: 'border-l-textDim',
};
const MODE_LABEL: Record<PlanMode, string> = { depth: 'Depth', pool: 'Pool', dry: 'Dry', general: 'General' };

const item =
  'flex w-full cursor-grab select-none items-center gap-1.5 rounded-md border border-l-4 border-border bg-abyss px-2 py-1 text-left text-xs font-bold text-text hover:border-accent';

export function PlanRail({
  templates,
  weekTemplates,
  placing,
  onPlace,
  sessionOpen,
  onExercise,
  online,
}: {
  templates: PickableTemplate[];
  weekTemplates: WeekTemplate[];
  placing: Placing;
  onPlace: (p: Placing) => void;
  /** A session is open in the side panel: a click on an exercise adds it. */
  sessionOpen: boolean;
  onExercise: (description: string) => void;
  online: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [eq, setEq] = useState('');
  const groups = useMemo(() => groupTemplates(templates, q), [templates, q]);
  const all = useExercises();
  const exercises = useMemo(() => rankExercises(all, eq).slice(0, 60), [all, eq]);

  const on = (k: 'template' | 'week', id: string) => placing?.k === k && placing.id === id;
  const toggle = (k: 'template' | 'week', id: string) => onPlace(on(k, id) ? null : { k, id });

  return (
    <aside className="board space-y-2 p-2 text-sm">
      <section>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-textDim">{t('Session templates')}</h3>
        <input
          className="field w-full px-2 py-1 text-xs"
          placeholder={t('Search templates…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-1 max-h-72 overflow-y-auto pr-0.5">
          {templates.length === 0 && <p className="py-2 text-xs text-textDim">{t('No templates yet.')}</p>}
          {templates.length > 0 && groups.length === 0 && (
            <p className="py-2 text-xs text-textDim">{t('No templates match.')}</p>
          )}
          {groups.map((g) => (
            <div key={g.mode}>
              <div className="sticky top-0 bg-panel py-0.5 text-[10px] font-bold uppercase tracking-wide text-textDim">
                {t(MODE_LABEL[g.mode])} · {g.items.length}
              </div>
              {g.items.map((x) => (
                <button
                  key={x.id}
                  draggable
                  onDragStart={(e) => startDrag(e, { k: 'template', id: x.id })}
                  onDragEnd={endDrag}
                  onClick={() => toggle('template', x.id)}
                  title={x.sub || x.name}
                  className={`${item} mb-0.5 ${MODE_EDGE[x.mode]} ${on('template', x.id) ? 'outline outline-2 outline-accent' : ''}`}
                >
                  <span className="text-[10px] tracking-[-2px] text-textDim">⋮⋮</span>
                  <span className="min-w-0 truncate">{x.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {templates.length > 0 && (
          <TemplatePicker
            items={templates}
            onPick={(id) => onPlace({ k: 'template', id })}
            triggerLabel={fill(t('All templates ({n})'), { n: templates.length })}
            title={t('Session templates')}
            className="mt-1 block w-full rounded-md border border-dashed border-border py-1 text-center font-bold"
          />
        )}
      </section>

      {weekTemplates.length > 0 && (
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-textDim">{t('Week templates')}</h3>
          <div className="max-h-40 overflow-y-auto">
            {weekTemplates.map((w) => (
              <button
                key={w.id}
                draggable
                onDragStart={(e) => startDrag(e, { k: 'week', id: w.id })}
                onDragEnd={endDrag}
                onClick={() => toggle('week', w.id)}
                title={w.focus || w.name}
                className={`${item} mb-0.5 ${on('week', w.id) ? 'outline outline-2 outline-accent' : ''}`}
              >
                <span className="text-[10px] tracking-[-2px] text-textDim">⋮⋮</span>
                <span className="min-w-0 truncate">{w.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-textDim">{t('Exercises')}</h3>
        <input
          className="field w-full px-2 py-1 text-xs"
          placeholder={t('Search exercises…')}
          value={eq}
          onChange={(e) => setEq(e.target.value)}
        />
        <div className="mt-1 max-h-48 overflow-y-auto">
          {exercises.length === 0 && (
            <p className="py-2 text-xs text-textDim">{all.length ? t('No exercises match.') : t('No exercises yet.')}</p>
          )}
          {exercises.map((x) => (
            <button
              key={x.id}
              draggable
              onDragStart={(e) => startDrag(e, { k: 'exercise', d: x.description }, x.description)}
              onDragEnd={endDrag}
              onClick={() => sessionOpen && onExercise(x.description)}
              title={sessionOpen ? t('Add to the open session') : t('Drag onto a session')}
              className={`${item} mb-0.5 font-normal`}
            >
              {x.pinned && <span className="text-amber">★</span>}
              <span className="min-w-0 truncate">{x.description}</span>
            </button>
          ))}
        </div>
      </section>

      {online && (
        <section>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-textDim">{t('App blocks')}</h3>
          <button onClick={() => navigate('/block/new')} className={`${item} cursor-pointer border-l-[#ff6fa8]`}>
            <span className="min-w-0 truncate">S&amp;C Base Block</span>
            <span className="ml-auto shrink-0 rounded bg-[#ff6fa8]/20 px-1 text-[9px] text-[#ff6fa8]">13 wk</span>
          </button>
          <p className="mt-1 text-[11px] leading-snug text-textDim">
            {t('A block is built for one athlete. This opens the App block maker.')}
          </p>
        </section>
      )}

      <p className="text-[11px] leading-snug text-textDim">
        {t('Drag onto a day, or click one and then click a day. A week template goes on the week you drop it in.')}
      </p>
    </aside>
  );
}
