import { navigate, useRoute } from './hooks/useHashRoute';
import { AthletesView } from './views/AthletesView';
import { AthleteDetailView } from './views/AthleteDetailView';
import { ConnectedAthleteView } from './views/ConnectedAthleteView';
import { ConnectedPlanView } from './views/ConnectedPlanView';
import { PlanBuilderView } from './views/PlanBuilderView';
import { PlansView } from './views/PlansView';
import { ExercisesView } from './views/ExercisesView';
import { AuthBar } from './components/AuthBar';
import { AppFooter } from './components/AppFooter';
import { useT } from './i18n';
import { LanguageSwitcher } from './i18n/LanguageSwitcher';

const NAV: { id: string; label: string; to: string }[] = [
  { id: 'athletes', label: 'Athletes', to: '/athletes' },
  { id: 'exercises', label: 'Exercises', to: '/exercises' },
  { id: 'plan', label: 'Plans', to: '/plan' },
];

export function App() {
  const route = useRoute();
  const top = route.segments[0] ?? 'athletes';
  const t = useT();

  return (
    <div className="min-h-screen pb-28">
      <header className="border-b border-border px-5 py-4">
        {/* pr clears the fixed theme toggle (right-4 + w-9) at narrow widths. */}
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4 pr-12 sm:pr-14">
          <button onClick={() => navigate('/athletes')} className="text-left">
            <h1 className="text-2xl font-heading tracking-wider">
              E<span className="text-red">|</span>08{' '}
              <span className="text-textDim font-body text-base align-middle">{t('Coach')}</span>
            </h1>
          </button>
          <div className="flex items-center gap-3">
            <nav className="flex rounded-lg border border-border overflow-hidden">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigate(n.to)}
                  className={`px-4 py-1.5 text-sm ${top === n.id ? 'glow-accent bg-accent text-ink' : 'text-textDim hover:text-text'}`}
                >
                  {t(n.label)}
                </button>
              ))}
            </nav>
            <LanguageSwitcher />
            <AuthBar />
          </div>
        </div>
      </header>

      <Outlet />
      <AppFooter />
    </div>
  );
}

function Outlet() {
  const route = useRoute();
  const [top, second, third, fourth] = route.segments;

  if (top === 'exercises') {
    return <ExercisesView />;
  }

  if (top === 'plan') {
    // /plan               → the saved-plans list (findable drafts)
    // /plan/new?athlete=ID → fresh plan (optionally for an athlete)
    // /plan/:planId        → edit a saved plan
    if (!second) return <PlansView />;
    const planId = second === 'new' ? null : second;
    const presetAthleteId = route.query.get('athlete');
    return (
      <PlanBuilderView
        key={planId ?? `new:${presetAthleteId ?? ''}`}
        planId={planId}
        presetAthleteId={presetAthleteId}
      />
    );
  }

  // Cloud (paired) athlete — distinct from the local notebook detail below.
  if (top === 'connected' && second) {
    // /connected/:studentId/plan/:assignmentId → one assigned plan + completions
    if (third === 'plan' && fourth) {
      return (
        <ConnectedPlanView
          key={fourth}
          studentId={second}
          assignmentId={fourth}
        />
      );
    }
    return <ConnectedAthleteView key={second} studentId={second} />;
  }

  if (top === 'athletes' && second) {
    return <AthleteDetailView key={second} athleteId={second} />;
  }

  return <AthletesView />;
}
