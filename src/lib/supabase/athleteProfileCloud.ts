/**
 * Parse + format the cloud `athlete_profiles` JSONB (pbs / goals) into the shape
 * the app writes — mirrors Deeptimerapp/src/services/coachStudent/athleteProfile.ts.
 * Student-authored, coach-readable. Values are metric (metres / seconds).
 */
import type { Json } from './coachData';

export type PBUnit = 'm' | 's';
export interface AthletePB {
  discipline: string;
  unit: PBUnit;
  value: number;
  auto?: boolean;
}
export interface AthleteGoal {
  id: string;
  text: string;
  done?: boolean;
}

const UNIT_BY_DISC: Record<string, PBUnit> = {
  CWT: 'm', CWTB: 'm', CNF: 'm', FIM: 'm', VWT: 'm', NLT: 'm',
  DYN: 'm', DYNB: 'm', DNF: 'm', STA: 's',
};

/** "92m" or "6:30". */
export function formatPB(pb: { unit: PBUnit; value: number }): string {
  if (pb.unit === 's') {
    const m = Math.floor(pb.value / 60);
    const s = Math.round(pb.value % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${Number.isInteger(pb.value) ? pb.value : pb.value.toFixed(1)}m`;
}

export function parsePBs(json: Json | null | undefined): AthletePB[] {
  if (!Array.isArray(json)) return [];
  const out: AthletePB[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json>;
    const discipline = typeof o.discipline === 'string' ? o.discipline : null;
    const value = typeof o.value === 'number' ? o.value : null;
    if (!discipline || value == null || !Number.isFinite(value) || value <= 0) continue;
    const unit: PBUnit =
      o.unit === 's' || o.unit === 'm' ? o.unit : (UNIT_BY_DISC[discipline] ?? 'm');
    out.push({ discipline, unit, value, auto: o.auto === true });
  }
  return out;
}

export function parseGoals(json: Json | null | undefined): AthleteGoal[] {
  if (!Array.isArray(json)) return [];
  const out: AthleteGoal[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, Json>;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) continue;
    const id = typeof o.id === 'string' && o.id ? o.id : `g-${out.length}`;
    out.push({ id, text, done: o.done === true });
  }
  return out;
}
