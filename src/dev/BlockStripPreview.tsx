/** Dev-only harness: renders the dry block strip with the coachee's session
 *  numbers so the layout can be checked without a Supabase login. Not routed. */
import { DrySessionTracks } from '../components/charts/DrySessionTracks';

// "Comfy Holds", 4 cycles, 24m35s — Rest/Hold pairs as reported.
const blocks = [
  { type: 'Rest' as const, startT: 0, endT: 180 },
  { type: 'Hold' as const, startT: 180, endT: 349 },
  { type: 'Rest' as const, startT: 349, endT: 529 },
  { type: 'Hold' as const, startT: 529, endT: 712 },
  { type: 'Rest' as const, startT: 712, endT: 892 },
  { type: 'Hold' as const, startT: 892, endT: 1083 },
  { type: 'Rest' as const, startT: 1083, endT: 1263 },
  { type: 'Hold' as const, startT: 1263, endT: 1475 },
];

export function BlockStripPreview() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <DrySessionTracks
        data={{
          spo2Series: [],
          hrSeries: [],
          blocks,
          contractions: [],
          startT: 0,
          endT: 1475,
          hasOxy: false,
        }}
        groupId="preview"
      />
    </div>
  );
}
