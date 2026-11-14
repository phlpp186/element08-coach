/** Dev-only harness (?preview=cycle): the cycle strip + calendar inside a copy
 *  of the connected athlete page's layout, with invented data, so the design
 *  can be judged in every theme without a Supabase login. Not routed. */
import { CycleCard } from '../components/CycleCard';
import type { CycleDay, CycleSession } from '../lib/cycleView';
import { ThemeToggle } from '../components/ThemeToggle';

const day = (date: string, p: Partial<CycleDay>): CycleDay => ({
  date,
  period: false,
  symptoms: [],
  note: null,
  felt: null,
  ...p,
});

const days: CycleDay[] = [
  day('2026-10-14', { period: true, symptoms: ['cramps'] }),
  day('2026-10-15', { period: true, symptoms: ['cramps', 'lowEnergy'] }),
  day('2026-10-16', { period: true }),
  day('2026-10-17', { period: true, felt: 0 }),
  day('2026-10-18', { period: true }),
  day('2026-10-24', { felt: -1 }),
  day('2026-10-27', { felt: -1 }),
  day('2026-11-08', { symptoms: ['bloating'] }),
  day('2026-11-09', { symptoms: ['bloating', 'lowEnergy'], felt: 1 }),
  day('2026-11-10', { period: true, symptoms: ['cramps'] }),
  day('2026-11-11', { period: true, symptoms: ['headache'], felt: 2 }),
  day('2026-11-12', { period: true }),
  day('2026-11-13', { period: true }),
];

const sessions: CycleSession[] = [
  { date: '2026-10-13', label: 'CO2 table', effort: 6, count: 1 },
  { date: '2026-10-17', label: 'STA', effort: 5, count: 1 },
  { date: '2026-10-20', label: 'DYN pool', effort: 7, count: 1 },
  { date: '2026-10-24', label: 'STA', effort: 6, count: 1 },
  { date: '2026-10-27', label: 'CWT depth', effort: 8, count: 1 },
  { date: '2026-10-31', label: 'O2 table', effort: 7, count: 1 },
  { date: '2026-11-03', label: 'DYN pool', effort: 6, count: 1 },
  { date: '2026-11-09', label: 'STA', effort: 8, count: 1 },
  { date: '2026-11-11', label: 'CO2 table', effort: 7, count: 1 },
];

const PBS = [
  ['STA', '5:12'],
  ['DYN', '112 m'],
  ['CWT', '38 m'],
];

export function CyclePreview() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-textDim">← Athletes</span>
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 font-heading text-lg text-accent">
          A
        </span>
        <div>
          <h2 className="text-xl text-text">Anna K.</h2>
          <p className="text-xs text-accent">✓ connected · synced with the app</p>
        </div>
        <span className="pill ml-auto px-3 py-1.5 text-sm">Disconnect athlete</span>
      </div>

      <section className="space-y-2">
        <h3 className="font-heading tracking-wide text-text">PERSONAL BESTS</h3>
        <div className="flex flex-wrap gap-2">
          {PBS.map(([d, v]) => (
            <span key={d} className="rounded-lg border border-border px-3 py-1.5 text-center">
              <span className="block text-xs tracking-wide text-textDim">{d}</span>
              <span className="block font-heading text-text">{v}</span>
            </span>
          ))}
        </div>
      </section>

      <CycleCard name="Anna" days={days} sessions={sessions} today="2026-11-14" />

      <section className="space-y-2">
        <h3 className="font-heading tracking-wide text-text">ASSIGNED PLANS</h3>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel p-3">
          <span className="truncate text-text">Winter base, block 2</span>
          <span className="text-xs text-textDim">9 sessions done ›</span>
        </div>
      </section>
    </main>
  );
}
