/**
 * AttachedSessionDetail — rich render of the logbook session an athlete attached
 * to a coach-plan completion. The blob is the app's full Session (depth/pool/dry)
 * with per-dive 1 Hz profiles, so we reuse the analyzer's ECharts track
 * components (depth/HR/speed/temp, pool, dry SpO₂/HR/block timeline) ported into
 * this repo. The charts pull in echarts (~1 MB), so they're lazy-loaded — the
 * main bundle stays lean and echarts only downloads when a coach expands a dive.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { fill, useLangValue, useT } from '../i18n';
import { extractDiveData } from '../lib/analytics/diveProfile';
import { formatSessionDate } from '../lib/sessionDate';
import { SpeedBands } from './SpeedBands';
import { extractPoolDiveData } from '../lib/analytics/poolDiveProfile';
import { extractPoolTraceData } from '../lib/analytics/poolTrace';
import { extractDrySessionData } from '../lib/analytics/drySessionProfile';
import { poolLengthLabel, poolMeters } from '../lib/poolLength';
import { holdNotes } from '../lib/sessionNotes';
import type { Json } from '../lib/supabase/coachData';
import { exerciseName, fmtDuration, planText, setText, strengthOf, volumeKg, type BlockLog, type StrengthLog } from '../lib/strengthLog';

const DepthDiveTracks = lazy(() =>
  import('./charts/DepthDiveTracks').then((m) => ({ default: m.DepthDiveTracks })),
);
const PoolDiveTracks = lazy(() =>
  import('./charts/PoolDiveTracks').then((m) => ({ default: m.PoolDiveTracks })),
);
const DrySessionTracks = lazy(() =>
  import('./charts/DrySessionTracks').then((m) => ({ default: m.DrySessionTracks })),
);
const PoolSignalTracks = lazy(() =>
  import('./charts/PoolSignalTracks').then((m) => ({ default: m.PoolSignalTracks })),
);

type AnyDive = Record<string, unknown>;
interface SessionBlob {
  mode?: string;
  date?: string;
  duration?: string;
  remarks?: string | null;
  rating?: number | null;
  // depth
  maxDepth?: number;
  discipline?: string;
  location?: string;
  waterTemp?: number | null;
  // pool
  totalDistance?: number;
  /** Legacy label; `'-'` for any pool that is neither 25 nor 50 m. Read the
   *  length with `poolMeters`, never from this. */
  poolType?: string;
  /** Pool length in metres, authoritative since the app's 2026-08-09 build.
   *  Absent on sessions attached before then. */
  poolLengthM?: number;
  // dry
  cyclesCount?: number;
  dryActivity?: string | null;
  dives?: AnyDive[];
  blockTimeline?: unknown[];
}

