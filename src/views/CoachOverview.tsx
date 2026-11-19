/**
 * CoachOverview — the "Overview" tab: four summary tiles over one lane per
 * athlete with every session as a dot, some weeks back and some ahead, so a
 * coach sees who trained when, how hard it felt, where the reports thin out
 * and whose plan runs out. Data + auth live here; OverviewBody is the pure
 * rendering (also used by the dev harness). Coach-only; live via the roster's
 * Realtime.
 */
import { useAuth } from '../lib/supabase/AuthProvider';
import { useCoachOverview, type OverviewAthlete, type OverviewRow } from '../lib/supabase/useCoachOverview';
import { OverviewTiles, SessionDots } from '../components/CoachTimeline';
import { useT } from '../i18n';

export function CoachOverview() {
  const t = useT();
  const { session, isCoach, loading: authLoading } = useAuth();
  const { rows, athletes, loading, error, todayIso } = useCoachOverview();

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

  return <OverviewBody rows={rows} athletes={athletes} todayIso={todayIso} loading={loading} error={error} />;
}

export function OverviewBody({
  rows,
  athletes,
  todayIso,
  loading,
  error,
}: {
  rows: OverviewRow[];
  athletes: OverviewAthlete[];
  todayIso: string;
  loading: boolean;
  error: string | null;
}) {
  const t = useT();
  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-5">
      <div>
        <h2 className="text-lg">{t('Plan overview')}</h2>
        <p className="text-textDim text-sm">
          {t('Every athlete on one timeline: each session a dot, the past weeks and what is planned next.')}
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
        <>
          <OverviewTiles rows={rows} />
          <SessionDots athletes={athletes} todayIso={todayIso} />
        </>
      )}
    </main>
  );
}
