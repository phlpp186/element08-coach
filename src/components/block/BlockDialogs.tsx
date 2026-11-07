/**
 * The block editor's two dialogs: add an exercise to a session (into its
 * list and the workout the player runs, for this session or every session of
 * its slot from this week), and add a session to a week (a copy of one of
 * the plan's sessions, or a blank one).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  blankSession,
  copySession,
  flatWeeks,
  insertSession,
  itemLine,
  newSessionId,
  parseClock,
  slugId,
  type BlockInfo,
  type BlockPlan,
  type BlockSession,
  type DayChoice,
  type FlatWeek,
  type SetsItem,
} from '../../lib/appBlock';
import { DAY_LABELS } from '../../lib/e08plan';
import { fill, useT } from '../../i18n';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="board max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-heading text-base text-text">{title}</h3>
          <button onClick={onClose} className="px-1 text-textDim hover:text-text" aria-label={t('Close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const lbl = 'mb-1 block text-xs font-bold text-textDim';
const pill = (on: boolean) => `pill px-2.5 py-1 text-xs ${on ? 'pill-on' : ''}`;

type Load = 'rpe' | 'pct' | 'kg' | 'bw';

const REPS = /^(\d+)(?:\s*-\s*(\d+))?$/;
const posNum = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

export function AddExerciseDialog({
  session,
  week,
  info,
  blockSession,
  busy,
  onClose,
  onAdd,
}: {
  session: BlockSession;
  week: FlatWeek;
  info: BlockInfo | null;
  /** A block session with a slot: "every one from this week" is offered. */
  blockSession: boolean;
  busy: boolean;
  onClose: () => void;
  onAdd: (item: SetsItem, everyFrom: number | null) => void | Promise<void>;
}) {
  const t = useT();
  const label = session.label?.trim() || t('Session');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [measure, setMeasure] = useState<'reps' | 'time'>('reps');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('8');
  const [sec, setSec] = useState('30');
  const [perSide, setPerSide] = useState(false);
  const [rest, setRest] = useState('1:30');
  const [load, setLoad] = useState<Load>('rpe');
  const [rpe, setRpe] = useState('7');
  const [pctLo, setPctLo] = useState('70');
  const [pctHi, setPctHi] = useState('75');
  const [kg, setKg] = useState('');
  const [note, setNote] = useState('');
  const [every, setEvery] = useState(false);

  const all = useMemo(
    () => Object.entries(info?.exercises ?? {}).sort((a, b) => a[1].localeCompare(b[1])),
    [info],
  );
  const q = query.trim().toLowerCase();
  const matches = q && picked?.name !== query ? all.filter(([, n]) => n.toLowerCase().includes(q)).slice(0, 8) : [];
  const exact = all.find(([, n]) => n.toLowerCase() === q);
  const id = picked?.id ?? (exact ? exact[0] : slugId(query));
  const name = picked?.name ?? (exact ? exact[1] : query.trim());
  const tested = !!info?.tested.includes(id);
  const effLoad: Load = load === 'pct' && !tested ? 'rpe' : load;

  const item = useMemo((): SetsItem | null => {
    const n = Number(sets);
    if (!name || !Number.isInteger(n) || n < 1) return null;
    const restSec = rest.trim() ? parseClock(rest) : 0;
    if (restSec == null) return null;
    const it: SetsItem = { id, name, measure, sets: n, restSec };
    if (measure === 'reps') {
      const m = REPS.exec(reps.trim());
      if (!m) return null;
      it.reps = Number(m[1]);
      if (m[2] && Number(m[2]) > it.reps) it.repsHigh = Number(m[2]);
    } else {
      const s = posNum(sec);
      if (s == null) return null;
      it.sec = Math.round(s);
    }
    if (perSide) it.perSide = true;
    if (effLoad === 'rpe' && rpe.trim()) it.rpe = rpe.trim();
    if (effLoad === 'pct') {
      const lo = posNum(pctLo);
      const hi = posNum(pctHi) ?? lo;
      if (lo == null || hi == null || hi < lo || hi > 120) return null;
      it.pct = [lo, hi];
    }
    if (effLoad === 'kg') {
      const k = posNum(kg);
      if (k == null) return null;
      it.kg = k;
    }
    if (note.trim()) it.note = note.trim();
    return it;
  }, [id, name, measure, sets, reps, sec, perSide, rest, effLoad, rpe, pctLo, pctHi, kg, note]);

  return (
    <Modal title={fill(t('Add exercise · {label}, week {n}'), { label, n: week.number })} onClose={onClose}>
      <div className="relative">
        <span className={lbl}>{t('Exercise')}</span>
        <input
          className="field"
          autoFocus
          value={query}
          placeholder={t('Search or type a name')}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
        />
        {matches.length > 0 && (
          <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-abyss text-sm">
            {matches.map(([xid, n]) => (
              <li key={xid}>
                <button
                  className="w-full px-3 py-1.5 text-left hover:bg-surface"
                  onClick={() => {
                    setPicked({ id: xid, name: n });
                    setQuery(n);
                  }}
                >
                  {n}
                  {info?.tested.includes(xid) && <span className="ml-2 text-xs text-accent">% e1RM</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-textDim">
          {query.trim() && !picked && !exact
            ? fill(t('"{name}" is new to the block: it is added as you write it.'), { name: query.trim() })
            : t("From the block's exercises, or type a new one.")}
        </p>
      </div>

      <div className="flex gap-1.5">
        <button className={pill(measure === 'reps')} onClick={() => setMeasure('reps')}>
          {t('Reps')}
        </button>
        <button className={pill(measure === 'time')} onClick={() => setMeasure('time')}>
          {t('Time')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={lbl}>{t('Sets')}</span>
          <input className="field" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
        </label>
        {measure === 'reps' ? (
          <label>
            <span className={lbl}>{t('Reps')}</span>
            <input className="field" value={reps} placeholder="6-8" onChange={(e) => setReps(e.target.value)} />
          </label>
        ) : (
          <label>
            <span className={lbl}>{t('Seconds')}</span>
            <input className="field" inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value)} />
          </label>
        )}
        <label>
          <span className={lbl}>{t('Rest')}</span>
          <input className="field" value={rest} placeholder="1:30" onChange={(e) => setRest(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={perSide} onChange={(e) => setPerSide(e.target.checked)} />
        {t('Per side')}
      </label>

      <div>
        <span className={lbl}>{t('Load')}</span>
        <div className="flex flex-wrap gap-1.5">
          <button className={pill(effLoad === 'rpe')} onClick={() => setLoad('rpe')}>
            RPE
          </button>
          <button className={pill(effLoad === 'pct')} disabled={!tested} onClick={() => setLoad('pct')}>
            % e1RM
          </button>
          <button className={pill(effLoad === 'kg')} onClick={() => setLoad('kg')}>
            kg
          </button>
          <button className={pill(effLoad === 'bw')} onClick={() => setLoad('bw')}>
            {t('Bodyweight')}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {effLoad === 'rpe' && (
            <input className="field w-24" value={rpe} placeholder="7-8" onChange={(e) => setRpe(e.target.value)} aria-label="RPE" />
          )}
          {effLoad === 'pct' && (
            <>
              <input className="field w-20" inputMode="decimal" value={pctLo} onChange={(e) => setPctLo(e.target.value)} aria-label="%" />
              <span className="text-textDim">–</span>
              <input className="field w-20" inputMode="decimal" value={pctHi} onChange={(e) => setPctHi(e.target.value)} aria-label="%" />
              <span className="text-textDim">% e1RM</span>
            </>
          )}
          {effLoad === 'kg' && (
            <>
              <input className="field w-24" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="kg" />
              <span className="text-textDim">kg</span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-textDim">{t('% e1RM only for the lifts she tests: the app turns it into her kg.')}</p>
      </div>

      <label className="block">
        <span className={lbl}>{t('Note (optional)')}</span>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {blockSession && (
        <div>
          <span className={lbl}>{t('Where')}</span>
          <div className="flex flex-wrap gap-1.5">
            <button className={pill(!every)} onClick={() => setEvery(false)}>
              {t('This session')}
            </button>
            <button className={pill(every)} onClick={() => setEvery(true)}>
              {fill(t('Every {label} from week {n}'), { label, n: week.number })}
            </button>
          </div>
        </div>
      )}

      <div>
        <span className={lbl}>{t('She sees')}</span>
        <p className="rounded-lg border border-border bg-abyss px-3 py-2 text-sm text-text">
          {item ? itemLine(item) : <span className="text-textDim">{t('Fill in the exercise and its sets.')}</span>}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="pill px-3 py-1.5 text-sm">
          {t('Cancel')}
        </button>
        <button
          disabled={!item || busy}
          onClick={() => item && void onAdd(item, blockSession && every ? week.number : null)}
          className="pill pill-on btn-raised px-4 py-1.5 text-sm"
        >
          {t('Add')}
        </button>
      </div>
    </Modal>
  );
}

export function AddSessionDialog({
  plan,
  week,
  onClose,
  onAdd,
}: {
  plan: BlockPlan;
  week: FlatWeek;
  onClose: () => void;
  onAdd: (fn: (p: BlockPlan) => BlockPlan) => void;
}) {
  const t = useT();
  // One of each session in the plan, this week's first.
  const sources = useMemo(() => {
    const seen = new Map<string, BlockSession>();
    const weeks = flatWeeks(plan);
    for (const w of [weeks[week.index], ...weeks].filter(Boolean))
      for (const s of w.week.plannedSessions ?? []) {
        const key = s.label?.trim() || s.id;
        if (!seen.has(key)) seen.set(key, s);
      }
    return [...seen.values()];
  }, [plan, week.index]);
  const [from, setFrom] = useState<string>(sources[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [lines, setLines] = useState('');
  const [day, setDay] = useState<DayChoice>(0);
  const src = sources.find((s) => s.id === from) ?? null;
  const ok = src ? true : !!(label.trim() || lines.trim());

  const add = () => {
    const id = newSessionId();
    const s = src ? copySession(src, id, day) : blankSession(id, label, lines.split('\n'), day);
    onAdd((p) => insertSession(p, week.index, s));
  };

  return (
    <Modal title={fill(t('Add session to week {n}'), { n: week.number })} onClose={onClose}>
      <label className="block">
        <span className={lbl}>{t('Start from')}</span>
        <select className="field" value={from} onChange={(e) => setFrom(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label?.trim() || t('Session')}
            </option>
          ))}
          <option value="">{t('A blank session')}</option>
        </select>
      </label>
      {src ? (
        <ul className="space-y-0.5 rounded-lg border border-border bg-abyss px-3 py-2 text-xs text-textDim">
          {src.exercises.map((e) => (
            <li key={e.id}>{e.description}</li>
          ))}
        </ul>
      ) : (
        <>
          <label className="block">
            <span className={lbl}>{t('Label')}</span>
            <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className={lbl}>{t('Lines')}</span>
            <textarea
              className="field min-h-24"
              value={lines}
              placeholder={t('One line per exercise')}
              onChange={(e) => setLines(e.target.value)}
            />
          </label>
        </>
      )}
      <div>
        <span className={lbl}>{t('Day')}</span>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((d, i) => (
            <button key={d} className={pill(day === i)} onClick={() => setDay(i)}>
              {t(d)}
            </button>
          ))}
          <button className={pill(day === 'any')} onClick={() => setDay('any')}>
            {t('Any day this week')}
          </button>
        </div>
      </div>
      <p className="text-xs text-textDim">{t('Your own sessions stay when the block is rebuilt. Save to send them to her.')}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="pill px-3 py-1.5 text-sm">
          {t('Cancel')}
        </button>
        <button disabled={!ok} onClick={add} className="pill pill-on btn-raised px-4 py-1.5 text-sm">
          {t('Add session')}
        </button>
      </div>
    </Modal>
  );
}