function fmtSec(s?: number | null): string {
  if (s == null || !Number.isFinite(s)) return '–';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const chartFallback = (
  <p className="py-6 text-center text-xs text-textDim">…</p>
);

export function AttachedSessionDetail({ blob }: { blob: Json }) {
  const t = useT();
  const s = (blob ?? {}) as SessionBlob;
  const mode = s.mode ?? 'depth';

  return (
    <div className="space-y-4">
      <StatHeader s={s} t={t} />
      <StrengthSection session={blob} />

      {mode === 'depth' && <DepthDives dives={s.dives ?? []} t={t} />}
      {mode === 'pool' && <PoolDives dives={s.dives ?? []} t={t} />}
      {mode === 'dry' && (
        <Suspense fallback={chartFallback}>
          <DrySessionTracks data={extractDrySessionData(s as never)} groupId="att-dry" />
        </Suspense>
      )}
      {mode === 'dry' && <HoldNotes blockTimeline={s.blockTimeline} t={t} />}

      {typeof s.remarks === 'string' && s.remarks.trim() !== '' && (
        <p className="text-sm text-textDim italic">{s.remarks}</p>
      )}
    </div>
  );
}

function StatHeader({ s, t }: { s: SessionBlob; t: (k: string) => string }) {
  const stats: { label: string; value: string }[] = [];
  const push = (label: string, value: unknown, suffix = '') => {
    if (value === null || value === undefined || value === '') return;
    stats.push({ label, value: `${value}${suffix}` });
  };
  // A session date is a full ISO INSTANT, not a calendar date: the app stores
  // when the session happened, not just the day. This used to append
  // `T00:00:00Z` to it — right for a plan date, nonsense for an instant — and
  // every session an athlete uploaded showed the coach the words "Invalid
  // Date". See lib/sessionDate: it handles both shapes and returns null rather
  // than ever rendering that string again, which `push` drops.
  push(t('Date'), formatSessionDate(s.date));
  push(t('Type'), s.mode);
  if (s.mode === 'depth') {
    push(t('Max depth'), s.maxDepth, ' m');
    push(t('Discipline'), s.discipline);
    if (Array.isArray(s.dives)) push(t('Dives'), s.dives.length);
    push(t('Water temp'), s.waterTemp != null ? s.waterTemp : undefined, ' °C');
  } else if (s.mode === 'pool') {
    push(t('Distance'), s.totalDistance, ' m');
    if (Array.isArray(s.dives)) push(t('Dives'), s.dives.length);
    push(t('Pool'), poolMeters(s) > 0 ? poolLengthLabel(s) : undefined);
  } else if (s.mode === 'dry') {
    push(t('Activity'), s.dryActivity);
    push(t('Cycles'), s.cyclesCount);
  }
  push(t('Duration'), s.duration);
  // 1-10 since app build 1.1.3. Sessions attached by older app builds carry
  // 1-5 values (the blob is unversioned), which then read as the mild end of
  // the new scale.
  if (typeof s.rating === 'number') push(t('Effort'), `${s.rating}/10`);

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border bg-abyss p-3">
      {stats.map((st) => (
        <div key={st.label}>
          <div className="text-[10px] uppercase tracking-wide text-textDim">{st.label}</div>
          <div className="font-heading text-text">{st.value}</div>
        </div>
      ))}
    </div>
  );
}

const MACHINE: Record<string, string> = { bike: 'Bike', row: 'Row', skierg: 'Ski erg', swim: 'Swim', run: 'Run' };

/** What she lifted: each exercise with its plan and one chip per set, and
 *  the timed, circuit and AMRAP parts (Philipp, 2026-11-23). */
