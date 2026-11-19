/**
 * CoachTimeline — the Overview's pure rendering. OverviewTiles: four summary
 * numbers. SessionDots (Philipp's option B, 2026-11-19): one lane per athlete
 * on a shared day axis, every session a dot. A filled dot is a reported
 * session on the day it was done, coloured by effort; a cross is a "not done"
 * answer; an amber ring is a planned day without a report after the grace; a
 * plain ring is planned (or still open). Nothing is drawn as "missed": the
 * portal only knows what was reported. Data/auth live in CoachOverview.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import type { OverviewAthlete, OverviewRow } from '../lib/supabase/useCoachOverview';
import { dotColumns, isDoneKind, type Dot, type DotKind } from '../lib/overviewDots';
import { addDays, calendarFormat, formatIso, mondayOf } from '../lib/e08plan';
import { navigate } from '../hooks/useHashRoute';
import { fill, useT } from '../i18n';

const FMT = calendarFormat({ day: 'numeric', month: 'short' });
const fmt = (iso: string) => formatIso(FMT, iso);

/** Weeks shown before this week and from this week on. */
const RANGES = {
  short: { back: 6, ahead: 4, label: '10 weeks' },
  long: { back: 18, ahead: 8, label: '6 months' },
} as const;
type RangeId = keyof typeof RANGES;

const GRID = 'grid-cols-[7rem_minmax(0,1fr)_6.5rem]';
const MIN_W = 'min-w-[34rem]';

/** How each kind is drawn. Open (grace still running) looks like planned:
 *  both are "not due for an answer yet". */
const DOT: Record<DotKind, string> = {
  done: 'bg-recover',
  hard: 'bg-amber',
  max: 'bg-red',
  notDone: '',
  noReport: 'border-[1.5px] border-amber',
  open: 'border-[1.5px] border-textDim',
  planned: 'border-[1.5px] border-textDim',
};

const LEGEND: { kind: DotKind; label: string }[] = [
  { kind: 'done', label: 'done, easy to moderate' },
  { kind: 'hard', label: 'done, hard (7 to 8)' },
  { kind: 'max', label: 'done, very hard (9 to 10)' },
  { kind: 'notDone', label: 'reported as not done' },
  { kind: 'noReport', label: 'no report' },
  { kind: 'planned', label: 'planned' },
];

const STATE_LABEL: Record<DotKind, string> = {
  done: 'done',
  hard: 'done',
  max: 'done',
  notDone: 'reported as not done',
  noReport: 'no report',
  open: 'still open',
  planned: 'planned',
};

function DotMark({ kind, small }: { kind: DotKind; small?: boolean }) {
  const size = small ? 'h-1 w-1' : 'h-[7px] w-[7px]';
  if (kind === 'notDone')
    return (
      <span className={`block text-center font-bold leading-none text-textDim ${small ? 'text-[6px]' : 'text-[9px]'}`} aria-hidden="true">
        ×
      </span>
    );
  return <span className={`block shrink-0 rounded-full ${size} ${DOT[kind]}`} aria-hidden="true" />;
}

function dotTitle(d: Dot, t: (s: string) => string): string {
  const parts = [d.label ?? t('Session'), fmt(d.day), t(STATE_LABEL[d.kind])];
  if (isDoneKind(d.kind) && d.rating != null) parts.push(fill(t('effort {n}/10'), { n: d.rating }));
  if (isDoneKind(d.kind) && d.planned && d.planned !== d.day) parts.push(fill(t('planned for {date}'), { date: fmt(d.planned) }));
  parts.push(d.plan);
  return parts.join(' · ');
}

