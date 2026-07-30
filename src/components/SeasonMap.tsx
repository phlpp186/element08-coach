/**
 * Season map — the macro editor for season plans. A paintable timeline above
 * the phase accordion: a phase band resized by dragging the boundaries between
 * segments (whole weeks move, sessions travel with their week), an intensity
 * lane drawn on like an equalizer (writes week.intensity 1-10), preset curves,
 * and a fit action when the planned length drifts from the competition date.
 * Clicking a phase or week opens the matching accordion card below (anchor
 * `phase-<id>`), so the map acts as overview + remote control; all edits go
 * through the parent's setPhases and stay inside the existing BuilderPlan
 * model (no wire-format change).
 */
import { useMemo, useRef } from 'react';
import {
  MESO_LABEL,
  addDays,
  movePhaseBoundary,
  intensityPreset,
  applyIntensityCurve,
  fitPhasesToWeeks,
  generateSeasonSkeleton,
  type BuilderPhase,
  type BuilderPlan,
  type BuilderWeek,
  type IntensityPreset,
} from '../lib/e08plan';
import { daysBetween } from '../lib/planHelpers';
import { PHASE_HEX, PHASE_INK, hexTint } from '../lib/phaseColor';
import { useT } from '../i18n';

const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: 'short' });
const PRESETS: { id: IntensityPreset; label: string }[] = [
  { id: 'linear', label: 'Linear build' },
  { id: 'wave', label: 'Wave 3:1' },
  { id: 'double', label: 'Double peak' },
];

