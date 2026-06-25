import { navigate, useRoute } from './hooks/useHashRoute';
import { AthletesView } from './views/AthletesView';
import { AthleteDetailView } from './views/AthleteDetailView';
import { ConnectedAthleteView } from './views/ConnectedAthleteView';
import { PlanBuilderView } from './views/PlanBuilderView';
import { AuthBar } from './components/AuthBar';

const NAV: { id: string; label: string; to: string }[] = [
  { id: 'athletes', label: 'Athletes', to: '/athletes' },
  { id: 'plan', label: 'Plan builder', to: '/plan/new' },
];

export function App() {
  const route = useRoute();
  const top = route.segments[0] ?? 'athletes';

  return (
    <div className="min-h-screen pb-28">
      <header className="border-b border-border px-5 py-4">
        {/* pr clears the fixed theme toggle (right-4 + w-9) at narrow widths. */}
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4 pr-12 sm:pr-14">
          <button onClick={() => navigate('/athletes')} className="text-left">
            <h1 className="text-2xl font-heading tracking-wider">
              E<span className="text-red">|</span>08{' '}
              <span className="text-textDim font-body text-base align-middle">Coach</span>
            </h1>
          </button>
          <div className="flex items-center gap-4">
            <nav className="flex rounded-lg border border-border overflow-hidden">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigate(n.to)}
                  className={`px-4 py-1.5 text-sm ${top === n.id ? 'glow-accent bg-accent text-ink' : 'text-textDim hover:text-text'}`}
                >
                  {n.label}
                </button>
              ))}
            </nav>
            <AuthBar />
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  );
}

function Outlet() {
  const route = useRoute();
  const [top, second] = route.segments;

  if (top === 'plan') {
    // /plan/new?athlete=ID  → fresh plan (optionally for an athlete)
    // /plan/:planId         → edit a saved plan
    const isNew = !second || second === 'new';
    const planId = isNew ? null : second;
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
    return <ConnectedAthleteView key={second} studentId={second} />;
  }

  if (top === 'athletes' && second) {
    return <AthleteDetailView key={second} athleteId={second} />;
  }

  return <AthletesView />;
}
