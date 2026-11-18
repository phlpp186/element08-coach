/**
 * Turning a template's targets into one athlete's numbers.
 *
 * PBs come from athlete_profiles (what the athlete published: manual entries
 * win over auto-derived ones, see athleteProfile.mergePBs). A relative target
 * with no PB in its discipline cannot be resolved; the coach then sets that
 * athlete's value by hand at send time (an override), and nothing is sent
 * until every target has a number.
 *
 * Relative values round DOWN (whole metres, 5 s steps): a target derived from a
 * PB should never land above what the coach asked for.
 */
import { fmtFixed, mToFt, type AthletePB } from './deps';
import {
  blockTarget,
  type CoachTemplate,
  type TemplateExercise,
  type TemplateTarget,
} from './model';

export type TargetUnit = 'm' | 's';

/** discipline → best value (m or s). */
export type PBMap = Record<string, number>;

/** One value per discipline: a manual PB wins over an auto one, otherwise the
 *  higher value. */
export function pbMapFrom(pbs: AthletePB[]): PBMap {
  const out: PBMap = {};
  const manual = new Set<string>();
  for (const p of pbs) {
    if (!(p.value > 0)) continue;
    const isManual = !p.auto;
    if (manual.has(p.discipline) && !isManual) continue;
    if (isManual && !manual.has(p.discipline)) {
      manual.add(p.discipline);
      out[p.discipline] = p.value;
      continue;
    }
    if (out[p.discipline] == null || p.value > out[p.discipline]) out[p.discipline] = p.value;
  }
  return out;
}

/** The PB discipline a target is relative to, or null when the exercise has
 *  no target. A dry hold target is relative to STA. */
export function targetDiscipline(ex: TemplateExercise): string | null {
  if (ex.kind === 'depth' || ex.kind === 'pool') return ex.discipline;
  if (ex.kind === 'dry' && ex.holdTarget) return 'STA';
  return null;
}

export function targetUnit(ex: TemplateExercise): TargetUnit {
  if (ex.kind === 'pool' && ex.discipline === 'STA') return 's';
  if (ex.kind === 'dry') return 's';
  return 'm';
}

function roundDown(v: number, unit: TargetUnit): number {
  // The epsilon keeps 80% of 40 m at 32, not 31.999... → 31.
  if (unit === 'm') return Math.floor(v + 1e-9);
  return Math.floor((v + 1e-9) / 5) * 5;
}

/** The concrete value of a target for an athlete with PB `pb` (undefined =
 *  no PB), or null when it cannot be resolved (relative without a PB, or a
 *  "PB minus" that would be zero or below). */
export function resolveTarget(
  target: TemplateTarget,
  pb: number | undefined,
  unit: TargetUnit,
): number | null {
  if (!Number.isFinite(target.value)) return null;
  if (target.kind === 'fixed') return target.value > 0 ? target.value : null;
  if (pb == null || !(pb > 0)) return null;
  const raw = target.kind === 'pct' ? (pb * target.value) / 100 : pb - target.value;
  const v = roundDown(raw, unit);
  return v > 0 ? v : null;
}

export interface ResolvedTarget {
  blockId: string;
  discipline: string;
  unit: TargetUnit;
  target: TemplateTarget;
  /** The athlete's value, from the PB or the coach's override. */
  value: number | null;
  /** True when the coach typed this athlete's value by hand. */
  manual: boolean;
}

/** Every target in the template, resolved for one athlete. `overrides` are
 *  hand-set values (blockId → m or s) and always win. */
export function resolveTemplate(
  template: CoachTemplate,
  pbs: PBMap,
  overrides: Record<string, number> = {},
): ResolvedTarget[] {
  const out: ResolvedTarget[] = [];
  for (const b of template.blocks) {
    const target = blockTarget(b.exercise);
    const discipline = targetDiscipline(b.exercise);
    if (!target || !discipline) continue;
    const unit = targetUnit(b.exercise);
    const o = overrides[b.id];
    const manual = typeof o === 'number' && o > 0;
    out.push({
      blockId: b.id,
      discipline,
      unit,
      target,
      value: manual ? o : resolveTarget(target, pbs[discipline], unit),
      manual,
    });
  }
  return out;
}

/** The targets that still need a hand-set value for this athlete. */
export function missingTargets(resolved: ResolvedTarget[]): ResolvedTarget[] {
  return resolved.filter((r) => r.value == null);
}

/** "32 m" / "105 ft" / "2:30". Metres show whole numbers, feet are rounded
 *  from the metric value (so a value typed in feet reads back unchanged). */
export function formatValue(value: number, unit: TargetUnit, imperial: boolean): string {
  if (unit === 's') {
    const t = Math.round(value);
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }
  if (imperial) return `${Math.round(mToFt(value))} ft`;
  const r = Math.round(value * 10) / 10;
  return `${Number.isInteger(r) ? r : fmtFixed(r, 1)} m`;
}

/** A distance/depth typed in the coach's display unit, back to metres. */
export function toMetres(displayValue: number, imperial: boolean): number {
  return imperial ? displayValue / 3.28084 : displayValue;
}

/** Metres to the number shown in an input in the coach's display unit. */
export function fromMetres(m: number, imperial: boolean): number {
  return imperial ? Math.round(mToFt(m)) : Math.round(m * 10) / 10;
}
