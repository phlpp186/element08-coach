/**
 * TemplatesPanel — the templates kept in this browser, on the Exercises page:
 * week templates (`only="weeks"`), and the older browser-only session
 * templates (`only="sessions"`, which move into the shared library at
 * sign-in). Each is a card that opens to show what is inside (exercises with
 * doses, notes; a week as a Mon–Sun strip), with rename and delete. A week
 * template can also be edited in the week template builder and added to a
 * plan from here.
 */
import { useState, type ReactNode } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import { AddToPlanDialog } from '../AddToPlanDialog';
import {
  removeSessionTemplate,
  applyWeekTemplate,
  removeWeekTemplate,
  renameSessionTemplate,
  renameWeekTemplate,
  useSessionTemplates,
  useWeekTemplates,
  type SessionTemplate,
  type WeekTemplate,
} from '../../lib/library';
import { doseText } from '../../lib/e08plan';
import { fill, useT } from '../../i18n';

/** Mon..Sun in the browser's language (2026-01-05 is a Monday). */
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 0, 5 + i).toLocaleDateString(undefined, { weekday: 'short' }),
);

const MODE_LABEL: Record<string, string> = { depth: 'Depth', pool: 'Pool', dry: 'Dry', general: 'General' };

type TplExercise = { description: string; dose?: SessionTemplate['exercises'][number]['dose'] };

