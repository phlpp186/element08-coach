/** Dev-only harness for the block editor, at ?preview=block. Add &flow=new to
 *  start at the create form (with "Create, send later"), &svc=down for the
 *  service missing. Everything here is invented: a six-week toy block (a test
 *  week and two phases), rebuilt locally the way the block service would
 *  (options, edits, deleted sessions; the coach's own sessions kept), and a
 *  made-up athlete's reports and numbers. Not routed, never in a build. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  editCovers,
  flatWeeks,
  isBlockSession,
  itemLine,
  type BlockAnswers,
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
import type { Json } from '../lib/supabase/coachData';
import { BlockEditor, type SaveState } from '../components/block/BlockEditor';
import { useBlockDraft } from '../components/block/useBlockDraft';
import { BlockCreateForm } from '../views/BlockCreateView';

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
const WEEKS = 6;
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
  const items: SetsItem[] = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      lines.push({ id: '', description: p });
      continue;
    }
    const swapped = src.swaps?.[p.id];
    const item = swapped ? { ...p, id: swapped, name: NAMES[swapped] ?? swapped, pct: undefined } : p;
    if (drop.has(p.id) || src.excluded?.includes(p.id)) continue;
    lines.push({ id: '', description: itemLine(item), ref: item.id });
    items.push(item);
  }
  for (const a of adds) {
    lines.push({ id: '', description: itemLine(a.item), ref: a.item.id, edit: a.id });
    items.push(a.item);
  }
  return {
    id,
    dayOfWeek: day,
    label,
    mode: 'general',
    completedAt: null,
    exercises: lines.map((l, i) => ({ ...l, id: `${id}-${i + 1}`, completedAt: null })),
    // Lifts run in the app's player, as the real block's do.
    ...(items.length ? { workout: { id: `plan:${id}`, name: label, blocks: [{ kind: 'sets', items }] } } : {}),
    ...extra,
  };
}

/** The toy block for these options, keeping the coach's own sessions. */
function build(src: BlockSource, prev: BlockPlan | null, name = 'Mia · Toy Block'): BlockPlan {
  const start = src.start ?? mondayOf(todayIso());
  const removed = new Set(src.removed ?? []);
  const water = src.focus === 'depth' ? 'Easy depth dives: 30 min' : 'Easy swim: 20 min';
  const weeks = Array.from({ length: WEEKS }, (_, n) => {
    const w = `sc-w0${n}`;
    const deload = n === WEEKS - 1;
    const sessions =
      n === 0
        ? [
            session(`${w}-d0-a`, 0, 'Session A', ['Squat 3RM: work up to a hard 3', 'Resting HR: on waking'], src, {
              tests: ['sq3', 'rhr'],
              testRound: 'baseline',
            }),
            session(`${w}-d3-b`, 3, 'Session B', ['Deadlift test: work up to a hard 3'], src),
          ]
        : [
            session(
              `${w}-d0-a`,
              0,
              'Session A',
              [
                it('squat', deload ? 2 : 3, 5, { pct: [65 + n * 3, 70 + n * 3], restSec: 150 }),
                it('row', 3, 8, { rpe: '7' }),
                it('plank', 3, 0, { measure: 'time', sec: 30, reps: undefined, restSec: 60 }),
                'Easy bike: 10 min',
              ],
              src,
            ),
            session(`${w}-d2-t`, 2, 'Dry table', ['Hold table: 6 rounds, rest shrinking by 15 s', 'Relaxed breathing between'], src, {
              mode: 'dry',
            }),
            session(`${w}-d3-b`, 3, 'Session B', [it('deadlift', 3, 5, { pct: [70, 75], restSec: 180 }), it('pushup', 3, 10, { rpe: '8' })], src),
            session(`${w}-fl-w`, 5, 'Water', [water], src, {
              floating: true,
              placed: false,
              mode: src.focus === 'depth' ? 'depth' : 'pool',
            }),
          ];
    const mine = prev ? (flatWeeks(prev)[n]?.week.plannedSessions ?? []).filter((s) => !isBlockSession(s.id)) : [];
    return {
      weekStart: addDays(start, n * 7),
      ...(n === 0 ? { flag: 'test' } : deload ? { flag: 'deload' } : {}),
      plannedSessions: [...sessions.filter((s) => !removed.has(s.id)), ...mine],
    };
  });
  return {
    id: 1,
    name: prev?.name ?? name,
    phases: [
      { id: 'p0', name: 'Test week', type: 'base', weeks: weeks.slice(0, 1) },
      { id: 'p1', name: '', type: 'base', weeks: weeks.slice(1, 4) },
      { id: 'p2', name: 'Build', type: 'build', weeks: weeks.slice(4) },
    ],
    source: src,
    tests: [
      { id: 'sq3', name: 'Squat 3RM', fields: [{ key: 'kg', unit: 'kg' }] },
      { id: 'rhr', name: 'Resting HR', fields: [{ key: 'bpm', unit: 'bpm' }] },
    ],
    coachFor: prev?.coachFor ?? { studentId: 'mia', name: 'Mia' },
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
    if (req.op === 'info')
      return { ok: true, data: req.plan ? { info: info(req.plan.source!) } : { blocks: [{ id: 'toy-block', name: 'Toy Block', weeks: WEEKS }] } };
    if (req.op === 'change') {
      const { pull: p, ...patch } = req.patch;
      if (p) pull = p;
      const src = { ...req.plan.source!, ...patch };
      return { ok: true, data: { plan: build(src, req.plan), info: info(src) } };
    }
    const a: BlockAnswers = req.answers ?? {};
    if (a.pull) pull = a.pull;
    const src: BlockSource = { id: req.block, v: 1, start: req.start, focus: a.focus, kgStep: a.kgStep, cycle: a.cycle, setup: true };
    const plan = build(src, null, req.name ?? 'Toy Block');
    return { ok: true, data: { plan, info: info(src) } };
  },
};

