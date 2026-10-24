/**
 * PlanDetail — the Library's side panel for one plan: its dates and where it
 * stands today, the week strip (with the phases of a season plan), who has
 * it and how many sessions each has done, where it was last edited, and the
 * actions: edit, assign, duplicate, download, delete. A sticky column beside
 * the list on wide screens, a bottom sheet on narrow ones.
 */
import type { ReactNode } from 'react';
import type { SavedPlan } from '../../lib/types';
import type { CoachAssignment } from '../../lib/supabase/coachData';
import { calendarFormat, formatIso, MESO_LABEL, planStats, type MesoType } from '../../lib/e08plan';
import { planNow, weekStrip } from '../../lib/libraryInsights';
import { PHASE_HEX } from '../../lib/phaseColor';
import { PlanSpan } from '../PlanSpan';
import { WeekStrip } from './WeekStrip';
import { AssignToConnectedButton } from '../AssignToConnectedButton';
import { navigate } from '../../hooks/useHashRoute';
import { fill, useT } from '../../i18n';

const FMT = calendarFormat({ day: 'numeric', month: 'short' });

export function PlanDetail({
  sp,
  todayIso,
  assignments,
  localAthlete,
  edited,
  pending,
  conflict,
  online,
  onClose,
  onDuplicate,
  onDownload,
  onDelete,
  ensurePublished,
}: {
  sp: SavedPlan;
  todayIso: string;
  /** Its active cloud assignments. */
  assignments: CoachAssignment[];
  /** The local (unconnected) athlete the plan is attached to, if any. */
  localAthlete: string | null;
  /** "iPhone · 2 h ago" style line (device chip rendered by the caller). */
  edited: ReactNode;
  pending: boolean;
  conflict: boolean;
  online: boolean;
  onClose: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onDelete: () => void;
  ensurePublished: () => Promise<string | null>;
}) {
  const t = useT();
  const plan = sp.plan;
  const strip = weekStrip(plan);
  const now = planNow(plan, todayIso);
  const stats = planStats(plan);
  const phases: { type: MesoType; weeks: number }[] =
    plan.kind === 'season' ? plan.phases.map((ph) => ({ type: ph.type, weeks: ph.weeks.length })) : [];
  const label = 'text-xs font-bold text-textDim';

  const nowText =
    now.state === 'upcoming'
      ? fill(t(now.inDays === 1 ? 'Starts tomorrow' : 'Starts in {n} days'), { n: now.inDays })
      : now.state === 'running'
        ? fill(t(now.unit === 'week' ? 'Week {n} of {total} now' : 'Day {n} of {total} now'), {
            n: now.index,
            total: now.total,
          })
        : now.state === 'ended'
          ? fill(t('Ended {date}'), { date: formatIso(FMT, now.end) })
          : t('No start date set');

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        className="board fixed inset-x-0 bottom-0 z-50 max-h-[80vh] space-y-4 overflow-y-auto p-4 lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)]"
        aria-label={t('Plan details')}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-base text-text">{plan.name?.trim() || t('Untitled plan')}</h3>
            <p className="text-xs text-textDim">
              {plan.kind === 'season' ? t('Season') : t('Training')} ·{' '}
              {fill(t(stats.unitLabel === 'day' ? '{n} days' : '{n} weeks'), { n: stats.units })} ·{' '}
              {fill(t(stats.sessions === 1 ? '{n} session' : '{n} sessions'), { n: stats.sessions })}
            </p>
          </div>
          <button onClick={onClose} className="px-1 text-textDim hover:text-text" title={t('Close')}>
            ✕
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm text-text">
            <PlanSpan plan={plan} />
          </p>
          <p className={`text-sm font-bold ${now.state === 'running' ? 'text-accent' : 'text-textDim'}`}>{nowText}</p>
          <WeekStrip
            weeks={strip}
            height={16}
            current={now.state === 'running' && now.unit === 'week' ? now.index : null}
          />
          {phases.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-textDim">
              {phases.map((ph, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PHASE_HEX[ph.type] }} />
                  {t(MESO_LABEL[ph.type])} {ph.weeks}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className={label}>{t('Who has it')}</p>
          {assignments.length === 0 && !localAthlete ? (
            <p className="text-sm text-textDim">{t('not assigned')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-baseline gap-2">
                  <button
                    onClick={() => navigate(`/connected/${a.studentId}/plan/${a.id}`)}
                    className="min-w-0 flex-1 truncate text-left text-text hover:text-accent"
                  >
                    {a.studentName}
                  </button>
                  <span className="shrink-0 text-xs text-textDim">
                    {fill(t('{n} of {total} done'), { n: a.doneCount, total: stats.sessions })}
                  </span>
                </li>
              ))}
              {localAthlete && (
                <li className="text-text">
                  {localAthlete} <span className="text-xs text-textDim">({t('not connected')})</span>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <p className={label}>{t('Last edited')}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-textDim">{edited}</div>
          {conflict && (
            <p className="text-xs text-red">
              {t('Changed on another device at the same time. Open it to choose which version to keep.')}
            </p>
          )}
          {!conflict && pending && online && (
            <p className="text-xs text-amber">{t('Not synced yet: it goes to the library on the next sync.')}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button onClick={() => navigate(`/plan/${sp.id}`)} className="pill pill-on btn-raised px-4 py-1.5 text-sm">
            {conflict ? t('Choose version') : t('Edit')}
          </button>
          {online && !conflict && (
            <AssignToConnectedButton ready={stats.sessions > 0} ensurePublished={ensurePublished} menuBelow />
          )}
          <button onClick={onDuplicate} className="pill px-3 py-1.5 text-sm" title={t('Make a copy to adapt for another athlete or season')}>
            {t('Duplicate')}
          </button>
          <button onClick={onDownload} className="pill px-3 py-1.5 text-sm" title={t('Download the .e08plan file')}>
            ⤓
          </button>
          <button onClick={onDelete} className="ml-auto text-sm text-red hover:underline">
            {t('Delete')}
          </button>
        </div>
      </aside>
    </>
  );
}
