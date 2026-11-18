/**
 * The session template editor, as approved in the app repo's
 * docs/mockups/templates-simple.html (option 1): a name, then type and
 * target effort on one line, the notes, and the parts side by side. (The
 * mockup's ask-back chips were taken out again, Philipp 2026-11-18: the app
 * always asks for effort and always has a notes field.)
 * A coach adds three kinds of part in any order: exercises as free text, a
 * dry table the app's breath-hold timer runs, and a fitness programme the
 * app's fitness timer runs. The phone app has the same editor over the same
 * template (lib/coachTemplates/model.ts).
 *
 * A part from an older template (a target relative to a PB, one of the
 * app's own workouts) shows what it says and can only be moved or removed.
 */
import { useMemo, useState } from 'react';
import { fill, useT } from '../../i18n';
import {
  MAX_BLOCKS,
  MAX_ITEMS,
  MAX_REPS,
  PART_KINDS,
  TEMPLATE_TYPES,
  isLegacyExercise,
  newPart,
  textLines,
  validateTemplate,
  type CoachTemplate,
  type PartKind,
  type ProgramItem,
  type TemplateBlock,
  type TemplateExercise,
  type TemplateIssueCode,
  type TemplateType,
} from '../../lib/coachTemplates/model';
import type { BlockType, TrainingBlock } from '../../lib/coachTemplates/deps';
import { blockSummary } from '../../lib/coachTemplates/summary';
import { templateTr } from '../../lib/coachTemplates/tr';

export const TYPE_LABEL: Record<TemplateType, string> = {
  dry: 'Dry',
  pool: 'Pool',
  depth: 'Depth',
  fitness: 'Fitness',
  general: 'General',
};

const PART_LABEL: Record<PartKind, string> = {
  text: 'Exercises',
  dry: 'Dry table',
  program: 'Fitness programme',
};
const ADD_LABEL: Record<PartKind, string> = {
  text: '+ Exercise',
  dry: '+ Dry table',
  program: '+ Fitness programme',
};
const PART_TONE: Record<PartKind, string> = {
  text: 'text-textDim',
  dry: 'text-recover',
  program: 'text-amber',
};
const ADD_TONE: Record<PartKind, string> = {
  text: 'border-textDim text-text',
  dry: 'border-recover text-recover',
  program: 'border-amber text-amber',
};

const ISSUE: Record<TemplateIssueCode, string> = {
  name: 'Give the template a name.',
  noBlocks: 'Add at least one part.',
  tooManyBlocks: 'A template holds up to 20 parts.',
  reps: 'Rounds must be 1 to 50.',
  items: 'Every exercise needs a name and a time or reps.',
  target: 'Set a target above zero.',
  rest: 'Check the rest time.',
  dryRows: 'A table needs at least one row with a time.',
  text: 'Write at least one exercise.',
  effort: 'Effort is 1 to 10.',
};

const ROW_CYCLE: BlockType[] = ['Rest', 'Hold', 'Recover'];
const ROW_LABEL: Record<BlockType, string> = {
  Rest: 'Rest',
  Hold: 'Hold',
  Recover: 'Recover',
  Attempt: 'Attempt',
  Swim: 'Swim',
};
const ROW_TONE: Record<BlockType, string> = {
  Rest: 'text-accent',
  Hold: 'text-highlight',
  Recover: 'text-recover',
  Attempt: 'text-textDim',
  Swim: 'text-textDim',
};

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;

/** "1:30", "90" or "1m30s" as seconds; null when it is none of these. */
export function parseClock(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d+):([0-5]?\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s?)?$/.exec(s);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return null;
}

/** Blank lines and empty Exercises parts are editing leftovers, not content. */
export function tidyTemplate(tpl: CoachTemplate): CoachTemplate {
  return {
    ...tpl,
    name: tpl.name.trim(),
    blocks: tpl.blocks
      .map((b) =>
        b.exercise.kind === 'text'
          ? { ...b, exercise: { ...b.exercise, text: textLines(b.exercise.text).join('\n') } }
          : b,
      )
      .filter((b) => b.exercise.kind !== 'text' || b.exercise.text),
  };
}

