/** Dev-only harness: the Activity page from fixture rows, run through the real
 *  lib/activity rules, so the feed and panels can be checked without a login. */
import { ActivityBody } from '../views/ActivityView';
import { needsALook, remarkedThisWeek, thisWeekSummary, toFeedEntries, type FeedRow } from '../lib/activity';
import { sessionNoteLines } from '../lib/sessionNotes';
import { addDays, mondayOf, todayIso } from '../lib/e08plan';
import { useSeenState } from '../lib/completionsSeen';

const today = todayIso();
const mon = mondayOf(today);
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const plan = {
  startDate: addDays(mon, -21),
  phases: [
    {
      weeks: [0, 1, 2, 3].map((w) => ({
        weekStart: addDays(mon, (w - 3) * 7),
        plannedSessions: [
          { id: `d${w}`, dayOfWeek: 1, label: 'Depth: FIM warm-up + 2 deep' },
          { id: `p${w}`, dayOfWeek: 3, label: 'Pool DYN 4x50' },
          { id: `s${w}`, dayOfWeek: 5, label: 'CO2 table' },
        ],
      })),
    },
  ],
};
const assignments = [
  { id: 'a1', planId: 'p1', planTitle: 'Autumn depth block', studentId: 's1', studentName: 'Lena', assignedAt: ago(24 * 30) },
  { id: 'a2', planId: 'p1', planTitle: 'Autumn depth block', studentId: 's2', studentName: 'Marco', assignedAt: ago(24 * 30) },
];
const rows: FeedRow[] = [
  {
    id: 'c1', assignment_id: 'a1', exercise_id: 'd3', completed_at: ago(2), updated_at: ago(2), rating: 7,
    remarks: 'Felt strong, the second dive was easy.',
    session: { mode: 'depth', maxDepth: 42, dives: [{ depth: 30, discipline: 'FIM' }, { depth: 38, discipline: 'FIM', remarks: 'Squeeze feeling at 35 m' }, { depth: 42, discipline: 'FIM', remarks: 'Clean' }, { depth: 20, discipline: 'CWT', remarks: 'Fun dive' }, { depth: 10, discipline: 'CWT', remarks: 'Hang' }] },
  },
  { id: 'c2', assignment_id: 'a2', exercise_id: 'p3', completed_at: ago(26), updated_at: ago(26), rating: 8, remarks: null,
    session: { mode: 'pool', dives: [{ discipline: 'DYN', distance: 50 }, { discipline: 'DYN', distance: 50 }, { discipline: 'DYN', distance: 75 }, { discipline: 'DYN', distance: 50 }] } },
  {
    id: 'c3', assignment_id: 'a1', exercise_id: 's2', completed_at: ago(24 * 5), updated_at: ago(5), rating: 6, remarks: null,
    session: { mode: 'dry', blockTimeline: [{ type: 'Rest', seconds: 120 }, { type: 'Hold', seconds: 150, note: 'Contractions from 1:40' }, { type: 'Hold', seconds: 212 }] },
  },
  {
    id: 'c4', assignment_id: 'a1', exercise_id: 'p2', completed_at: ago(24 * 6), updated_at: ago(24 * 6), rating: 5, remarks: 'Tired legs',
    session: { mode: 'pool', dives: [{ discipline: 'DYN', distance: 100 }, { discipline: 'DNF', distance: 75, remarks: 'Cramp at 60' }] },
  },
  { id: 'c5', assignment_id: 'a1', exercise_id: 'd2', completed_at: ago(24 * 8), updated_at: ago(24 * 8), rating: 4, remarks: null },
];

const defs = new Map<string, unknown>([['p1', plan]]);
const feed = toFeedEntries(rows, new Map(assignments.map((a) => [a.id, a])), defs);
const inputs = assignments.map((a) => ({ id: a.id, studentId: a.studentId, assignedAt: a.assignedAt, plan }));
const athletes = [
  { studentId: 's1', name: 'Lena' },
  { studentId: 's2', name: 'Marco' },
  { studentId: 's3', name: 'Sofia' },
];

const pbsByStudent = new Map([
  ['s1', [{ discipline: 'FIM', unit: 'm' as const, value: 42 }, { discipline: 'DYN', unit: 'm' as const, value: 125 }]],
  ['s2', [{ discipline: 'DYN', unit: 'm' as const, value: 75 }]],
]);

export function ActivityPreview() {
  const seen = useSeenState();
  return (
    <ActivityBody
      feed={feed}
      flags={needsALook({ athletes, assignments: inputs, completions: rows, todayIso: today, nowMs: Date.now() })}
      week={thisWeekSummary({ assignments: inputs, completions: rows, todayIso: today })}
      remarked={remarkedThisWeek(feed.map((e) => ({ at: e.at, hasRemark: !!e.remarks || sessionNoteLines(e.session).length > 0 })), today)}
      today={today}
      athleteCount={athletes.length}
      loading={false}
      error={null}
      seen={{ at: seen.at || ago(10), ids: seen.ids }}
      pbsByStudent={pbsByStudent}
    />
  );
}
