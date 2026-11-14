/**
 * CycleCard — the cycle days an athlete chose to share with this coach, shown
 * next to their training: a thin band under a row of the last five weeks'
 * sessions, and a calendar that unfolds on tap.
 *
 * Shows only what is shared (period yes/no, symptoms, how training felt, and a
 * note when the athlete switched notes on) and only logged days: cycle days
 * count from logged period starts, nothing is predicted (lib/cycleView).
 */
import { useMemo, useState } from 'react';
import { fill, useLangValue, useT } from '../i18n';
import {
  buildCycleCells,
  cycleSummary,
  CYCLE_WEEKS,
  type CycleCell,
  type CycleDay,
  type CycleSession,
} from '../lib/cycleView';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** The app's symptom ids (lib/cycle/model CYCLE_SYMPTOMS) and their labels. */
const SYMPTOM: Record<string, string> = {
  cramps: 'Cramps',
  lowEnergy: 'Low energy',
  headache: 'Headache',
  bloating: 'Bloating',
  mood: 'Mood',
  sleep: 'Poor sleep',
};
// Text presentation (U+FE0E): iOS would draw these arrows as emoji.
const UP = '↗︎';
const DOWN = '↘︎';

function FeltMark({ felt }: { felt: number | null | undefined }) {
  if (felt == null || felt === 0) return null;
  return felt > 0 ? <span className="text-amber">{UP}</span> : <span className="text-recover">{DOWN}</span>;
}

