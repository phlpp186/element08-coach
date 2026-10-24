/**
 * CoachTimeline — the pure Gantt-style swimlane: one lane per dated plan on a
 * shared date domain with a "today" line across all lanes. Each plan is cut
 * into its weeks, coloured by how much of the week the athlete did, with the
 * athlete's recent effort ratings beside it (and a badge when effort is
 * rising), then finish date + status on the right. Plans with no start date
 * are listed below (they can't be placed on a time axis). Data/auth live in
 * CoachOverview.
 */
import { useMemo, type CSSProperties } from 'react';
import type { OverviewRow } from '../lib/supabase/useCoachOverview';
import type { WeekBlock, WeekState } from '../lib/overviewWeeks';
import { addDays, calendarFormat, formatIso } from '../lib/e08plan';
import { navigate } from '../hooks/useHashRoute';
import { fill, useT } from '../i18n';

const FMT = calendarFormat({ day: 'numeric', month: 'short' });
const fmt = (iso: string) => formatIso(FMT, iso);
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

const GRID = 'grid-cols-[8.5rem_1fr_4.5rem_5rem]';
const MIN_W = 'min-w-[38rem]';

/** Week block fill per state; 'current' is drawn as an outline instead. */
const BLOCK: Record<WeekState, string> = {
  done: 'bg-recover',
  partial: 'bg-amber',
  missed: 'bg-red',
  rest: 'border border-dashed border-textDim/50',
  current: 'border-2 border-highlight bg-panel',
  ahead: 'bg-textDim/20',
};

const LEGEND: { state: WeekState; label: string }[] = [
  { state: 'done', label: 'All done' },
  { state: 'partial', label: 'Some done' },
  { state: 'missed', label: 'Missed' },
  { state: 'current', label: 'This week' },
  { state: 'rest', label: 'Rest week' },
  { state: 'ahead', label: 'Ahead' },
];

function weekTitle(w: WeekBlock, t: (s: string) => string): string {
  const head = fill(t('Week {n}'), { n: w.week });
  if (w.state === 'rest') return `${head}: ${t('Rest week')}`;
  if (w.state === 'ahead') return `${head}: ${fill(t('{n} planned'), { n: w.planned })}`;
  return `${head}: ${fill(t('{done} of {planned} done'), { done: w.done, planned: w.planned })}`;
}

