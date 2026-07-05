/**
 * AttachedSessionDetail — rich render of the logbook session an athlete attached
 * to a coach-plan completion. The blob is the app's full Session (depth/pool/dry)
 * with per-dive 1 Hz profiles, so we reuse the analyzer's ECharts track
 * components (depth/HR/speed/temp, pool, dry SpO₂/HR/block timeline) ported into
 * this repo. The charts pull in echarts (~1 MB), so they're lazy-loaded — the
 * main bundle stays lean and echarts only downloads when a coach expands a dive.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { extractDiveData } from '../lib/analytics/diveProfile';
import { SpeedBands } from './SpeedBands';
import { extractPoolDiveData } from '../lib/analytics/poolDiveProfile';
import { extractDrySessionData } from '../lib/analytics/drySessionProfile';
import type { Json } from '../lib/supabase/coachData';

const DepthDiveTracks = lazy(() =>
  import('./charts/DepthDiveTracks').then((m) => ({ default: m.DepthDiveTracks })),
);
const PoolDiveTracks = lazy(() =>
  import('./charts/PoolDiveTracks').then((m) => ({ default: m.PoolDiveTracks })),
);
const DrySessionTracks = lazy(() =>
  import('./charts/DrySessionTracks').then((m) => ({ default: m.DrySessionTracks })),
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
  poolType?: string;
  // dry
  cyclesCount?: number;
  dryActivity?: string | null;
  dives?: AnyDive[];
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

      {mode === 'depth' && <DepthDives dives={s.dives ?? []} t={t} />}
      {mode === 'pool' && <PoolDives dives={s.dives ?? []} t={t} />}
      {mode === 'dry' && (
        <Suspense fallback={chartFallback}>
          <DrySessionTracks data={extractDrySessionData(s as never)} groupId="att-dry" />
        </Suspense>
      )}

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
  if (typeof s.date === 'string') push(t('Date'), new Date(s.date).toLocaleDateString());
  push(t('Type'), s.mode);
  if (s.mode === 'depth') {
    push(t('Max depth'), s.maxDepth, ' m');
    push(t('Discipline'), s.discipline);
    if (Array.isArray(s.dives)) push(t('Dives'), s.dives.length);
    push(t('Water temp'), s.waterTemp != null ? s.waterTemp : undefined, ' °C');
  } else if (s.mode === 'pool') {
    push(t('Distance'), s.totalDistance, ' m');
    if (Array.isArray(s.dives)) push(t('Dives'), s.dives.length);
    push(t('Pool'), s.poolType && s.poolType !== '-' ? s.poolType : undefined);
  } else if (s.mode === 'dry') {
    push(t('Activity'), s.dryActivity);
    push(t('Cycles'), s.cyclesCount);
  }
  push(t('Duration'), s.duration);
  if (typeof s.rating === 'number') push(t('Effort'), `${s.rating}/5`);

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

function DepthDives({ dives, t }: { dives: AnyDive[]; t: (k: string) => string }) {
  if (dives.length === 0)
    return <p className="text-sm text-textDim">{t('No dives recorded.')}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
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
        </div>
        {hasProfile && <span className="text-textDim">{open ? '▲' : '▾'}</span>}
      </button>
      {open && hasProfile && diveData && (
        <div className="border-t border-border bg-deep p-3">
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
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
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
  const hasProfile =
    (Array.isArray(profile) && profile.length > 1) ||
    (Array.isArray(hrProfile) && hrProfile.length > 1);
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
        </div>
        {hasProfile && <span className="text-textDim">{open ? '▲' : '▾'}</span>}
      </button>
      {open && hasProfile && (
        <div className="border-t border-border bg-deep p-3">
          <Suspense fallback={chartFallback}>
            <PoolDiveTracks data={extractPoolDiveData(dive as never)} groupId={`att-p${idx}`} />
          </Suspense>
        </div>
      )}
    </li>
  );
}
