/** Dev-only harness for the block editor, at ?preview=block (add &svc=down
 *  for the service missing). Everything here is invented: a three-week toy
 *  block, rebuilt locally the way the block service would (options, edits,
 *  deleted sessions; the coach's own sessions kept), and a made-up athlete's
 *  reports and numbers. Not routed, never in a build. */
import { useEffect, useMemo, useState } from 'react';
import {
  editCovers,
  flatWeeks,
  isBlockSession,
  itemLine,
  type BlockExercise,
  type BlockInfo,
  type BlockPlan,
  type BlockSession,
  type BlockSource,
  type Pull,
  type SetsItem,
} from '../lib/appBlock';
import { addDays, mondayOf, todayIso } from '../lib/e08plan';
import type { BlockService } from '../lib/supabase/appBlockService';
import { BlockEditor, type SaveState } from '../components/block/BlockEditor';
import { useBlockDraft } from '../components/block/useBlockDraft';

const NAMES: Record<string, string> = {
  squat: 'Squat',
  goblet: 'Goblet squat',
  deadlift: 'Deadlift',
  row: 'Row',
  plank: 'Plank',
  pushup: 'Push-up',
  curl: 'Curl',
  lunge: 'Lunge',
};
const MAIN = ['squat', 'deadlift'];
const SWAPS: Record<string, string[]> = { squat: ['goblet'], deadlift: [] };
let pull: Pull | null = 'assisted';

const it = (id: string, sets: number, reps: number, extra: Partial<SetsItem> = {}): SetsItem => ({
  id,
  name: NAMES[id] ?? id,
  measure: 'reps',
  sets,
  reps,
  restSec: 90,
  ...extra,
});

function session(
  id: string,
  day: number,
  label: string,
  parts: (SetsItem | string)[],
  src: BlockSource,
  extra: Partial<BlockSession> = {},
): BlockSession {
  const drop = new Set((src.edits?.drop ?? []).filter((d) => editCovers(d, id)).map((d) => d.ex));
  const adds = (src.edits?.add ?? []).filter((a) => editCovers(a, id) && !drop.has(a.id));
  const lines: BlockExercise[] = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      lines.push({ id: '', description: p });
      continue;
    }
    const swapped = src.swaps?.[p.id];
    const item = swapped ? { ...p, id: swapped, name: NAMES[swapped] ?? swapped, pct: undefined } : p;
    if (drop.has(p.id) || src.excluded?.includes(p.id)) continue;
    lines.push({ id: '', description: itemLine(item), ref: item.id });
  }
  for (const a of adds) lines.push({ id: '', description: itemLine(a.item), ref: a.item.id, edit: a.id });
  return {
    id,
    dayOfWeek: day,
    label,
    mode: 'general',
    completedAt: null,
    exercises: lines.map((l, i) => ({ ...l, id: `${id}-${i + 1}`, completedAt: null })),
    ...extra,
  };
}

/** The toy block for these options, keeping the coach's own sessions. */
function build(src: BlockSource, prev: BlockPlan | null): BlockPlan {
  const start = src.start ?? mondayOf(todayIso());
  const removed = new Set(src.removed ?? []);
  const water = src.focus === 'depth' ? 'Easy depth dives: 30 min' : 'Easy swim: 20 min';
  const weeks = [0, 1, 2].map((n) => {
    const w = `sc-w0${n}`;
    const sessions =
      n === 0
        ? [
            session(`${w}-d0-a`, 0, 'Session A', ['Squat test: work up to a hard 3', 'Resting heart rate on waking'], src),
            session(`${w}-d3-b`, 3, 'Session B', ['Deadlift test: work up to a hard 3'], src),
          ]
        : [
            session(`${w}-d0-a`, 0, 'Session A', [it('squat', 3, 5, { pct: [70 + n * 5, 75 + n * 5], restSec: 150 }), it('row', 3, 8, { rpe: '7' }), it('plank', 3, 0, { measure: 'time', sec: 30, reps: undefined, restSec: 60 }), 'Easy bike: 10 min'], src),
            session(`${w}-d3-b`, 3, 'Session B', [it('deadlift', 3, 5, { pct: [70, 75], restSec: 180 }), it('pushup', 3, 10, { rpe: '8' })], src),
            session(`${w}-fl-w`, 5, 'Water', [water], src, { floating: true, placed: false }),
          ];
    const mine = prev ? (flatWeeks(prev)[n]?.week.plannedSessions ?? []).filter((s) => !isBlockSession(s.id)) : [];
    return {
      weekStart: addDays(start, n * 7),
      ...(n === 0 ? { flag: 'test' } : {}),
      plannedSessions: [...sessions.filter((s) => !removed.has(s.id)), ...mine],
    };
  });
  return {
    id: 1,
    name: 'Mia · Toy Block',
    phases: [{ id: 'p', name: 'Toy', type: 'base', weeks }],
    source: src,
    tests: [
      { id: 'sq3', name: 'Squat 3RM', fields: [{ key: 'kg', unit: 'kg' }] },
      { id: 'rhr', name: 'Resting HR', fields: [{ key: 'bpm', unit: 'bpm' }] },
    ],
    coachFor: { studentId: 'mia', name: 'Mia' },
  };
}