export function SeasonMap({
  plan,
  firstMonday,
  openPhase,
  setOpenPhase,
  setPhases,
}: {
  plan: BuilderPlan;
  firstMonday: string;
  openPhase: string | null;
  setOpenPhase: (id: string | null) => void;
  setPhases: (phases: BuilderPhase[]) => void;
}) {
  const t = useT();
  const phases = plan.phases;
  // One entry per week in global order: the owning phase + the week itself.
  const flat = useMemo(
    () => phases.flatMap((ph) => ph.weeks.map((wk): { ph: BuilderPhase; wk: BuilderWeek } => ({ ph, wk }))),
    [phases],
  );
  const totalWeeks = flat.length;
  const compWeeks = plan.competitionDate
    ? Math.max(1, Math.ceil(daysBetween(plan.startDate, plan.competitionDate) / 7))
    : null;

  // Live phases for pointer handlers (a drag spans many re-renders).
  const phasesRef = useRef(phases);
  phasesRef.current = phases;
  const bandRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const paintingRef = useRef(false);

  const jumpToPhase = (id: string) => {
    setOpenPhase(id);
    // After the accordion opens, bring the card into view.
    requestAnimationFrame(() => {
      document.getElementById(`phase-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const startBoundaryDrag = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    const band = bandRef.current;
    if (!band) return;
    const rect = band.getBoundingClientRect();
    let before = 0;
    for (let k = 0; k < i; k++) before += phasesRef.current[k].weeks.length;
    const total = phasesRef.current.reduce((a, p) => a + p.weeks.length, 0);
    const onMove = (ev: PointerEvent) => {
      const wk = Math.round(((ev.clientX - rect.left) / rect.width) * total);
      setPhases(movePhaseBoundary(phasesRef.current, i, wk - before));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const paintAt = (clientX: number, clientY: number) => {
    const lane = laneRef.current;
    const current = phasesRef.current;
    const total = current.reduce((a, p) => a + p.weeks.length, 0);
    if (!lane || !total) return;
    const rect = lane.getBoundingClientRect();
    const w = Math.max(0, Math.min(total - 1, Math.floor(((clientX - rect.left) / rect.width) * total)));
    const v = Math.max(1, Math.min(10, Math.round((1 - (clientY - rect.top) / rect.height) * 10)));
    let g = 0;
    let changed = false;
    const next = current.map((ph) => ({
      ...ph,
      weeks: ph.weeks.map((wk) => {
        const hit = g++ === w && wk.intensity !== v;
        if (hit) changed = true;
        return hit ? { ...wk, intensity: v } : wk;
      }),
    }));
    if (changed) setPhases(next);
  };

  const suggest = () => {
    const sessions = flat.reduce((a, { wk }) => a + wk.sessions.length, 0);
    if (
      sessions > 0 &&
      !window.confirm(t('Replace the current phases with a suggested layout? All sessions in them will be removed.'))
    )
      return;
    const next = generateSeasonSkeleton(compWeeks ?? (totalWeeks || 12));
    setPhases(next);
    setOpenPhase(next[0]?.id ?? null);
  };

  const fitToComp = () => {
    if (compWeeks == null) return;
    const { phases: next, sessionsDropped } = fitPhasesToWeeks(phases, compWeeks);
    if (
      sessionsDropped > 0 &&
      !window.confirm(`${t('Shortening the season removes weeks that contain sessions.')} (${sessionsDropped}) ${t('Continue?')}`)
    )
      return;
    setPhases(next);
  };

  if (totalWeeks === 0) {
    return (
      <div className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[12rem]">
          <div className="font-heading">{t('Season map')}</div>
          <div className="text-sm text-textDim">
            {compWeeks != null
              ? `${compWeeks} ${t(compWeeks === 1 ? 'week' : 'weeks')} ${t('to the competition.')}`
              : t('Set a competition date, or start from a suggested layout.')}
          </div>
        </div>
        <button onClick={suggest} className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent">
          {t('Suggest phases')}
        </button>
      </div>
    );
  }

  // Month tick when a week's Monday enters a new month.
  const monthLabels: (string | null)[] = [];
  let prevMonth = '';
  for (let w = 0; w < totalWeeks; w++) {
    const label = MONTH_FMT.format(new Date(`${addDays(firstMonday, w * 7)}T00:00:00Z`));
    monthLabels.push(label === prevMonth ? null : label);
    prevMonth = label;
  }

  let acc = 0;
  const boundaries: { i: number; leftPct: number }[] = [];
  for (let i = 0; i < phases.length - 1; i++) {
    acc += phases[i].weeks.length;
    boundaries.push({ i, leftPct: (acc / totalWeeks) * 100 });
  }

  const mismatch = compWeeks != null && compWeeks !== totalWeeks;

  return (
    <div className="glass-card rounded-xl p-4 space-y-2 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 min-w-[560px]">
        <div className="font-heading flex-1">{t('Season map')}</div>
        <span className="text-xs rounded-full border border-accent/45 bg-accent/10 text-accent px-3 py-1 tabular-nums">
          {totalWeeks} {t(totalWeeks === 1 ? 'week' : 'weeks')}
        </span>
        {mismatch && (
          <button
            onClick={fitToComp}
            className="text-xs rounded-full border border-amber/50 bg-amber/10 text-amber px-3 py-1 hover:border-amber tabular-nums"
            title={t('Grow or shrink the season so it ends on the competition date.')}
          >
            {t('Comp in')} {compWeeks} {t('wk')} · {t('Fit')}
          </button>
        )}
        <button
          onClick={suggest}
          className="text-xs text-textDim border border-border rounded-lg px-2.5 py-1 hover:border-accent hover:text-accent"
        >
          {t('Suggest phases')}
        </button>
      </div>

      <div className="min-w-[560px] select-none">
        {/* Phase band */}
        <div ref={bandRef} className="relative flex h-11 rounded-lg">
          {phases.map((ph) => {
            const hex = PHASE_HEX[ph.type];
            const active = openPhase === ph.id;
            return (
              <button
                key={ph.id}
                onClick={() => jumpToPhase(ph.id)}
                style={{
                  width: `${(ph.weeks.length / totalWeeks) * 100}%`,
                  background: `linear-gradient(180deg, ${hexTint(hex, 0.95)}, ${hexTint(hex, 0.75)})`,
                  color: PHASE_INK,
                }}
                className={`relative h-full min-w-0 px-2 text-left first:rounded-l-lg last:rounded-r-lg ${
                  active ? 'ring-2 ring-text/80 z-[1]' : ''
                }`}
                title={`${ph.name || t(MESO_LABEL[ph.type])} · ${ph.weeks.length} ${t('wk')}`}
              >
                <span className="block truncate text-xs font-bold leading-tight">
                  {ph.name || t(MESO_LABEL[ph.type])}
                </span>
                <span className="block text-[10px] opacity-80 tabular-nums leading-tight">
                  {ph.weeks.length} {t('wk')}
                </span>
              </button>
            );
          })}
          {boundaries.map(({ i, leftPct }) => (
            <div
              key={i}
              onPointerDown={(e) => startBoundaryDrag(e, i)}
              style={{ left: `${leftPct}%` }}
              className="absolute -top-1.5 -bottom-1.5 w-3.5 -ml-[7px] z-[2] cursor-col-resize flex items-center justify-center group touch-none"
            >
              <div className="w-1 h-full rounded bg-text/60 border border-abyss/60 group-hover:bg-text" />
            </div>
          ))}
        </div>

        {/* Week ruler */}
        <div className="flex mt-1.5">
          {flat.map(({ ph }, w) => (
            <button
              key={w}
              onClick={() => jumpToPhase(ph.id)}
              className="flex-1 min-w-0 text-center border-l border-border/40 first:border-l-0 text-textDim hover:text-accent"
            >
              <span className={`block text-[10px] font-bold text-text ${monthLabels[w] ? '' : 'invisible'}`}>
                {monthLabels[w] ?? '.'}
              </span>
              <span className="block text-[10px] tabular-nums">W{w + 1}</span>
            </button>
          ))}
        </div>

        {/* Intensity lane */}
        <div
          ref={laneRef}
          onPointerDown={(e) => {
            paintingRef.current = true;
            paintAt(e.clientX, e.clientY);
            // Keep the stroke alive when the pointer leaves the lane mid-draw.
            // Capture can fail for an already-released pointer; painting still
            // works without it, so never let it kill the gesture.
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* draw uncaptured */
            }
          }}
          onPointerMove={(e) => {
            if (!paintingRef.current) return;
            // Uncaptured strokes never see the outside pointerup; the released
            // button is the reliable end-of-stroke signal either way.
            if (e.buttons === 0) {
              paintingRef.current = false;
              return;
            }
            paintAt(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            paintingRef.current = false;
          }}
          className="relative flex items-end h-24 mt-2 rounded-lg border border-border bg-abyss cursor-crosshair touch-none"
        >
          {[2, 4, 6, 8].map((v) => (
            <div key={v} style={{ bottom: `${v * 10}%` }} className="absolute inset-x-0 h-px bg-text/5 pointer-events-none" />
          ))}
          {flat.map(({ ph, wk }, w) => (
            <div key={w} className="flex-1 flex items-end justify-center h-full pointer-events-none">
              <div
                style={{ height: `${wk.intensity * 10}%`, background: hexTint(PHASE_HEX[ph.type], 0.85) }}
                className="w-[62%] rounded-t min-h-[3px]"
              />
            </div>
          ))}
        </div>
        <div className="flex mt-0.5">
          {flat.map(({ wk }, w) => (
            <span key={w} className="flex-1 text-center text-[10px] text-textDim tabular-nums">
              {wk.intensity}
            </span>
          ))}
        </div>

        {/* Presets + hint */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs text-textDim">{t('Intensity presets:')}</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPhases(applyIntensityCurve(phases, intensityPreset(p.id, totalWeeks)))}
              className="text-xs rounded-full border border-border bg-abyss px-3 py-1 hover:border-accent hover:text-accent"
            >
              {t(p.label)}
            </button>
          ))}
        </div>
        <p className="text-xs text-textDim mt-1.5">
          {t('Drag a boundary to resize phases (weeks keep their sessions), draw across the bars to set weekly intensity, click a phase or week to open it below.')}
        </p>
      </div>
    </div>
  );
}
