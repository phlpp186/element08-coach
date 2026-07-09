/**
 * CoachTimeline — the pure Gantt-style swimlane: one lane per dated plan, bars on
 * a shared date domain with a "today" line across all lanes, shaded by completion,
 * finish date + status on the right. Plans with no start date are listed below
 * (they can't be placed on a time axis). Data/auth live in CoachOverview.
 */
import { useMemo } from 'react';
import type { OverviewRow } from '../lib/supabase/useCoachOverview';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';

const FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fmt = (iso: string) => FMT.format(new Date(`${iso}T00:00:00Z`));
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function barStyle(status: OverviewRow['status']): { track: string; fill: string } {
  if (status === 'endingSoon') return { track: 'border-amber bg-amber/15', fill: 'bg-amber' };
  if (status === 'ended') return { track: 'border-border bg-panel', fill: 'bg-textDim' };
  return { track: 'border-accent bg-accent/15', fill: 'bg-accent' };
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
        <div className="glass-card rounded-xl p-4 sm:p-5 space-y-1.5 overflow-x-auto">
          {/* Axis: domain start · today · domain end, aligned over the track column. */}
          <div className="grid grid-cols-[8.5rem_1fr_5rem] items-end gap-x-3 pb-1 min-w-[34rem]">
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
            <div />
          </div>

          {dated.map((r) => {
            const st = barStyle(r.status);
            const left = scale.pct(r.start!);
            const width = Math.max(1.5, scale.pct(r.end!) - left);
            const frac = r.totalSessions > 0 ? Math.min(1, r.doneCount / r.totalSessions) : 0;
            return (
              <button
                key={r.assignmentId}
                onClick={() => navigate(`/connected/${r.studentId}`)}
                className="grid w-full grid-cols-[8.5rem_1fr_5rem] items-center gap-x-3 rounded-lg px-1 py-1.5 text-left hover:bg-accent/5 min-w-[34rem]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-text">{r.studentName}</div>
                  <div className="truncate text-xs text-textDim">{r.planTitle}</div>
                </div>

                <div className="relative h-7">
                  {todayInFrame && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-highlight/70"
                      style={{ left: `${scale.todayPct}%` }}
                    />
                  )}
                  <div
                    className={`absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded border ${st.track}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    <div
                      className={`h-full ${st.fill} opacity-70`}
                      style={{ width: `${frac * 100}%` }}
                    />
                  </div>
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
                        ? `${r.daysLeft}d ${t('left')}`
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
