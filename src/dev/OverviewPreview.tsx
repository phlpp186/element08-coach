/** Dev-only harness: the Overview from fixture plans and completions, run
 *  through the real lib/overviewDots + effortRising rules, so the timeline can
 *  be checked without a login. ?preview=overview. Not routed. */
import { OverviewBody } from '../views/CoachOverview';
import type { OverviewAthlete, OverviewRow } from '../lib/supabase/useCoachOverview';
import { effortRising } from '../lib/activity';
import { recentDone } from '../lib/overviewWeeks';
import { athleteDots, dotSummary, type DotCompletion, type DotPlan } from '../lib/overviewDots';
import { addDays, mondayOf, todayIso } from '../lib/e08plan';
import { daysUntil, planEndStatus } from '../lib/athleteStats';

const today = todayIso();
const mon = mondayOf(today);

/** A plan of `weeks` weeks starting `fromWeek` weeks from this Monday, with a
 *  session on each of `days` (0 = Monday). */
function plan(fromWeek: number, weeks: number, days: number[]) {
  return {
    startDate: addDays(mon, fromWeek * 7),
    phases: [
      {
        weeks: Array.from({ length: weeks }, (_, w) => ({
          weekStart: addDays(mon, (fromWeek + w) * 7),
          plannedSessions: days.map((d) => ({ id: `w${fromWeek + w}d${d}`, dayOfWeek: d, label: `Session ${d + 1}` })),
        })),
      },
    ],
  };
}

type Fate = number | 'no' | 'skip' | null;

/** Completions for the plan's past sessions: `fate(week, day)` gives the
 *  effort it was done with, 'no' for a "not done" answer, 'skip' for no
 *  report, null to leave it as planned. `late` moves the done day. */
function reports(def: ReturnType<typeof plan>, fate: (w: number, d: number) => Fate, late = 0): DotCompletion[] {
  const out: DotCompletion[] = [];
  def.phases[0].weeks.forEach((w, wi) =>
    w.plannedSessions.forEach((s) => {
      const day = addDays(w.weekStart, s.dayOfWeek);
      if (day > today) return;
      const f = fate(wi, s.dayOfWeek);
      if (typeof f === 'number')
        out.push({ exercise_id: s.id, completed_at: `${addDays(day, (wi + s.dayOfWeek) % 3 === 0 ? late : 0)}T18:00:00`, rating: f });
      else if (f === 'no') out.push({ exercise_id: s.id, completed_at: null, not_done_at: `${day}T20:00:00` });
    }),
  );
  return out.filter((c) => !c.completed_at || c.completed_at.slice(0, 10) <= today);
}

const mara = plan(-7, 12, [0, 2, 5]);
const jonas = plan(-6, 8, [1, 3, 5]);
const aikoOld = plan(-18, 12, [0, 3]);
const aiko = plan(-6, 14, [0, 1, 3, 5]);
const luca = plan(-4, 5, [2, 5]);

const fixtures: { name: string; plans: DotPlan[] }[] = [
  {
    name: 'Mara',
    plans: [{ title: 'CWT Base', def: mara, active: true, completions: reports(mara, (w, d) => (w === 4 && d === 2 ? 'no' : d === 5 ? 9 : d === 2 ? 7 : 5), 1) }],
  },
  {
    name: 'Jonas',
    plans: [{ title: 'Pool block', def: jonas, active: true, completions: reports(jonas, (w, d) => (w >= 4 ? 'skip' : d === 5 ? 7 : 6)) }],
  },
  {
    name: 'Aiko',
    plans: [
      { title: 'Spring base', def: aikoOld, active: false, completions: reports(aikoOld, (w) => (w < 11 ? 5 : 'skip')) },
      { title: 'Season 2027', def: aiko, active: true, completions: reports(aiko, (_w, d) => (d === 5 ? 9 : d === 3 ? 7 : 6)) },
    ],
  },
  {
    name: 'Luca',
    plans: [{ title: 'Sessions from coach', def: luca, active: true, completions: reports(luca, (w, d) => (w === 3 && d === 2 ? 'no' : 6 + (w > 1 ? 2 : 0))) }],
  },
];

const athletes: OverviewAthlete[] = fixtures.map((f, i) => {
  const dots = athleteDots(f.plans, today);
  return {
    studentId: `s${i}`,
    name: f.name,
    planTitles: f.plans.filter((p) => p.active).map((p) => p.title),
    dots,
    summary: dotSummary(dots, today),
  };
});

const rows: OverviewRow[] = fixtures.flatMap((f, i) =>
  f.plans
    .filter((p) => p.active)
    .map((p) => {
      const def = p.def as ReturnType<typeof plan>;
      const weeks = def.phases[0].weeks;
      const end = addDays(weeks[weeks.length - 1].weekStart, 6);
      const doneRows = p.completions.filter((c) => c.completed_at);
      const done = new Set(doneRows.map((c) => c.exercise_id));
      const ratings = doneRows.map((c) => c.rating as number);
      return {
        assignmentId: `a${i}`,
        studentId: `s${i}`,
        studentName: f.name,
        planTitle: p.title,
        start: def.startDate,
        end,
        doneCount: done.size,
        totalSessions: weeks.reduce((n, w) => n + w.plannedSessions.length, 0),
        status: planEndStatus(end),
        daysLeft: daysUntil(end),
        recent: recentDone(def, done, today),
        ratings: ratings.slice(-6),
        rising: effortRising(ratings),
      };
    }),
);

export function OverviewPreview() {
  return <OverviewBody rows={rows} athletes={athletes} todayIso={today} loading={false} error={null} />;
}
