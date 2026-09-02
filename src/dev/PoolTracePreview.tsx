/** Dev-only harness: renders the pool motion trace against a synthetic DNF so
 *  the stacked channels, the full-height marks and the shaded window padding
 *  can be checked without a Supabase login and a real athlete's dive.
 *  Reached at ?preview=pooltrace. Not routed. */
import { PoolSignalTracks } from '../components/charts/PoolSignalTracks';
import { extractPoolTraceData } from '../lib/analytics/poolTrace';

// A 50 m DNF in a 25 m pool: 5 Hz, ~62 s of window, one turn at 30 s, arm
// strokes about every 2.6 s, and 2 s of padding at each end of the button
// bracket — the loose bracket a watch actually produces.
const HZ = 5;
const N = 62 * HZ;
const TURN_T = 30;
const START_T = 2;
const END_T = 58;

const strokeTimes: number[] = [];
for (let t = START_T + 1.5; t < END_T; t += 2.6) strokeTimes.push(+t.toFixed(1));

const accel: number[] = [];
const gyro: number[] = [];
const heading: number[] = [];
for (let i = 0; i < N; i++) {
  const t = i / HZ;
  const inDive = t >= START_T && t <= END_T;
  // Baseline gravity, plus a bump on each stroke and a big one on the push-off.
  let a = 1 + (inDive ? 0.05 * Math.sin(t * 3) : 0.01);
  let g = inDive ? 12 + 6 * Math.sin(t * 2.4) : 3;
  for (const s of strokeTimes) {
    const d = t - s;
    if (Math.abs(d) < 0.5) {
      a += 0.55 * Math.exp(-(d * d) / 0.02);
      g += 45 * Math.exp(-(d * d) / 0.03);
    }
  }
  const dTurn = t - TURN_T;
  if (Math.abs(dTurn) < 1.6) {
    a += 1.1 * Math.exp(-(dTurn * dTurn) / 0.25);
    g += 190 * Math.exp(-(dTurn * dTurn) / 0.3);
  }
  // Heading steps 180 deg through the turn, and drifts slowly either side —
  // this channel is integrated gyro on a BLE import, so the slope is real.
  const step = 180 / (1 + Math.exp(-(t - TURN_T) * 4));
  heading.push(+(step + t * 0.35).toFixed(2));
  accel.push(+a.toFixed(3));
  gyro.push(+g.toFixed(2));
}

const trace = {
  accel,
  gyro,
  heading,
  turns: [TURN_T - 0.6],
  strokes: strokeTimes,
  hz: HZ,
};

const detected = extractPoolTraceData({ trace })!;
const confirmed = extractPoolTraceData({
  trace,
  traceEdits: {
    startT: START_T,
    endT: END_T,
    turns: [TURN_T],
    strokes: strokeTimes,
    kicks: [],
  },
})!;

export function PoolTracePreview() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 p-6">
      <div>
        <h2 className="mb-3 font-heading text-lg text-text">Uncorrected (detector's proposal)</h2>
        <div className="rounded-lg border border-border bg-deep p-3">
          <PoolSignalTracks data={detected} groupId="prev-sig-a" />
        </div>
      </div>
      <div>
        <h2 className="mb-3 font-heading text-lg text-text">Diver-confirmed, window trimmed</h2>
        <div className="rounded-lg border border-border bg-deep p-3">
          <PoolSignalTracks data={confirmed} groupId="prev-sig-b" />
        </div>
      </div>
    </div>
  );
}
