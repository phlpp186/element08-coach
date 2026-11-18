/** Dev-only harness: the plan view's session card in its three states (open,
 *  reported not done, done), to check the "not done" overlay without a login. */
import { SessionRow } from '../views/ConnectedPlanView';

const base = { assignment_id: 'a1', rating: null, remarks: null, session: null, updated_at: '2026-11-18T10:00:00Z' };
const t = (s: string) => s;

export function NotDonePreview() {
  return (
    <main className="mx-auto max-w-xl space-y-2 p-4">
      <SessionRow
        session={{ id: 's0', dayOfWeek: 0, label: 'O2 table, 8 rounds' }}
        completion={null}
        notDone={{ ...base, id: 'c0', exercise_id: 's0', completed_at: null, not_done_at: '2026-11-18T10:00:00Z', skip_reason: 'tired' }}
        focused={false}
        t={t}
      />
      <SessionRow
        session={{ id: 's1', dayOfWeek: 2, label: 'CO2 table + 6 x 50 DYN', coachTarget: 7 }}
        completion={null}
        notDone={{
          ...base,
          id: 'c1',
          exercise_id: 's1',
          completed_at: null,
          not_done_at: '2026-11-18T10:00:00Z',
          skip_reason: 'sick',
          remarks: 'Head cold since Monday, ears will not clear.',
        }}
        focused={false}
        t={t}
      />
      <SessionRow
        session={{ id: 's2', dayOfWeek: 3, label: 'Strength A' }}
        completion={{ ...base, id: 'c2', exercise_id: 's2', completed_at: '2026-11-17T18:00:00Z', rating: 6 }}
        notDone={null}
        focused={false}
        t={t}
      />
      <SessionRow session={{ id: 's3', dayOfWeek: 5, label: 'FIM technique, 6 dives' }} completion={null} notDone={null} focused={false} t={t} />
    </main>
  );
}
