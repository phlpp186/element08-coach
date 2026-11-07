/** Dev-only harness for the "on the app" block of a notebook athlete: every
 *  state stacked, driven in memory (no Supabase). Not routed in a build. */
import { useState } from 'react';
import { AppConnectionBody } from '../components/AppConnectionCard';
import { emptyAthlete, type Athlete } from '../lib/types';
import type { ConnectedAthlete } from '../lib/supabase/useRoster';

const lena: ConnectedAthlete = { linkId: 'l1', studentId: 's1', name: 'Lena Fischer', planCount: 2, doneCount: 14 };
const marco: ConnectedAthlete = { linkId: 'l2', studentId: 's2', name: 'Marco', planCount: 1, doneCount: 3 };
const make = (name: string, extra: Partial<Athlete> = {}): Athlete => ({
  ...emptyAthlete(name, '2026-11-01T00:00:00Z'),
  name,
  ...extra,
});
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function Case({ title, start, isCoach = true }: { title: string; start: Athlete; isCoach?: boolean }) {
  const [a, setA] = useState(start);
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-widest text-textDim">{title}</div>
      <AppConnectionBody
        athlete={a}
        isCoach={isCoach}
        connected={[lena, marco]}
        loading={false}
        linkable={[marco]}
        actions={{
          invite: async () => setA((x) => ({ ...x, invite: { code: 'K7Q2M9XA', createdAt: new Date().toISOString() } })),
          link: (studentId) => setA((x) => ({ ...x, studentId, invite: undefined })),
          unlink: () => setA((x) => ({ ...x, studentId: undefined })),
        }}
      />
    </div>
  );
}

export function ConnectionPreview() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-6">
      <Case title="Not a coach (free)" start={make('Anna')} isCoach={false} />
      <Case title="Coach, new athlete" start={make('Tom')} />
      <Case title="Invite pending" start={make('Sofia', { invite: { code: 'K7Q2M9XA', createdAt: daysAgo(2) } })} />
      <Case title="Invite expired" start={make('Ana', { invite: { code: 'ZZ9P4KLM', createdAt: daysAgo(20) } })} />
      <Case title="Linked" start={make('Lena', { studentId: 's1' })} />
      <Case title="Linked, no longer connected" start={make('Jonas', { studentId: 's9' })} />
    </main>
  );
}