function ExerciseList({ items, t }: { items: TplExercise[]; t: (s: string) => string }) {
  if (!items.length) return <p className="text-xs text-textDim">{t('No exercises.')}</p>;
  return (
    <ol className="space-y-1">
      {items.map((e, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="w-4 shrink-0 text-right font-num text-xs leading-5 text-textDim">{i + 1}</span>
          <span className="min-w-0">
            <span className="text-text">{e.description || t('(no text)')}</span>
            {e.dose?.length ? <span className="text-textDim"> · {doseText(e.dose, t)}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function NameField({ name, onRename, t }: { name: string; onRename: (n: string) => void; t: (s: string) => string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-textDim">{t('Name')}</span>
      <input
        className="field font-heading"
        defaultValue={name}
        onBlur={(e) => {
          const n = e.target.value.trim();
          if (n && n !== name) onRename(n);
          else if (!n) e.target.value = name;
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Card({
  open,
  onToggle,
  head,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/5">
        <span className="min-w-0 flex-1">{head}</span>
        <span className="shrink-0 text-textDim">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>}
    </div>
  );
}

function SessionCard({ x, t }: { x: SessionTemplate; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const meta = [
    t(MODE_LABEL[x.mode] ?? x.mode),
    x.sessionType,
    fill(t(x.exercises.length === 1 ? '{n} exercise' : '{n} exercises'), { n: x.exercises.length }),
    x.useCount ? fill(t('used {n}×'), { n: x.useCount }) : t('not used yet'),
  ].filter(Boolean);
  return (
    <Card
      open={open}
      onToggle={() => setOpen((o) => !o)}
      head={
        <>
          <span className="block truncate font-bold text-text">{x.name}</span>
          <span className="block truncate text-xs text-textDim">{meta.join(' · ')}</span>
        </>
      }
    >
      <NameField name={x.name} onRename={(n) => renameSessionTemplate(x.id, n)} t={t} />
      {x.label && x.label !== x.name && (
        <p className="text-sm text-textDim">
          {t('Session label')}: <span className="text-text">{x.label}</span>
        </p>
      )}
      {x.body.trim() && <p className="whitespace-pre-wrap rounded-lg bg-abyss px-3 py-2 text-sm text-text">{x.body}</p>}
      <ExerciseList items={x.exercises} t={t} />
      <div className="flex justify-end">
        <button
          onClick={() => confirm(`${t('Delete')} "${x.name}"?`) && removeSessionTemplate(x.id)}
          className="text-xs text-red hover:underline"
        >
          {t('Delete template')}
        </button>
      </div>
    </Card>
  );
}

function WeekCard({ x, t }: { x: WeekTemplate; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const byDay = WEEKDAYS.map((_, d) => x.sessions.filter((s) => s.dayOfWeek === d));
  const meta = [
    x.focus,
    fill(t(x.sessions.length === 1 ? '{n} session' : '{n} sessions'), { n: x.sessions.length }),
    x.useCount ? fill(t('used {n}×'), { n: x.useCount }) : t('not used yet'),
  ].filter(Boolean);
  return (
    <Card
      open={open}
      onToggle={() => setOpen((o) => !o)}
      head={
        <>
          <span className="block truncate font-bold text-text">{x.name}</span>
          <span className="block truncate text-xs text-textDim">{meta.join(' · ')}</span>
          <span className="mt-1.5 grid grid-cols-7 gap-1">
            {byDay.map((list, d) => (
              <span
                key={d}
                className={`rounded px-1 py-0.5 text-center text-[10px] leading-tight ${
                  list.length ? 'bg-accent/20 font-bold text-text' : 'bg-abyss text-textDim'
                }`}
                title={list.map((s) => s.label).filter(Boolean).join(', ')}
              >
                {WEEKDAYS[d]}
                {list.length > 1 ? ` ×${list.length}` : ''}
              </span>
            ))}
          </span>
        </>
      }
    >
      <NameField name={x.name} onRename={(n) => renameWeekTemplate(x.id, n)} t={t} />
      {x.notes.trim() && <p className="whitespace-pre-wrap rounded-lg bg-abyss px-3 py-2 text-sm text-text">{x.notes}</p>}
      {byDay.map((list, d) =>
        list.map((s, i) => (
          <div key={`${d}-${i}`} className="space-y-1">
            <p className="text-xs font-bold text-textDim">
              {WEEKDAYS[d]} · <span className="text-text">{s.label || t(MODE_LABEL[s.mode] ?? s.mode)}</span>
            </p>
            <ExerciseList items={s.exercises} t={t} />
          </div>
        )),
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate(`/exercises/week-template/${encodeURIComponent(x.id)}`)}
          className="pill px-3 py-1 text-xs"
        >
          {t('Edit')}
        </button>
        <button
          onClick={() => setAdding(true)}
          disabled={x.sessions.length === 0}
          className="pill pill-on px-3 py-1 text-xs disabled:opacity-50"
        >
          {t('Add to plan')}
        </button>
        <span className="flex-1" />
        <button
          onClick={() => confirm(`${t('Delete')} "${x.name}"?`) && removeWeekTemplate(x.id)}
          className="text-xs text-red hover:underline"
        >
          {t('Delete template')}
        </button>
      </div>
      {adding && (
        <AddToPlanDialog
          payload={{ kind: 'week', name: x.name, apply: (week) => applyWeekTemplate(x, week) }}
          onClose={() => setAdding(false)}
        />
      )}
    </Card>
  );
}

export function TemplatesPanel({ only }: { only: 'sessions' | 'weeks' }) {
  const t = useT();
  const sessionTemplates = useSessionTemplates();
  const weekTemplates = useWeekTemplates();

  if (only === 'weeks') {
    return (
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-textDim">
            {t('A whole week of sessions, reusable in any plan with weeks. Week templates are saved in this browser.')}
          </p>
          <button
            onClick={() => navigate('/exercises/week-template/new')}
            className="pill pill-on btn-raised px-3 py-1.5 text-sm"
          >
            + {t('Build week template')}
          </button>
        </div>
        {weekTemplates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
            {t('No week templates yet.')}
          </div>
        ) : (
          weekTemplates.map((x) => <WeekCard key={x.id} x={x} t={t} />)
        )}
      </div>
    );
  }

  if (sessionTemplates.length === 0) return null;
  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-xs font-heading uppercase tracking-wide text-textDim">
        {t('Saved in this browser')} · {sessionTemplates.length}
      </h3>
      {sessionTemplates.map((x) => (
        <SessionCard key={x.id} x={x} t={t} />
      ))}
    </section>
  );
}
