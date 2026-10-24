/**
 * WeekStrip — a plan's weeks as a row of small bars standing on one line:
 * taller and stronger for a harder week (intensity 1-10), in the phase colour
 * for a season plan, the accent otherwise. Long plans get thinner gaps so a
 * whole season still fits its column.
 */
import type { StripWeek } from '../../lib/libraryInsights';
import { PHASE_HEX, hexTint } from '../../lib/phaseColor';

const level = (intensity: number) => (Math.min(10, Math.max(1, intensity)) - 1) / 9;

export function WeekStrip({
  weeks,
  height = 14,
  current,
}: {
  weeks: StripWeek[];
  height?: number;
  /** 1-based week running today, outlined. */
  current?: number | null;
}) {
  if (!weeks.length) return null;
  const gap = weeks.length > 16 ? 1 : 2;
  return (
    <span className="flex w-full items-end overflow-hidden" style={{ height, gap }} aria-hidden="true">
      {weeks.map((w, i) => {
        const l = level(w.intensity);
        const a = 0.45 + l * 0.55;
        return (
          <span
            key={i}
            className={`min-w-px flex-1 rounded-t-[2px] ${current === i + 1 ? 'outline outline-2 outline-offset-1 outline-text' : ''}`}
            style={{
              height: `${Math.round(35 + l * 65)}%`,
              background: w.phase ? hexTint(PHASE_HEX[w.phase], a) : `rgb(var(--c-accent) / ${a.toFixed(2)})`,
            }}
          />
        );
      })}
    </span>
  );
}