const info = (src: BlockSource): BlockInfo => ({
  block: 'toy-block',
  v: 1,
  exercises: NAMES,
  tested: MAIN.filter((l) => !src.swaps?.[l]),
  mainLifts: MAIN,
  swaps: SWAPS,
  kgSteps: [1, 1.25, 2, 2.5],
  pull,
});

const wait = () => new Promise((r) => setTimeout(r, 250));

const mockService: BlockService = {
  async call(req) {
    await wait();
    if (req.op === 'info') return { ok: true, data: req.plan ? { info: info(req.plan.source!) } : { blocks: [{ id: 'toy-block', name: 'Toy Block', weeks: 3 }] } };
    if (req.op === 'change') {
      const { pull: p, ...patch } = req.patch;
      if (p) pull = p;
      const src = { ...req.plan.source!, ...patch };
      return { ok: true, data: { plan: build(src, req.plan), info: info(src) } };
    }
    return { ok: false, reason: 'refused', message: 'not in the preview' };
  },
};

const downService: BlockService = {
  async call() {
    await wait();
    return { ok: false, reason: 'unavailable', message: '' };
  },
};

export function BlockEditorPreview() {
  const down = new URLSearchParams(location.search).get('svc') === 'down';
  const draft = useBlockDraft(down ? downService : mockService);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const { load } = draft;
  const start = addDays(mondayOf(todayIso()), -7);

  useEffect(() => {
    void load(
      build(
        {
          id: 'toy-block',
          v: 1,
          start,
          focus: 'pool',
          kgStep: 1,
          cycle: true,
          edits: {
            drop: [{ session: 'sc-w01-d0-a', ex: 'plank' }],
            add: [{ slot: 'd0-a', from: 1, id: 'a1', item: it('curl', 2, 12, { rpe: '7', restSec: 60 }) }],
          },
          removed: ['sc-w02-d3-b'],
        },
        null,
      ),
    );
  }, [load, start]);

  const at = new Date(Date.now() - 50 * 60000).toISOString();
  const reports = useMemo(
    () => new Map([['sc-w01-d0-a', { at: new Date(`${start}T09:30:00`).toISOString(), rating: 7 }]]),
    [start],
  );

  if (!draft.plan) return <p className="p-6 text-textDim">Loading…</p>;
  return (
    <BlockEditor
      draft={draft}
      title={draft.plan.name ?? ''}
      phone={{ status: draft.dirty ? 'waiting' : 'onPhone', at }}
      reports={reports}
      her={{
        at,
        planUpdatedAt: null,
        baseline: { sq3: { kg: 80 }, rhr: { bpm: 52 } },
        retest: {},
        lifts: [
          { id: 'squat', name: 'Squat', e1rm: 90, working: 70, next: 72.5 },
          { id: 'deadlift', name: 'Deadlift', e1rm: 110, working: null, next: null },
        ],
      }}
      logHref={() => '#'}
      save={save}
      onSave={() => {
        setSave({ state: 'saved' });
        draft.markSaved();
      }}
      onDone={() => {}}
    />
  );
}
