/**
 * CoachOverview — the "Overview" tab: a Gantt-style swimlane of every active
 * student plan, so a coach with many athletes sees at a glance where each one is
 * and when their plan finishes. Data + auth live here; the timeline rendering is
 * the pure CoachTimeline component. Coach-only; live via the roster's Realtime.
 */
import { useAuth } from '../lib/supabase/AuthProvider';
import { useCoachOverview } from '../lib/supabase/useCoachOverview';
import { CoachTimeline } from '../components/CoachTimeline';
import { useT } from '../i18n';

export function CoachOverview() {
  const t = useT();
  const { session, isCoach, loading: authLoading } = useAuth();
  const { rows, loading, error, todayIso } = useCoachOverview();

  if (authLoading) return null;
  if (!session || !isCoach) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-6">
        <p className="text-textDim text-sm rounded-xl border border-dashed border-border p-4">
          {t('Sign in as a coach to see your athletes’ plan timeline.')}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-5">
      <div>
        <h2 className="text-lg">{t('Plan overview')}</h2>
        <p className="text-textDim text-sm">
          {t('Every active plan on one timeline: how far each athlete is and when they finish.')}
        </p>
      </div>

      {error && <p className="text-xs text-red">{error}</p>}

      {loading && rows.length === 0 ? (
        <p className="text-textDim text-sm">{t('Loading…')}</p>
      ) : rows.length === 0 ? (
        <p className="text-textDim text-sm rounded-xl border border-dashed border-border p-4">
          {t('No active plans yet. Assign a plan to a connected athlete to see it here.')}
        </p>
      ) : (
        <CoachTimeline rows={rows} todayIso={todayIso} />
      )}
    </main>
  );
}
