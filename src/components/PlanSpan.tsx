/**
 * PlanSpan — shows the date range a plan covers (start to end) plus a coaching
 * status hint: an amber "ending soon" when it wraps up within 2 weeks, or a dim
 * "ended" once it's past, so a coach can see who needs a fresh or updated plan.
 */
import type { BuilderPlan } from '../lib/e08plan';
import { planEndStatus, planSpan, relativeDays } from '../lib/athleteStats';
import { useT } from '../i18n';

const FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fmt = (iso: string) => FMT.format(new Date(`${iso}T00:00:00Z`));

export function PlanSpan({ plan }: { plan: BuilderPlan }) {
  const t = useT();
  const { start, end } = planSpan(plan);
  if (!start || !end) return null;
  const status = planEndStatus(end);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span>
        {fmt(start)} – {fmt(end)}
      </span>
      {status === 'endingSoon' && (
        <span className="text-amber">· {t('ends')} {relativeDays(end)}</span>
      )}
      {status === 'ended' && <span className="text-textDim">· {t('ended')}</span>}
    </span>
  );
}
