/** Dev-only harness: the template picker over a seeded library of 14
 *  templates across all four modes, so the columns can be judged without a
 *  Supabase login and a coach's real plans. ?preview=templates. Not routed. */
import { TemplatePicker } from "../components/TemplatePicker";
import type { PickableTemplate } from "../lib/templateGroups";

const seed: PickableTemplate[] = [
  {
    id: "1",
    name: "Monday line day",
    mode: "depth",
    sub: "CWT",
    count: 4,
    useCount: 12,
  },
  {
    id: "2",
    name: "FIM hangs 20 m",
    mode: "depth",
    sub: "FIM",
    count: 3,
    useCount: 7,
  },
  {
    id: "3",
    name: "Deep warm-up ladder",
    mode: "depth",
    sub: "CWTB",
    count: 5,
    useCount: 3,
  },
  { id: "4", name: "CNF technique", mode: "depth", sub: "CNF", count: 4 },
  {
    id: "5",
    name: "DYN 8 × 50",
    mode: "pool",
    sub: "DYN",
    count: 2,
    useCount: 9,
  },
  {
    id: "6",
    name: "DNF glide work",
    mode: "pool",
    sub: "DNF",
    count: 3,
    useCount: 2,
  },
  { id: "7", name: "Sprints 25 m", mode: "pool", sub: "DYNB", count: 1 },
  {
    id: "8",
    name: "CO₂ table, classic",
    mode: "dry",
    sub: "CO₂ table",
    count: 1,
    useCount: 22,
  },
  {
    id: "9",
    name: "O₂ table FRC",
    mode: "dry",
    sub: "O₂ table",
    count: 1,
    useCount: 5,
  },
  {
    id: "10",
    name: "Apnea walks",
    mode: "dry",
    sub: "Dry dynamic",
    count: 2,
    useCount: 4,
  },
  {
    id: "11",
    name: "Breathwork 20 min",
    mode: "dry",
    sub: "Breathwork",
    count: 3,
  },
  {
    id: "12",
    name: "Mobility + stretch",
    mode: "general",
    sub: "Recovery",
    count: 6,
    useCount: 8,
  },
  {
    id: "13",
    name: "Gym strength A",
    mode: "general",
    sub: "Strength",
    count: 7,
    useCount: 1,
  },
  { id: "14", name: "Rest day notes", mode: "general", count: 0 },
];

export function TemplatePickerPreview() {
  return (
    <div className="mx-auto max-w-3xl p-6 text-text">
      <p className="mb-4 text-sm text-textDim">
        14 seeded templates. Open the picker:
      </p>
      <TemplatePicker
        items={seed}
        onPick={(id) => alert(`picked ${id}`)}
        triggerLabel="+ from template"
        title="Session templates"
      />
    </div>
  );
}