export function SessionDots({ athletes, todayIso }: { athletes: OverviewAthlete[]; todayIso: string }) {
  const t = useT();
  const [range, setRange] = useState<RangeId>('short');
  const { back, ahead } = RANGES[range];
  const from = addDays(mondayOf(todayIso), -back * 7);
  const total = (back + ahead) * 7;
  const last = addDays(from, total - 1);
  // The line sits after today's column: today itself is still "now or past".
  const todayPct = (((back * 7 + ((new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) / total) * 100);
  const small = range === 'long';

  const lanes = useMemo(
    () => athletes.map((a) => ({ a, cols: dotColumns(a.dots, from, total) })),
    [athletes, from, total],
  );

  return (
    <div className="glass-card overflow-x-auto rounded-xl p-4 sm:p-5">
      <div className={`mb-3 flex items-center justify-end gap-2 ${MIN_W}`}>
        {(Object.keys(RANGES) as RangeId[]).map((id) => (
          <button
            key={id}
            onClick={() => setRange(id)}
            aria-pressed={range === id}
            className={`pill px-3 py-1 text-xs ${range === id ? 'pill-on' : ''}`}
          >
            {t(RANGES[id].label)}
          </button>
        ))}
      </div>

      {/* Axis: window start · today · window end, over the day column. */}
      <div className={`grid ${GRID} ${MIN_W} items-end gap-x-3 pb-1`}>
        <div />
        <div className="relative h-4 text-[10px] text-textDim">
          <span className="absolute left-0">{fmt(from)}</span>
          <span className="absolute right-0">{fmt(last)}</span>
          <span className="absolute -translate-x-1/2 font-heading text-highlight" style={{ left: `${todayPct}%` }}>
            {t('Today')}
          </span>
        </div>
        <div />
      </div>

      <div>
        {lanes.map(({ a, cols }) => {
          const s = a.summary;
          return (
            <button
              key={a.studentId}
              onClick={() => navigate(`/connected/${a.studentId}`)}
              className={`grid w-full ${GRID} ${MIN_W} items-center gap-x-3 border-b border-border/60 px-1 py-2 text-left last:border-b-0 hover:bg-accent/5`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-text">{a.name}</div>
                <div className="truncate text-xs text-textDim">
                  {a.planTitles[0]}
                  {a.planTitles.length > 1 ? ` +${a.planTitles.length - 1}` : ''}
                </div>
              </div>

              <div className="relative">
                <div className="grid h-8 items-center" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
                  {cols.map((list, i) => (
                    <div
                      key={i}
                      className={`flex h-full flex-col items-center justify-center gap-[2px] ${
                        i % 7 === 0 ? 'border-l border-textDim/25' : ''
                      }`}
                    >
                      {list.slice(0, 3).map((d, j) => (
                        <span key={j} title={dotTitle(d, t)}>
                          <DotMark kind={d.kind} small={small} />
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="absolute -bottom-1 -top-1 w-0.5 bg-highlight/80" style={{ left: `${todayPct}%` }} />
              </div>

              <div className="text-right text-xs leading-tight">
                <div className="font-bold text-text">{fill(t('{done} of {due}'), { done: s.done, due: s.due })}</div>
                {s.noReport > 0 ? (
                  <div className="font-bold text-amber">{fill(t('{n} without report'), { n: s.noReport })}</div>
                ) : (
                  <div className="text-textDim">{t('last 4 weeks')}</div>
                )}
                {!s.plannedUntil ? (
                  <div className="font-bold text-amber">{t('nothing planned ahead')}</div>
                ) : s.weeksAhead <= 1 ? (
                  <div className="text-textDim">{t('1 week planned')}</div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-textDim ${MIN_W}`}>
        {LEGEND.map((l) => (
          <span key={l.kind} className="inline-flex items-center gap-1.5">
            <DotMark kind={l.kind} />
            {t(l.label)}
          </span>
        ))}
      </div>
      <p className={`mt-2 text-[11px] text-textDim ${MIN_W}`}>
        {t('A dot is a session the athlete reported in the app, on the day it was done. Training that was not reported does not show here.')}
      </p>
    </div>
  );
}

/** The four numbers above the timeline. */
export function OverviewTiles({ rows }: { rows: OverviewRow[] }) {
  const t = useT();
  const running = rows.filter((r) => r.status !== 'ended').length;
  const planned = rows.reduce((n, r) => n + r.recent.planned, 0);
  const done = rows.reduce((n, r) => n + r.recent.done, 0);
  const pct = planned > 0 ? Math.round((done / planned) * 100) : null;
  const ending = rows.filter((r) => r.status === 'endingSoon').length;
  const rising = rows.filter((r) => r.rising).length;
  const tiles: { value: string; label: string; tone: string }[] = [
    { value: String(running), label: t('Active plans'), tone: 'var(--c-accent)' },
    {
      value: pct == null ? '0' : `${pct}%`,
      label: pct == null ? t('Sessions due, last 4 weeks') : t('Done, last 4 weeks'),
      tone: pct == null || pct >= 75 ? 'var(--c-recover)' : pct >= 50 ? 'var(--c-amber)' : 'var(--c-red)',
    },
    { value: String(ending), label: t('Ending within 14 days'), tone: 'var(--c-amber)' },
    { value: String(rising), label: t('Effort rising'), tone: rising ? 'var(--c-red)' : 'var(--c-textDim)' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((x) => (
        <div
          key={x.label}
          className="tile px-3 py-2.5"
          style={{ '--tone': `rgb(${x.tone})` } as CSSProperties}
        >
          <div className="tile-value font-num text-2xl font-bold leading-tight">{x.value}</div>
          <div className="tile-label text-xs font-bold">{x.label}</div>
        </div>
      ))}
    </div>
  );
}
