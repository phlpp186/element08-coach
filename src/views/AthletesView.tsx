import { useRef } from 'react';
import {
  createAthlete,
  exportRoster,
  importRoster,
  useAthletes,
  useSavedPlans,
} from '../lib/store';
import { compColorClass, headlinePBs, nextCompetition, relativeDays } from '../lib/athleteStats';
import { groupStyle } from '../lib/disciplines';
import { navigate } from '../hooks/useHashRoute';
import type { Athlete } from '../lib/types';
import { ConnectedAthletes } from '../components/ConnectedAthletes';
import { CloudBackup } from '../components/CloudBackup';
import { InfoTip } from '../components/InfoTip';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useT } from '../i18n';

export function AthletesView() {
  const t = useT();
  const athletes = useAthletes();
  const plans = useSavedPlans();
  const { session, isCoach } = useAuth();
  const showLocalHeading = !!session && isCoach;
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (athletes.length && !confirm(t('Importing replaces your current roster. Continue?'))) return;
    try {
      const { athletes: a, plans: p } = await importRoster(file);
      alert(`${t('Imported')} ${a} ${a === 1 ? t('athlete') : t('athletes')} ${t('and')} ${p} ${p === 1 ? t('plan') : t('plans')}.`);
    } catch {
      alert(t('Could not read that file. Use an ELEMENT | 08 roster (.e08coach) export.'));
    }
  };

  const addAthlete = () => {
    const a = createAthlete();
    navigate(`/athletes/${a.id}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg">{t('Athletes')}</h2>
          <p className="text-textDim text-sm">{t('Your roster lives in this browser. Export it to back up or move devices.')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".e08coach,application/json" onChange={onImport} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            {t('Import')}
          </button>
          {athletes.length > 0 && (
            <button
              onClick={exportRoster}
              className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
            >
              {t('Export')}
            </button>
          )}
          <InfoTip
            text={t('Your roster lives only in this browser. Export saves it (athletes, notes, saved plans) to an .e08coach file; Import restores that file on another browser or device. Use it to back up or move your data.')}
          />
          <button onClick={addAthlete} className="glow-accent text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide">
            + {t('Add athlete')}
          </button>
        </div>
      </div>

      <ConnectedAthletes />

      <CloudBackup />

      {showLocalHeading && (
        <div className="pt-2">
          <h3 className="font-heading tracking-wide text-text">{t('YOUR NOTES')}</h3>
          <p className="text-textDim text-xs">{t('Local to this browser, for prospects or athletes not on the app.')}</p>
        </div>
      )}

      {athletes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
          <p className="mb-3">{t('No athletes yet.')}</p>
          <button onClick={addAthlete} className="text-accent hover:underline">
            {t('Add your first athlete')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {athletes.map((a) => (
            <AthleteCard key={a.id} athlete={a} planCount={plans.filter((p) => p.athleteId === a.id).length} />
          ))}
        </div>
      )}
    </main>
  );
}

function AthleteCard({ athlete, planCount }: { athlete: Athlete; planCount: number }) {
  const t = useT();
  const pbs = headlinePBs(athlete, 3);
  const comp = nextCompetition(athlete);
  return (
    <button
      onClick={() => navigate(`/athletes/${athlete.id}`)}
      className="text-left glass-card rounded-xl p-4 space-y-3 hover:border-accent"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-heading">
          {(athlete.name.trim()[0] ?? '?').toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-text truncate">{athlete.name.trim() || t('Unnamed athlete')}</div>
          {athlete.location && <div className="text-xs text-textDim truncate">{athlete.location}</div>}
        </div>
      </div>

      {pbs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pbs.map((p) => {
            const g = groupStyle(p.discipline.group);
            return (
              <span key={p.discipline.id} className={`rounded-md border px-2 py-0.5 text-xs ${g.chip}`}>
                <span className={`font-medium ${g.label}`}>{p.discipline.label}</span>{' '}
                <span className="text-text">{p.text}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-textDim">
        <span>{planCount} {planCount === 1 ? t('plan') : t('plans')}</span>
        {comp ? (
          <span className={compColorClass(comp.date)}>
            {comp.name || t('Comp')} {relativeDays(comp.date)}
          </span>
        ) : (
          <span>{t('No upcoming comp')}</span>
        )}
      </div>
    </button>
  );
}