/** Recent effort ratings (1-10) as a small line, the latest as a dot. */
function EffortSpark({ ratings, rising }: { ratings: number[]; rising: boolean }) {
  const W = 56;
  const H = 20;
  const x = (i: number) => (ratings.length === 1 ? W / 2 : 3 + (i / (ratings.length - 1)) * (W - 6));
  const y = (r: number) => H - 3 - ((Math.min(10, Math.max(1, r)) - 1) / 9) * (H - 6);
  const tone = rising ? 'text-amber' : 'text-textDim';
  const last = ratings.length - 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={tone} aria-hidden="true">
      {ratings.length > 1 && (
        <polyline
          points={ratings.map((r, i) => `${x(i)},${y(r)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <circle cx={x(last)} cy={y(ratings[last])} r={2.75} fill="currentColor" />
    </svg>
  );
}

export function CoachTimeline({ rows, todayIso }: { rows: OverviewRow[]; todayIso: string }) {
  const t = useT();
  const dated = useMemo(() => rows.filter((r) => r.start && r.end), [rows]);
  const undated = useMemo(() => rows.filter((r) => !(r.start && r.end)), [rows]);

  // Shared date domain across every lane (plus today, so its line is always in
  // frame), padded a little so bars and labels never sit flush to the edges.
  const scale = useMemo(() => {
    if (dated.length === 0) return null;
    const todayN = dayNum(todayIso);
    let lo = todayN;
    let hi = todayN;
    for (const r of dated) {
      lo = Math.min(lo, dayNum(r.start!));
      hi = Math.max(hi, dayNum(r.end!));
    }
    const pad = Math.max(2, Math.round((hi - lo) * 0.04));
    lo -= pad;
    hi += pad;
    const span = Math.max(1, hi - lo);
    return {
      pct: (iso: string) => ((dayNum(iso) - lo) / span) * 100,
      todayPct: ((todayN - lo) / span) * 100,
      loIso: new Date(lo * 86_400_000).toISOString().slice(0, 10),
      hiIso: new Date(hi * 86_400_000).toISOString().slice(0, 10),
    };
  }, [dated, todayIso]);

  const todayInFrame = scale && scale.todayPct >= 0 && scale.todayPct <= 100;

  return (
    <div className="space-y-5">
      {dated.length > 0 && scale && (
        <div className="glass-card rounded-xl p-4 sm:p-5 overflow-x-auto">
          {/* Axis: domain start · today · domain end, aligned over the track column. */}
          <div className={`grid ${GRID} ${MIN_W} items-end gap-x-3 pb-1`}>
            <div />
            <div className="relative h-4 text-[10px] text-textDim">
              <span className="absolute left-0">{fmt(scale.loIso)}</span>
              <span className="absolute right-0">{fmt(scale.hiIso)}</span>
              {todayInFrame && (
                <span
                  className="absolute -translate-x-1/2 font-heading text-highlight"
                  style={{ left: `${scale.todayPct}%` }}
                >
                  {t('Today')}
                </span>
              )}
            </div>
            <div className="text-center text-[10px] text-textDim">{t('Effort')}</div>
            <div />
          </div>

          <div className="space-y-1">
            {dated.map((r) => {
              const left = scale.pct(r.start!);
              const width = Math.max(1.5, scale.pct(addDays(r.end!, 1)) - left);
              return (
                <button
                  key={r.assignmentId}
                  onClick={() => navigate(`/connected/${r.studentId}`)}
                  className={`grid w-full ${GRID} ${MIN_W} items-center gap-x-3 rounded-lg px-1 py-1.5 text-left hover:bg-accent/5`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-text">{r.studentName}</div>
                    <div className="truncate text-xs text-textDim">{r.planTitle}</div>
                  </div>

                  <div className="relative h-8">
                    {/* The plan's span, under its weeks. */}
                    <div
                      className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md bg-textDim/10"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                    {r.weeks.map((w) => {
                      const from = w.weekStart < r.start! ? r.start! : w.weekStart;
                      const lastDay = addDays(w.weekStart, 6);
                      const to = addDays(lastDay > r.end! ? r.end! : lastDay, 1);
                      const wl = scale.pct(from);
                      const ww = scale.pct(to) - wl;
                      return (
                        <div
                          key={w.week}
                          title={weekTitle(w, t)}
                          className="absolute top-1/2 h-5 -translate-y-1/2 px-px"
                          style={{ left: `${wl}%`, width: `${ww}%` }}
                        >
                          <div className={`relative h-full overflow-hidden rounded-[3px] ${BLOCK[w.state]}`}>
                            {w.state === 'current' && w.planned > 0 && (
                              <div
                                className="absolute inset-y-0 left-0 bg-recover/70"
                                style={{ width: `${Math.min(1, w.done / w.planned) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {todayInFrame && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-highlight/80"
                        style={{ left: `${scale.todayPct}%` }}
                      />
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    {r.ratings.length > 0 ? (
                      <>
                        <EffortSpark ratings={r.ratings} rising={!!r.rising} />
                        {r.rising ? (
                          <span
                            title={t('Effort rising')}
                            className="rounded-full bg-amber/15 px-1.5 text-[10px] font-bold leading-4 text-amber"
                          >
                            ↑ {r.rising.join('·')}
                          </span>
                        ) : (
                          <span className="font-num text-[10px] text-textDim">
                            {r.ratings[r.ratings.length - 1]}/10
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-textDim">{t('No ratings')}</span>
                    )}
                  </div>

                  <div className="text-right text-xs leading-tight">
                    <div className="text-text">{fmt(r.end!)}</div>
                    <div
                      className={
                        r.status === 'ended'
                          ? 'text-red'
                          : r.status === 'endingSoon'
                            ? 'text-amber'
                            : 'text-textDim'
                      }
                    >
                      {r.status === 'ended'
                        ? t('ended')
                        : r.daysLeft != null
                          ? fill(t('{n}d left'), { n: r.daysLeft })
                          : ''}
                    </div>
                    <div className="text-textDim">
                      {r.doneCount}/{r.totalSessions}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-textDim ${MIN_W}`}>
            {LEGEND.map((l) => (
              <span key={l.state} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-3 w-4 rounded-[3px] ${BLOCK[l.state]}`} />
                {t(l.label)}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded-full bg-amber/15 px-1.5 text-[10px] font-bold leading-4 text-amber">↑</span>
              {t('Effort rising: last 3 ratings climbing to 7+')}
            </span>
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-textDim">{t('No start date set (not on the timeline):')}</p>
          {undated.map((r) => (
            <div
              key={r.assignmentId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                <span className="text-text">{r.studentName}</span>{' '}
                <span className="text-textDim">· {r.planTitle}</span>
              </span>
              <span className="shrink-0 text-xs text-textDim">
                {r.doneCount}/{r.totalSessions} {t('done')}
              </span>
            </div>
          ))}
        </div>
      )}
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