export function CycleCard({
  name,
  days,
  sessions,
  today,
}: {
  name: string;
  days: CycleDay[];
  sessions: CycleSession[];
  today: string;
}) {
  const t = useT();
  const lang = useLangValue();
  const cells = useMemo(() => buildCycleCells(days, sessions, today), [days, sessions, today]);
  const summary = useMemo(() => cycleSummary(days, cells, today), [days, cells, today]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(today);
  const picked = cells.find((c) => c.key === sel) ?? null;
  const todayCell = cells.find((c) => c.key === today) ?? null;

  // Day and short month in the portal's language ("11 Nov", "11. Nov.", "11月11日").
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    [lang],
  );
  const keyLabel = (key: string) => dateFmt.format(new Date(`${key}T00:00:00Z`));
  const dateLabel = (c: Pick<CycleCell, 'key'>) => keyLabel(c.key);
  const symptomText = (d: CycleDay | null) => (d?.symptoms ?? []).map((id) => t(SYMPTOM[id] ?? id)).join(', ');
  const feltText = (f: number | null | undefined) =>
    f == null
      ? t('Not answered')
      : f < 0
        ? t('Easier than usual')
        : f === 0
          ? t('As usual')
          : f === 1
            ? t('A bit harder than usual')
            : t('Much harder than usual');
  const sessionText = (s: CycleSession) => {
    const what = s.count > 1 ? fill(t('{n} sessions'), { n: s.count }) : s.label || t('Session');
    return s.effort != null ? `${what}, ${t('effort')} ${s.effort}/10` : what;
  };
  const hasMark = (d: CycleDay | null) => !!d && (d.symptoms.length > 0 || (d.felt != null && d.felt !== 0));

  const cols = { gridTemplateColumns: `5.5rem repeat(${CYCLE_WEEKS * 7}, minmax(0, 1fr))` };
  const selRing = 'outline outline-2 -outline-offset-1 outline-text';

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading tracking-wide text-text">{t('LAST 5 WEEKS')}</h3>
        {todayCell?.cycleDay != null && (
          <span className="text-xs text-textDim">
            {t('Today')}: {fill(t('cycle day {n}'), { n: todayCell.cycleDay })}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border bg-panel p-3 sm:p-4">
        {/* Week labels */}
        <div className="grid items-center" style={cols}>
          <span />
          {cells
            .filter((_, i) => i % 7 === 0)
            .map((c) => (
              <span key={c.key} className="pl-1 text-xs text-textDim" style={{ gridColumn: 'span 7' }}>
                {dateLabel(c)}
              </span>
            ))}
        </div>

        {/* Sessions */}
        <div className="grid items-center" style={cols}>
          <span className="text-xs text-textDim">{t('Sessions')}</span>
          {cells.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSel(c.key)}
              title={c.session ? `${dateLabel(c)} · ${sessionText(c.session)}` : dateLabel(c)}
              className={`flex h-9 items-center justify-center border-l ${i % 7 === 0 ? 'border-border' : 'border-transparent'}`}
            >
              {c.session && (
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                  {c.session.effort ?? '·'}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cycle band */}
        <div className="mt-1 grid items-center" style={cols}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="justify-self-start text-xs text-textDim hover:text-text"
          >
            {t('Cycle')} <span aria-hidden>{open ? '▴' : '▾'}</span>
          </button>
          {cells.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setSel(c.key);
                setOpen(true);
              }}
              aria-label={dateLabel(c)}
              className={`h-3.5 border-l ${i % 7 === 0 ? 'border-border' : 'border-transparent'} ${
                c.day?.period ? 'bg-period' : 'bg-surface'
              } ${c.key === sel ? selRing : ''}`}
            />
          ))}
        </div>
        <div className="grid items-center" style={cols}>
          <span />
          {cells.map((c) => (
            <span key={c.key} className="flex h-4 items-center justify-center text-[11px] leading-none">
              {c.day?.felt != null && c.day.felt !== 0 ? (
                <FeltMark felt={c.day.felt} />
              ) : c.day?.symptoms.length ? (
                <span className="text-text">•</span>
              ) : null}
            </span>
          ))}
        </div>

        {/* One line for the selected day */}
        {picked && (
          <p className="mt-2 text-sm text-textDim">
            <span className="font-bold text-text">{dateLabel(picked)}</span>
            {picked.cycleDay != null && ` · ${fill(t('cycle day {n}'), { n: picked.cycleDay })}`}
            {picked.day?.period && ` · ${t('Period').toLowerCase()}`}
            {picked.day?.symptoms.length ? ` · ${symptomText(picked.day).toLowerCase()}` : ''}
            {picked.day?.felt != null && picked.day.felt !== 0 ? ` · ${feltText(picked.day.felt).toLowerCase()}` : ''}
            {picked.session && ` · ${sessionText(picked.session)}`}
          </p>
        )}

        {/* Calendar, on tap */}
        {open && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-textDim">
                {fill(t('Shared with you by {name}. They can stop sharing at any time.'), { name })}
              </p>
              <button type="button" onClick={() => setOpen(false)} className="pill px-3 py-1 text-xs">
                {t('Close')}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                [t('Last period started'), summary.lastStart ? keyLabel(summary.lastStart) : '—'],
                [
                  t('Last cycle length'),
                  summary.cycleLength != null ? fill(t('{n} days'), { n: summary.cycleLength }) : '—',
                ],
                [
                  t('Training felt harder'),
                  fill(t('{a} of {b} session days'), { a: summary.harderDays, b: summary.sessionDays }),
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface px-3 py-2">
                  <span className="block text-xs text-textDim">{k}</span>
                  <span className="block font-heading text-text">{v}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-textDim">
                {WEEKDAYS.map((w) => (
                  <span key={w}>{t(w)}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={c.future}
                    onClick={() => setSel(c.key)}
                    className={`flex min-h-[60px] flex-col gap-0.5 rounded-lg border p-1.5 text-left ${
                      c.future
                        ? 'border-dashed border-border bg-transparent'
                        : c.day?.period
                          ? 'border-period/60 bg-period/20'
                          : 'border-border bg-abyss'
                    } ${c.key === sel ? 'ring-2 ring-text' : ''}`}
                  >
                    <span className="flex justify-between text-xs text-textDim">
                      <span className={c.key === today ? 'font-bold text-text' : ''}>{c.dayOfMonth}</span>
                      {!c.future && c.cycleDay != null && <span className="text-[11px]">{c.cycleDay}</span>}
                    </span>
                    {hasMark(c.day) && (
                      <span className="flex items-center gap-1 text-xs leading-none">
                        {c.day?.symptoms.length ? <span className="text-text">•</span> : null}
                        <FeltMark felt={c.day?.felt} />
                      </span>
                    )}
                    {c.session && (
                      <span className="truncate rounded bg-accent/15 px-1 text-[11px] text-accent">
                        {c.session.count > 1 ? `×${c.session.count}` : c.session.label.split(' ')[0]} {c.session.effort ?? ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {picked && !picked.future && (
              <div className="text-sm">
                <p className="mb-1 text-text">
                  <span className="font-bold">{dateLabel(picked)}</span>
                  {picked.cycleDay != null && (
                    <span className="text-textDim"> · {fill(t('cycle day {n}'), { n: picked.cycleDay })}</span>
                  )}
                </p>
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-textDim">{t('Period')}</dt>
                  <dd className="text-text">{picked.day?.period ? t('Yes') : t('No')}</dd>
                  <dt className="text-textDim">{t('Symptoms')}</dt>
                  <dd className="text-text">{symptomText(picked.day) || t('None logged')}</dd>
                  <dt className="text-textDim">{t('Training felt')}</dt>
                  <dd className="text-text">{feltText(picked.day?.felt)}</dd>
                  <dt className="text-textDim">{t('Session')}</dt>
                  <dd className="text-text">{picked.session ? sessionText(picked.session) : t('No session')}</dd>
                  {picked.day?.note && (
                    <>
                      <dt className="text-textDim">{t('Note')}</dt>
                      <dd className="whitespace-pre-wrap text-text">{picked.day.note}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-textDim">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3.5 rounded-sm bg-period" /> {t('Period')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-text">•</span> {t('Symptoms')}
              </span>
              <span className="flex items-center gap-1.5">
                <FeltMark felt={1} /> {t('Felt harder')}
              </span>
              <span className="flex items-center gap-1.5">
                <FeltMark felt={-1} /> {t('Felt easier')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px]">12</span> {t('Cycle day')}
              </span>
            </div>
            <p className="text-xs text-textDim">
              {t('Only days the athlete logged and shares are shown. Nothing is predicted.')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
