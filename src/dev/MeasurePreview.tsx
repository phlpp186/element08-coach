/** Dev-only harness: a synthetic 75 m FIM dive through the real depth tracks,
 *  so Measure A→B can be checked without a Supabase login and a coached
 *  athlete's attached session. Reached at ?preview=measure. Not routed. */
import { DepthDiveTracks } from '../components/charts/DepthDiveTracks';
import { extractDiveData } from '../lib/analytics/diveProfile';

// 1.2 m/s down to 75 m, 6 s hang, 1.0 m/s up, with HR falling through the
// descent and a plausible speed channel beside it.
const profile: { t: number; d: number; v: number; hr: number }[] = [];
{
  let t = 0;
  for (; t <= 62; t++) profile.push({ t, d: +(t * 1.21).toFixed(1), v: -1.21, hr: 78 - t * 0.35 });
  for (let k = 1; k <= 6; k++, t++) profile.push({ t, d: 75.0, v: 0, hr: 56 });
  for (let k = 1; k <= 75; k++, t++)
    profile.push({ t, d: +(75 - k * 1.0).toFixed(1), v: 1.0, hr: 56 + k * 0.25 });
}

const data = extractDiveData({
  profile: profile as never,
  diveTime: profile[profile.length - 1].t,
  depth: 75,
  descentTime: 62,
  hangTime: 6,
  ascentTime: 75,
} as never);

export function MeasurePreview() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-4 font-heading text-lg text-text">
        Measure A→B — press the pill, then drag across the profile
      </h2>
      <DepthDiveTracks
        data={data}
        contractionOnset={null}
        showAlarms={false}
        speedStep={0}
        speedSmooth={0}
        groupId="prev-measure"
      />
    </div>
  );
}
