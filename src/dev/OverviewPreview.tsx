/** Dev-only harness: the Overview from fixture plans and completions, run
 *  through the real lib/overviewWeeks + effortRising rules, so the timeline can
 *  be checked without a login. */
import { OverviewBody } from '../views/CoachOverview';
import type { OverviewRow } from '../lib/supabase/useCoachOverview';
import { effortRising } from '../lib/activity';
import { recentDone, weekBlocks } from '../lib/overviewWeeks';
import { addDays, mondayOf, todayIso } from '../lib/e08plan';
import { daysUntil, planEndStatus } from '../lib/athleteStats';

const today = todayIso();
const mon = mondayOf(today);

/** A plan of `weeks` weeks starting `fromWeek` weeks from this Monday, three
 *  sessions a week except the listed rest weeks. */
function plan(fromWeek: number, weeks: number, rest: number[] = []) {
  return {
    startDate: addDays(mon, fromWeek * 7),
    phases: [
      {
        weeks: Array.from({ length: weeks }, (_, w) => ({
          weekStart: addDays(mon, (fromWeek + w) * 7),
          plannedSessions: rest.includes(w + 1)
            ? []
            : [1, 3, 5].map((d) => ({ id: `w${w + 1}d${d}`, dayOfWeek: d })),
        })),
      },
    ],
  };
}

/** Done session ids: `perWeek[i]` of week i+1's sessions. */
const doneOf = (perWeek: number[]) =>
  new Set(perWeek.flatMap((n, w) => [1, 3, 5].slice(0, n).map((d) => `w${w + 1}d${d}`)));

const fixtures: { name: string; title: string; def: ReturnType<typeof plan>; done: number[]; ratings: number[] }[] = [
  { name: 'Lena', title: 'Autumn depth block', def: plan(-5, 6), done: [3, 3, 2, 3, 3, 1], ratings: [5, 6, 5, 5, 6, 7] },
  { name: 'Marco', title: 'Pool DYN build', def: plan(-6, 10, [4]), done: [3, 2, 3, 0, 1, 0, 1], ratings: [4, 4, 5, 6, 7, 8] },
  { name: 'Sofia', title: 'Competition taper', def: plan(-2, 4), done: [3, 3, 1], ratings: [6, 5, 6] },
  { name: 'Jonas', title: 'Static base', def: plan(-8, 7), done: [2, 3, 3, 3, 2, 3, 3], ratings: [] },
  { name: 'Ana', title: 'Spring depth', def: plan(2, 8), done: [], ratings: [] },
];

const rows: OverviewRow[] = fixtures.map((f, i) => {
  const done = doneOf(f.done);
  const weeks = f.def.phases[0].weeks;
  const end = addDays(weeks[weeks.length - 1].weekStart, 6);
  return {
    assignmentId: `a${i}`,
    studentId: `s${i}`,
    studentName: f.name,
    planTitle: f.title,
    start: f.def.startDate,
    end,
    doneCount: done.size,
    totalSessions: weeks.reduce((n, w) => n + w.plannedSessions.length, 0),
    status: planEndStatus(end),
    daysLeft: daysUntil(end),
    weeks: weekBlocks(f.def, done, today),
    recent: recentDone(f.def, done, today),
    ratings: f.ratings.slice(-6),
    rising: effortRising(f.ratings),
  };
});
rows.sort((x, y) => x.end!.localeCompare(y.end!));

export function OverviewPreview() {
  return <OverviewBody rows={rows} todayIso={today} loading={false} error={null} />;
}