function StrengthSection({ session }: { session: Json }) {
  const t = useT();
  const lang = useLangValue();
  const st = useMemo(() => strengthOf(session), [session]);
  if (!st) return null;
  const words = { max: t('max'), perSide: t('per side') };
  return (
    <section className="board overflow-hidden">
      <div className="border-b border-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-textDim">
        {t('Strength')}
        {st.workoutName ? <span className="ml-2 normal-case tracking-normal text-text">{st.workoutName}</span> : null}
      </div>
      <ul className="divide-y divide-border">
        {st.exercises.map((ex, i) => {
          const plan = planText(ex.target, words);
          const kg = volumeKg(ex);
          const notes = ex.sets.map((x, n) => [n + 1, x.note?.trim()] as const).filter(([, note]) => !!note);
          return (
            <li key={`${ex.id}-${i}`} className="bg-panel px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-heading text-text">{exerciseName(ex, lang)}</span>
                {kg > 0 && <span className="text-xs text-textDim">{fill(t('{n} kg moved'), { n: kg })}</span>}
              </div>
              {plan && (
                <div className="text-xs text-textDim">
                  {t('Plan')}: {plan}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ex.sets.map((x, n) => (
                  <span
                    key={n}
                    title={x.done ? undefined : t('not done')}
                    className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                      x.done ? 'border-accent/50 bg-accent/10 text-text' : 'border-border text-textDim line-through'
                    }`}
                  >
                    {setText(x, ex.measure)}
                  </span>
                ))}
              </div>
              {notes.map(([n, note]) => (
                <p key={n} className="mt-1 break-words text-xs italic text-text">
                  {fill(t('Set {n}'), { n })}: “{note}”
                </p>
              ))}
            </li>
          );
        })}
        {st.blocks.map((b, i) => (
          <li key={`b-${i}`} className="bg-panel px-4 py-3 text-sm text-text">
            {blockLine(b, st, t, lang)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function blockLine(b: BlockLog, st: StrengthLog, t: (k: string) => string, lang: string): string {
  const moves = (ms: { id: string; name?: string }[]) => ms.map((m) => exerciseName(m, lang)).join(', ');
  if (b.kind === 'timed') {
    const what = st.machine ? t(MACHINE[st.machine] ?? st.machine) : t('Timed');
    const c = st.cardio;
    const out = c
      ? ` · ${Math.round(c.m)} m${c.watts ? ` · ${Math.round(c.watts)} W` : ''}${c.rate ? ` · ${Math.round(c.rate)}/min` : ''}`
      : '';
    return `${what} · ${fmtDuration(b.sec)}${out}`;
  }
  if (b.kind === 'circuit') {
    return `${t('Circuit')} · ${fill(t('{n} rounds'), { n: b.rounds })} · ${fmtDuration(b.workSec)} / ${fmtDuration(b.restSec)} · ${moves(b.moves)}`;
  }
  const result = b.forTime
    ? `${t('For time')} · ${fmtDuration(b.sec)}`
    : `${t('AMRAP')} ${fmtDuration(b.capSec)} · ${fill(t('{n} rounds'), { n: b.rounds })}${b.extraReps ? ` + ${b.extraReps}` : ''}`;
  return `${result} · ${moves(b.moves)}`;
}

/** The athlete's own note on this one dive (the app's per-dive remarks), as a
 *  wrapping line under the stats so it stays readable on a phone. */
function DiveRemark({ remarks }: { remarks: unknown }) {
  if (typeof remarks !== 'string' || remarks.trim() === '') return null;
  return <p className="mt-1 break-words text-sm italic text-text">“{remarks.trim()}”</p>;
}

/** Per-hold notes from a dry session's block timeline. Hold numbers count Hold
 *  blocks only, matching the app's hold-detail screen. */
function HoldNotes({ blockTimeline, t }: { blockTimeline: unknown; t: (k: string) => string }) {
  const notes = holdNotes(blockTimeline);
  if (notes.length === 0) return null;
  return (
    <ul className="board divide-y divide-border overflow-hidden">
      {notes.map((h) => (
        <li key={h.holdNumber} className="flex gap-4 bg-panel px-4 py-3">
          <div className="w-16 shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-textDim">
              {fill(t('Hold {n}'), { n: h.holdNumber })}
            </div>
            <div className="font-heading tracking-wide text-accent">{fmtSec(h.seconds)}</div>
          </div>
          <p className="min-w-0 flex-1 break-words text-sm italic text-text">“{h.text}”</p>
        </li>
      ))}
    </ul>
  );
}

function DepthDives({ dives, t }: { dives: AnyDive[]; t: (k: string) => string }) {
  if (dives.length === 0)
    return <p className="text-sm text-textDim">{t('No dives recorded.')}</p>;
  return (
    <ul className="board divide-y divide-border overflow-hidden">
      {dives.map((d, idx) => (
        <DepthDiveRow key={idx} dive={d} idx={idx} t={t} />
      ))}
    </ul>
  );
}

function DepthDiveRow({ dive, idx, t }: { dive: AnyDive; idx: number; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  const profile = dive.profile;
  const hasProfile = Array.isArray(profile) && profile.length > 1;
  // Extract once when expanded; drives both the tracks and the speed bands.
  const diveData = useMemo(
    () => (open && hasProfile ? extractDiveData(dive as never) : null),
    [open, hasProfile, dive],
  );
  const depth = typeof dive.depth === 'number' ? dive.depth : null;
  const meta = [
    fmtSec(dive.diveTime as number),
    `${t('descent')} ${fmtSec(dive.descentTime as number)}`,
    `${t('hang')} ${fmtSec(dive.hangTime as number)}`,
    `${t('ascent')} ${fmtSec(dive.ascentTime as number)}`,
    typeof dive.discipline === 'string' ? dive.discipline : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={() => hasProfile && setOpen((o) => !o)}
        className={`flex w-full items-center gap-4 bg-panel px-4 py-3 text-left transition-colors ${hasProfile ? 'hover:bg-abyss' : 'cursor-default'}`}
      >
        <div className="w-16 shrink-0 text-[10px] uppercase tracking-widest text-textDim">
          {t('Dive')} {idx + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-lg tracking-wide text-accent">
            {depth != null ? `${depth}m` : '–'}
          </div>
          <div className="text-xs text-textDim">{meta}</div>
          <DiveRemark remarks={dive.remarks} />
        </div>
        {hasProfile && <span className="text-textDim">{open ? '▲' : '▾'}</span>}
      </button>
      {open && hasProfile && diveData && (
        <div className="chart-well p-3">
          <Suspense fallback={chartFallback}>
            <DepthDiveTracks
              data={diveData}
              contractionOnset={(dive.contractionOnset as never) ?? null}
              showAlarms={false}
              speedStep={0}
              speedSmooth={0}
              groupId={`att-d${idx}`}
            />
          </Suspense>
          <SpeedBands data={diveData} />
        </div>
      )}
    </li>
  );
}

function PoolDives({ dives, t }: { dives: AnyDive[]; t: (k: string) => string }) {
  if (dives.length === 0)
    return <p className="text-sm text-textDim">{t('No dives recorded.')}</p>;
  return (
    <ul className="board divide-y divide-border overflow-hidden">
      {dives.map((d, idx) => (
        <PoolDiveRow key={idx} dive={d} idx={idx} t={t} />
      ))}
    </ul>
  );
}

function PoolDiveRow({ dive, idx, t }: { dive: AnyDive; idx: number; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  const profile = dive.profile;
  const hrProfile = dive.hrProfile;
  // The motion trace counts as expandable content in its own right. On a DNF
  // it is often the ONLY thing there — watch imports carry no `profile`, and a
  // dive with no HR strap would otherwise render as a dead row with the whole
  // swim sitting unread inside it.
  const traceData = useMemo(() => extractPoolTraceData(dive as never), [dive]);
  const diveData = useMemo(() => (open ? extractPoolDiveData(dive as never) : null), [open, dive]);
  // PoolDiveTracks owns an empty state of its own; rendering it beside a trace
  // would tell the coach there is no data directly above the data.
  const hasTracks = diveData != null && (diveData.hasHR || diveData.hasDepth || diveData.hasSpeed);
  const hasProfile =
    (Array.isArray(profile) && profile.length > 1) ||
    (Array.isArray(hrProfile) && hrProfile.length > 1) ||
    traceData != null;
  const disc = typeof dive.discipline === 'string' ? dive.discipline : '';
  const isSta = disc === 'STA';
  const primary = isSta
    ? fmtSec(dive.diveTime as number)
    : `${typeof dive.distance === 'number' ? dive.distance : 0}m`;
  const meta = [
    !isSta ? fmtSec(dive.diveTime as number) : '',
    typeof dive.turns === 'number' && dive.turns > 0
      ? `${dive.turns} ${t(dive.turns === 1 ? 'turn' : 'turns')}`
      : '',
    `SI ${fmtSec(dive.si as number)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={() => hasProfile && setOpen((o) => !o)}
        className={`flex w-full items-center gap-4 bg-panel px-4 py-3 text-left transition-colors ${hasProfile ? 'hover:bg-abyss' : 'cursor-default'}`}
      >
        <div className="w-16 shrink-0 text-[10px] uppercase tracking-widest text-textDim">
          {t('Dive')} {idx + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-lg tracking-wide text-accent">
            {disc ? `${disc} · ` : ''}
            {primary}
          </div>
          <div className="text-xs text-textDim">{meta}</div>
          <DiveRemark remarks={dive.remarks} />
        </div>
        {hasProfile && <span className="text-textDim">{open ? '▲' : '▾'}</span>}
      </button>
      {open && hasProfile && (
        <div className="chart-well space-y-5 p-3">
          {hasTracks && diveData && (
            <Suspense fallback={chartFallback}>
              <PoolDiveTracks data={diveData} groupId={`att-p${idx}`} />
            </Suspense>
          )}
          {traceData && (
            <Suspense fallback={chartFallback}>
              <PoolSignalTracks data={traceData} groupId={`att-sig${idx}`} />
            </Suspense>
          )}
          {!hasTracks && !traceData && (
            <p className="py-6 text-center text-sm text-textDim">
              {t('No profile data recorded for this dive.')}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