const downService: BlockService = {
  async call() {
    await wait();
    return { ok: false, reason: 'unavailable', message: '' };
  },
};

const START = addDays(mondayOf(todayIso()), -14);
const DEFAULT_SOURCE: BlockSource = {
  id: 'toy-block',
  v: 1,
  start: START,
  focus: 'pool',
  kgStep: 1,
  cycle: true,
  edits: {
    drop: [{ session: 'sc-w01-d0-a', ex: 'plank' }],
    add: [{ slot: 'd0-a', from: 1, id: 'a1', item: it('curl', 2, 12, { rpe: '7', restSec: 60 }) }],
  },
  removed: ['sc-w02-d3-b'],
};

export function BlockEditorPreview() {
  const q = new URLSearchParams(location.search);
  const service = q.get('svc') === 'down' ? downService : mockService;
  const [stage, setStage] = useState<{ plan: BlockPlan; sent: boolean } | null>(() =>
    q.get('flow') === 'new' ? null : { plan: build(DEFAULT_SOURCE, null), sent: true },
  );
  // The row the mocked create inserted, and whether it was assigned.
  const made = useRef<{ def: Json; sent: boolean } | null>(null);

  if (!stage)
    return (
      <BlockCreateForm
        presetStudentId={null}
        online
        loading={false}
        athletes={[
          { studentId: 'mia', name: 'Mia' },
          { studentId: 'leo', name: 'Leo' },
        ]}
        deps={{
          service,
          insert: async (_title, def) => {
            made.current = { def, sent: false };
            return 'preview-row';
          },
          assign: async () => {
            if (made.current) made.current.sent = true;
          },
          open: () => {
            const m = made.current;
            if (m) setStage({ plan: m.def as unknown as BlockPlan, sent: m.sent });
          },
        }}
      />
    );
  return <PreviewEditor service={service} initial={stage.plan} initiallySent={stage.sent} />;
}

function PreviewEditor({ service, initial, initiallySent }: { service: BlockService; initial: BlockPlan; initiallySent: boolean }) {
  const draft = useBlockDraft(service);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const [sent, setSent] = useState(initiallySent);
  const [sending, setSending] = useState(false);
  const { load } = draft;

  useEffect(() => {
    void load(initial);
  }, [load, initial]);

  const at = new Date(Date.now() - 50 * 60000).toISOString();
  const reports = useMemo(
    () =>
      sent
        ? new Map([
            ['sc-w01-d0-a', { at: new Date(`${addDays(START, 7)}T09:30:00`).toISOString(), rating: 7 }],
            ['sc-w02-d0-a', { at: new Date(`${addDays(START, 14)}T09:30:00`).toISOString(), rating: 8 }],
          ])
        : new Map(),
    [sent],
  );

  if (!draft.plan) return <p className="p-6 text-textDim">Loading…</p>;
  const coachFor = draft.plan.coachFor;
  return (
    <BlockEditor
      draft={draft}
      title={draft.plan.name ?? ''}
      phone={{ status: !sent ? 'none' : draft.dirty ? 'waiting' : 'onPhone', at }}
      send={
        !sent && coachFor
          ? {
              name: coachFor.name,
              state: sending ? 'sending' : 'idle',
              onSend: () => {
                setSending(true);
                setTimeout(() => {
                  if (draft.dirty) {
                    draft.markSaved();
                    setSave({ state: 'saved' });
                  }
                  setSent(true);
                  setSending(false);
                }, 400);
              },
            }
          : null
      }
      reports={reports}
      her={
        sent
          ? {
              at,
              planUpdatedAt: null,
              baseline: { sq3: { kg: 80 }, rhr: { bpm: 52 } },
              retest: {},
              lifts: [
                { id: 'squat', name: 'Squat', e1rm: 90, working: 70, next: 72.5 },
                { id: 'deadlift', name: 'Deadlift', e1rm: 110, working: null, next: null },
              ],
            }
          : null
      }
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
