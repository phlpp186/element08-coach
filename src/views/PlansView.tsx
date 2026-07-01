/**
 * PlansView — the "Plan builder" tab landing: every plan you've Saved in this
 * browser, so a saved draft (even one not linked to an athlete) is findable and
 * re-openable. Save keeps a draft here; Assign / Download delivers it. New plans
 * and editing an existing one open the builder at /plan/new and /plan/:id.
 */
import { deletePlan, useAthletes, useSavedPlans } from '../lib/store';
import { downloadPlanFile } from '../lib/e08plan';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';

export function PlansView() {
  const t = useT();
  const plans = useSavedPlans();
  const athletes = useAthletes();
  const nameFor = (id: string | null) =>
    (id && athletes.find((a) => a.id === id)?.name?.trim()) || null;

  const sorted = [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg">{t('Plans')}</h2>
          <p className="text-textDim text-sm">
            {t('Draft plans saved in this browser. Save keeps a draft here; Assign or Download delivers it to an athlete.')}
          </p>
        </div>
        <button
          onClick={() => navigate('/plan/new')}
          className="glow-accent text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide"
        >
          + {t('New plan')}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
          <p className="mb-3">{t('No saved plans yet.')}</p>
          <button onClick={() => navigate('/plan/new')} className="text-accent hover:underline">
            {t('Build your first plan')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((sp) => {
            const who = nameFor(sp.athleteId);
            return (
              <div key={sp.id} className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
                <button
                  onClick={() => navigate(`/plan/${sp.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-text">{sp.plan.name?.trim() || t('Untitled plan')}</div>
                  <div className="truncate text-xs text-textDim">
                    {sp.plan.kind === 'season' ? t('Season') : t('Training')}
                    {' · '}
                    {who ? who : <span className="text-textDim/70">{t('Not linked')}</span>}
                    {sp.updatedAt ? ` · ${t('updated')} ${sp.updatedAt.slice(0, 10)}` : ''}
                  </div>
                </button>
                <button
                  onClick={() => navigate(`/plan/${sp.id}`)}
                  className="shrink-0 text-sm text-accent hover:underline"
                >
                  {t('Edit')}
                </button>
                <button
                  onClick={() => downloadPlanFile(sp.plan)}
                  className="shrink-0 text-sm text-textDim hover:text-accent"
                >
                  {t('Download')}
                </button>
                <button
                  onClick={() => confirm(t('Delete this saved plan?')) && deletePlan(sp.id)}
                  className="shrink-0 text-red text-sm"
                  title={t('Delete plan')}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
