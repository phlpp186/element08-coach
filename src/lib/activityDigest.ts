/**
 * The Activity page's triage pieces (Philipp's option A with C's digest,
 * 2026-10-24), PURE: a small bar picture of each attached session, the feed
 * filters, and the "since you last looked" digest (new PBs, remarks to read,
 * hard sessions).
 *
 * A session counts as a PB when one of its dives reaches the athlete's
 * effective PB in that discipline (athlete_profiles.pbs, which the app keeps as
 * auto-derived bests merged with manual overrides). Bests are taken with the
 * app's computeAutoPBs rules (athleteProfile.ts): depth disciplines by depth,
 * pool DYN/DYNB/DNF by distance, pool STA by time, excluded dives skipped, dry
 * holds not counted.
 */
import { EFFORT_FLOOR, type FeedEntry } from './activity';
import { sessionNoteLines } from './sessionNotes';
import type { AthletePB, PBUnit } from './supabase/athleteProfileCloud';

const DEPTH_DISC = new Set(['CWT', 'CWTB', 'CNF', 'FIM', 'VWT', 'NLT']);
const POOL_DIST = new Set(['DYN', 'DYNB', 'DNF']);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

type Rec = Record<string, unknown>;
const divesOf = (s: Rec): Rec[] =>
  (Array.isArray(s.dives) ? (s.dives as Rec[]) : []).filter((d) => d && d.diveType !== 'excluded');

export interface SessionBest {
  discipline: string;
  unit: PBUnit;
  value: number;
}

/** The best result per PB discipline in one attached session. */
export function sessionBests(blob: unknown): SessionBest[] {
  const s = (blob ?? {}) as Rec;
  const best = new Map<string, SessionBest>();
  const bump = (discipline: string, unit: PBUnit, v: number | null) => {
    if (v == null) return;
    const cur = best.get(discipline);
    if (!cur || v > cur.value) best.set(discipline, { discipline, unit, value: v });
  };
  for (const d of divesOf(s)) {
    const disc = typeof d.discipline === 'string' ? d.discipline : '';
    if (s.mode === 'depth' && DEPTH_DISC.has(disc)) bump(disc, 'm', num(d.depth));
    else if (s.mode === 'pool' && disc === 'STA') bump('STA', 's', num(d.diveTime));
    else if (s.mode === 'pool' && POOL_DIST.has(disc)) bump(disc, 'm', num(d.distance));
  }
  return [...best.values()];
}

/** Disciplines where this session reached the athlete's current PB. A tiny
 *  tolerance keeps a 42.0 m PB stored as 41.99 from slipping through. */
export function sessionPBs(blob: unknown, pbs: readonly AthletePB[]): SessionBest[] {
  if (!pbs.length) return [];
  const byDisc = new Map(pbs.map((p) => [p.discipline, p.value]));
  return sessionBests(blob).filter((b) => {
    const pb = byDisc.get(b.discipline);
    return pb != null && b.value >= pb - 0.05;
  });
}

export interface SessionBars {
  mode: 'depth' | 'pool' | 'dry';
  /** One value per dive or hold, in session order (m, m or s). */
  values: number[];
}

/** One bar per dive (depth or distance; STA by time) or per dry hold, for the
 *  feed card's picture. Null when there is nothing to draw. */
export function sessionBars(blob: unknown): SessionBars | null {
  const s = (blob ?? {}) as Rec;
  let values: number[] = [];
  if (s.mode === 'depth') {
    values = divesOf(s).map((d) => num(d.depth) ?? 0);
  } else if (s.mode === 'pool') {
    values = divesOf(s).map((d) => (d.discipline === 'STA' ? num(d.diveTime) : num(d.distance)) ?? 0);
  } else if (s.mode === 'dry') {
    const tl = Array.isArray(s.blockTimeline) ? (s.blockTimeline as Rec[]) : [];
    values = tl.filter((b) => b?.type === 'Hold').map((b) => num(b.seconds) ?? 0);
  } else {
    return null;
  }
  return values.some((v) => v > 0) ? { mode: s.mode, values } : null;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export type FeedFilter = 'all' | 'new' | 'remarks' | 'hard';

export const hasRemark = (e: FeedEntry): boolean => !!e.remarks || sessionNoteLines(e.session).length > 0;
export const isHard = (e: FeedEntry): boolean => e.rating != null && e.rating >= EFFORT_FLOOR;

export function matchesFilter(e: FeedEntry, f: FeedFilter, isNew: (e: FeedEntry) => boolean): boolean {
  if (f === 'new') return isNew(e);
  if (f === 'remarks') return hasRemark(e);
  if (f === 'hard') return isHard(e);
  return true;
}

// ─── Digest ──────────────────────────────────────────────────────────────────

export interface Digest {
  /** Entries that reached a PB, newest first, with the disciplines. */
  pbs: { entry: FeedEntry; pbs: SessionBest[] }[];
  /** Entries with the athlete's words in them (comment or a dive/hold note). */
  remarks: FeedEntry[];
  /** Entries rated EFFORT_FLOOR or harder. */
  hard: FeedEntry[];
  /** What the digest covers: entries new since the seen stamp, or (nothing
   *  new) the last 7 days, so the row is never empty for a returning coach. */
  scope: 'new' | 'week';
}

export function buildDigest(input: {
  feed: readonly FeedEntry[];
  pbsByStudent: ReadonlyMap<string, AthletePB[]>;
  isNew: (e: FeedEntry) => boolean;
  nowMs: number;
}): Digest {
  const { feed, pbsByStudent, isNew, nowMs } = input;
  const fresh = feed.filter(isNew);
  const weekAgo = nowMs - 7 * 86_400_000;
  const scope: Digest['scope'] = fresh.length ? 'new' : 'week';
  const pool = fresh.length ? fresh : feed.filter((e) => Date.parse(e.at) >= weekAgo);
  const pbs: Digest['pbs'] = [];
  for (const entry of pool) {
    const hit = sessionPBs(entry.session, pbsByStudent.get(entry.studentId) ?? []);
    if (hit.length) pbs.push({ entry, pbs: hit });
  }
  return { pbs, remarks: pool.filter(hasRemark), hard: pool.filter(isHard), scope };
}
