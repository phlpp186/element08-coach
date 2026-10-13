/** Dev-only harness: an attached depth, pool and dry session carrying per-dive
 *  remarks and per-hold notes, to check how they read without a login. */
import { AttachedSessionDetail } from '../components/AttachedSessionDetail';

const depth = {
  mode: 'depth',
  date: '2026-10-12T09:30:00.000Z',
  maxDepth: 42,
  discipline: 'CWT',
  remarks: 'Calm day, good visibility.',
  dives: [
    { depth: 30, diveTime: 95, descentTime: 40, hangTime: 5, ascentTime: 50, discipline: 'CWT' },
    { depth: 38, diveTime: 112, descentTime: 50, hangTime: 4, ascentTime: 58, discipline: 'CWT', remarks: 'Squeeze feeling at 35 m, stopped mouthfill early.' },
    { depth: 42, diveTime: 121, descentTime: 55, hangTime: 3, ascentTime: 63, discipline: 'CWT', remarks: 'Clean' },
  ],
};
const pool = {
  mode: 'pool',
  totalDistance: 250,
  poolLengthM: 25,
  dives: [
    { discipline: 'DYN', distance: 100, diveTime: 85, turns: 3, si: 180 },
    { discipline: 'DNF', distance: 75, diveTime: 80, turns: 2, si: 240, remarks: 'Legs burning after the second turn, very long remark to check wrapping on a narrow phone screen without overflowing.' },
  ],
};
const dry = {
  mode: 'dry',
  dryActivity: null,
  cyclesCount: 3,
  blockTimeline: [
    { type: 'Rest', seconds: 120 },
    { type: 'Hold', seconds: 150, note: 'Contractions from 1:40, relaxed.' },
    { type: 'Rest', seconds: 120 },
    { type: 'Hold', seconds: 185 },
    { type: 'Rest', seconds: 120 },
    { type: 'Hold', seconds: 212, note: 'Max. Tingling at the end.' },
  ],
};

export function AttachedNotesPreview() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <AttachedSessionDetail blob={depth as never} />
      <AttachedSessionDetail blob={pool as never} />
      <AttachedSessionDetail blob={dry as never} />
    </div>
  );
}