function TimeField({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (sec: number) => void;
  label: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="field w-16 px-2 py-1 text-center text-sm"
      aria-label={label}
      placeholder="m:ss"
      value={text ?? clock(value)}
      onFocus={() => setText(clock(value))}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseClock(e.target.value);
        if (v != null) onChange(v);
      }}
      onBlur={() => setText(null)}
    />
  );
}

function Rounds({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input
        type="number"
        min={1}
        max={MAX_REPS}
        className="field w-14 px-2 py-1 text-center text-sm font-bold"
        aria-label={t('Rounds')}
        value={value}
        onChange={(e) =>
          onChange(Math.max(1, Math.min(MAX_REPS, Math.round(Number(e.target.value) || 1))))
        }
      />
      <span className="font-bold">x</span>
    </label>
  );
}

function Part({
  block,
  issues,
  onChange,
  onRemove,
  onUp,
  onDown,
}: {
  block: TemplateBlock;
  issues: TemplateIssueCode[];
  onChange: (b: TemplateBlock) => void;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const t = useT();
  const ex = block.exercise;
  const setEx = (exercise: TemplateExercise) => onChange({ ...block, exercise });
  const legacy = isLegacyExercise(ex);
  const kind = ex.kind === 'dry' || ex.kind === 'program' ? ex.kind : 'text';
  const title = legacy ? block.name.trim() || t('Older part') : t(PART_LABEL[kind]);
  const runs =
    ex.kind === 'dry'
      ? t('runs in the timer')
      : ex.kind === 'program'
        ? t('runs in the fitness timer')
        : '';
  const iconBtn = 'px-1 text-textDim hover:text-text disabled:opacity-25';
  const x = (onClick: () => void, label: string) => (
    <button onClick={onClick} className="px-1 text-textDim hover:text-red" aria-label={label}>
      ✕
    </button>
  );

  return (
    <div
      className={`rounded-xl border bg-panel p-3 ${issues.length ? 'border-red' : 'border-border'}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`text-[11px] font-extrabold uppercase tracking-wider ${legacy ? 'text-textDim' : PART_TONE[kind]}`}
        >
          {title}
        </span>
        <span className="ml-auto text-[11px] text-textDim">{runs}</span>
        <button onClick={onUp} disabled={!onUp} className={iconBtn} aria-label={t('Move up')}>
          ↑
        </button>
        <button onClick={onDown} disabled={!onDown} className={iconBtn} aria-label={t('Move down')}>
          ↓
        </button>
        {x(onRemove, t('Remove part'))}
      </div>

      {ex.kind === 'text' && (
        <textarea
          className="field w-full px-3 py-2 text-sm"
          rows={Math.max(3, ex.text.split('\n').length + 1)}
          value={ex.text}
          onChange={(e) => setEx({ ...ex, text: e.target.value })}
          placeholder={t('One exercise per line, e.g. Diaphragm stretch · 5 min')}
          aria-label={t('Exercises')}
        />
      )}

      {ex.kind === 'dry' && (
        <div className="space-y-1.5">
          <Rounds value={block.reps} onChange={(reps) => onChange({ ...block, reps })} />
          {ex.rows.map((r, i) => {
            const set = (row: TrainingBlock) =>
              setEx({ ...ex, rows: ex.rows.map((y, j) => (j === i ? row : y)) });
            const cyc = ROW_CYCLE.indexOf(r.type);
            return (
              <div key={i} className="flex items-center gap-2">
                <button
                  // Attempt and Swim rows (device tables) keep their type.
                  onClick={() => cyc >= 0 && set({ ...r, type: ROW_CYCLE[(cyc + 1) % 3] })}
                  className={`pill w-24 px-2 py-1 text-sm ${ROW_TONE[r.type]}`}
                  title={t('Click to change: rest, hold, recover')}
                >
                  {t(ROW_LABEL[r.type])}
                </button>
                {r.endMode === 'signal' ? (
                  <span className="text-sm text-textDim">{t('open, ended by the athlete')}</span>
                ) : (
                  <TimeField
                    value={r.seconds}
                    onChange={(seconds) => set({ ...r, seconds })}
                    label={t(ROW_LABEL[r.type])}
                  />
                )}
                {x(
                  () => setEx({ ...ex, rows: ex.rows.filter((_, j) => j !== i) }),
                  t('Remove row'),
                )}
              </div>
            );
          })}
          <button
            onClick={() => setEx({ ...ex, rows: [...ex.rows, { type: 'Hold', seconds: 60 }] })}
            className="text-xs font-semibold text-recover"
          >
            {t('+ Row')}
          </button>
          {ex.holdTarget && (
            <p className="text-xs text-textDim">
              {blockSummary(block, false, templateTr())}{' '}
              <button
                onClick={() => setEx({ ...ex, holdTarget: null })}
                className="text-accent hover:underline"
              >
                {t('Use the table times')}
              </button>
            </p>
          )}
        </div>
      )}

      {ex.kind === 'program' && (
        <div className="space-y-1.5">
          <Rounds value={block.reps} onChange={(reps) => onChange({ ...block, reps })} />
          {ex.items.map((it, i) => {
            const set = (item: ProgramItem) =>
              setEx({ ...ex, items: ex.items.map((y, j) => (j === i ? item : y)) });
            const byReps = it.reps != null;
            // Time or repetitions: click the unit to switch; the other value is kept.
            const toggle = () => {
              if (!byReps) return set({ ...it, reps: 10 });
              const { reps: _reps, ...timed } = it;
              void _reps;
              set({ ...timed, workSec: timed.workSec > 0 ? timed.workSec : 30 });
            };
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className="field min-w-[8rem] flex-1 px-2 py-1 text-sm"
                  value={it.name}
                  maxLength={60}
                  onChange={(e) => set({ ...it, name: e.target.value })}
                  placeholder={t('e.g. Plank')}
                  aria-label={t('Exercise')}
                />
                <button
                  onClick={toggle}
                  className="pill w-16 px-2 py-1 text-xs text-amber"
                  title={t('Click to switch between time and reps')}
                >
                  {byReps ? t('Reps') : t('Time')}
                </button>
                {byReps ? (
                  <input
                    type="number"
                    min={1}
                    max={999}
                    className="field w-16 px-2 py-1 text-center text-sm"
                    aria-label={t('Reps')}
                    value={it.reps || ''}
                    onChange={(e) =>
                      set({ ...it, reps: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                    }
                  />
                ) : (
                  <TimeField
                    value={it.workSec}
                    onChange={(workSec) => set({ ...it, workSec })}
                    label={t('Time')}
                  />
                )}
                <span className="text-[11px] text-textDim">{t('Rest')}</span>
                <TimeField
                  value={it.restSec}
                  onChange={(restSec) => set({ ...it, restSec })}
                  label={t('Rest')}
                />
                {x(
                  () => setEx({ ...ex, items: ex.items.filter((_, j) => j !== i) }),
                  t('Remove row'),
                )}
              </div>
            );
          })}
          {ex.items.length < MAX_ITEMS && (
            <button
              onClick={() =>
                setEx({ ...ex, items: [...ex.items, { name: '', workSec: 30, restSec: 30 }] })
              }
              className="text-xs font-semibold text-amber"
            >
              {t('+ Row')}
            </button>
          )}
        </div>
      )}

      {legacy && (
        <>
          <p className="text-sm">
            {block.reps > 1 ? `${block.reps} x ` : ''}
            {blockSummary(block, false, templateTr())}
          </p>
          <p className="mt-1 text-xs text-textDim">
            {t('From an older template. It still sends as before; here it can only be moved or removed.')}
          </p>
        </>
      )}

      {issues.map((c) => (
        <p key={c} className="mt-1.5 text-xs text-red">
          {t(ISSUE[c])}
        </p>
      ))}
    </div>
  );
}

export function TemplateEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CoachTemplate;
  /** Rejects with a message when the save failed; the editor stays open. */
  onSave: (t: CoachTemplate) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [tpl, setTpl] = useState(initial);
  const [showIssues, setShowIssues] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issues = useMemo(() => validateTemplate(tidyTemplate(tpl)), [tpl]);

  const update = (patch: Partial<CoachTemplate>) => setTpl((cur) => ({ ...cur, ...patch }));
  const setBlocks = (blocks: TemplateBlock[]) => update({ blocks });

  // "+ Exercise" goes to the Exercises part the template ends with, so a run
  // of exercises stays one part; otherwise it starts a new one.
  const addPart = (kind: PartKind) => {
    const last = tpl.blocks[tpl.blocks.length - 1];
    if (kind === 'text' && last?.exercise.kind === 'text') {
      const text = last.exercise.text;
      setBlocks([
        ...tpl.blocks.slice(0, -1),
        { ...last, exercise: { kind: 'text', text: text.trim() ? `${text}\n` : text } },
      ]);
      return;
    }
    if (tpl.blocks.length < MAX_BLOCKS) setBlocks([...tpl.blocks, newPart(kind)]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...tpl.blocks];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setBlocks(next);
  };

  const save = async () => {
    const clean = tidyTemplate(tpl);
    if (validateTemplate(clean).length) {
      setShowIssues(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...clean, updatedAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const chip = (on: boolean) => `pill px-2.5 py-0.5 text-[13px] ${on ? 'pill-on' : ''}`;
  const label = 'text-[11px] font-semibold uppercase tracking-wider text-textDim';
  const general = issues.filter((i) => !i.blockId);

  return (
    <div className="board space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-base font-extrabold">{t('Template')}</h2>
        <button onClick={onCancel} className="pill px-3 py-1.5 text-sm">
          {t('Cancel')}
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="pill pill-on btn-raised px-4 py-1.5 text-sm font-extrabold disabled:opacity-50"
        >
          {busy ? t('Saving…') : t('Save')}
        </button>
      </div>

      <input
        className="field w-full px-3 py-2 font-extrabold"
        value={tpl.name}
        maxLength={80}
        onChange={(e) => update({ name: e.target.value })}
        placeholder={t('Template name')}
        aria-label={t('Template name')}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${label} mr-1`}>{t('Type')}</span>
        {TEMPLATE_TYPES.map((ty) => (
          <button key={ty} onClick={() => update({ type: ty })} className={chip(tpl.type === ty)}>
            {t(TYPE_LABEL[ty])}
          </button>
        ))}
        <span className={`${label} ml-3 mr-1`}>{t('Target effort')}</span>
        <button
          onClick={() => setEffortOpen((v) => !v)}
          className={chip(tpl.effort != null)}
          aria-expanded={effortOpen}
        >
          {tpl.effort != null ? `${tpl.effort} / 10` : t('none')}
        </button>
      </div>
      {effortOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              onClick={() => update({ effort: tpl.effort === n ? null : n })}
              className={chip(tpl.effort === n)}
              aria-label={fill(t('Target effort {n} of 10'), { n })}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className={`${label} mb-1`}>{t('Notes for the athlete')}</div>
        <textarea
          className="field w-full px-3 py-2 text-sm"
          rows={2}
          maxLength={2000}
          value={tpl.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder={t('What should they focus on?')}
          aria-label={t('Notes for the athlete')}
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {tpl.blocks.map((b, i) => (
          <Part
            key={b.id}
            block={b}
            issues={showIssues ? issues.filter((y) => y.blockId === b.id).map((y) => y.code) : []}
            onChange={(nb) => setBlocks(tpl.blocks.map((y, j) => (j === i ? nb : y)))}
            onRemove={() => setBlocks(tpl.blocks.filter((_, j) => j !== i))}
            onUp={i > 0 ? () => move(i, -1) : undefined}
            onDown={i < tpl.blocks.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {PART_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => addPart(k)}
            className={`rounded-full border border-dashed px-3 py-1.5 text-[13px] font-semibold ${ADD_TONE[k]}`}
          >
            {t(ADD_LABEL[k])}
          </button>
        ))}
      </div>

      {showIssues &&
        general.map((i) => (
          <p key={i.code} className="text-sm text-red">
            {t(ISSUE[i.code])}
          </p>
        ))}
      {error && (
        <p className="text-sm text-red">
          {t('Could not save the template.')} {error}
        </p>
      )}
    </div>
  );
}
