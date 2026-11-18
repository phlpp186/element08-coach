/** Dev-only harness: the session template editor over the mockup's template
 *  (stretch, a dry table, core) plus one part from an older phone template,
 *  without a Supabase login. ?preview=templateeditor. Not routed. */
import { useState } from "react";
import { TemplateEditor } from "../components/templates/TemplateEditor";
import { blankTemplate, type CoachTemplate } from "../lib/coachTemplates/model";

const seed: CoachTemplate = {
  ...blankTemplate("dry", "Tuesday dry + core"),
  effort: 6,
  notes: "Keep the holds relaxed, stop if dizzy.",
  blocks: [
    {
      id: "a",
      name: "",
      reps: 1,
      exercise: {
        kind: "text",
        text: "Diaphragm stretch · 5 min\nEmpty lung holds · 3 x, easy",
      },
    },
    {
      id: "b",
      name: "",
      reps: 8,
      exercise: {
        kind: "dry",
        rows: [
          { type: "Rest", seconds: 90 },
          { type: "Hold", seconds: 120 },
        ],
        holdTarget: null,
        lungVol: null,
      },
    },
    {
      id: "c",
      name: "",
      reps: 3,
      exercise: {
        kind: "program",
        items: [
          { name: "Plank", workSec: 45, restSec: 15 },
          { name: "Hollow hold", workSec: 30, restSec: 30 },
        ],
      },
    },
    {
      id: "d",
      name: "Main",
      reps: 3,
      exercise: {
        kind: "depth",
        discipline: "CWT",
        target: { kind: "pct", value: 80 },
        rest: { kind: "diveTimes", factor: 3 },
      },
    },
  ],
};

export function TemplateEditorPreview() {
  const [saved, setSaved] = useState<CoachTemplate | null>(null);
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-5 py-6">
      <TemplateEditor
        initial={seed}
        onCancel={() => setSaved(null)}
        onSave={async (t) => setSaved(t)}
      />
      {saved && (
        <pre data-testid="saved" className="overflow-x-auto text-xs text-textDim">
          {JSON.stringify(saved, null, 2)}
        </pre>
      )}
    </main>
  );
}
