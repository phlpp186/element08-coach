/**
 * What an athlete wrote INSIDE an attached logbook session, below the session
 * level: a remark per depth/pool dive and a note per dry hold. The blob is the
 * app's Session object as attached to a completion, so every field is read
 * defensively (older app builds, other modes, hand-edited data).
 */

/** A dive's remark. `index` is 0-based, so "Dive 1" is index 0. */
export interface DiveRemark {
  index: number;
  text: string;
}

/** A dry hold's note. `holdNumber` is 1-based among the Hold blocks only (the
 *  same count the app's hold-detail screen uses for holdIdx + 1). */
export interface HoldNote {
  holdNumber: number;
  seconds: number | null;
  text: string;
}

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function diveRemarks(dives: unknown): DiveRemark[] {
  if (!Array.isArray(dives)) return [];
  const out: DiveRemark[] = [];
  dives.forEach((d, index) => {
    const text = clean((d as { remarks?: unknown } | null)?.remarks);
    if (text) out.push({ index, text });
  });
  return out;
}

export function holdNotes(blockTimeline: unknown): HoldNote[] {
  if (!Array.isArray(blockTimeline)) return [];
  const out: HoldNote[] = [];
  let hold = 0;
  for (const b of blockTimeline as { type?: unknown; seconds?: unknown; note?: unknown }[]) {
    if (b?.type !== 'Hold') continue;
    hold += 1;
    const text = clean(b.note);
    if (!text) continue;
    out.push({
      holdNumber: hold,
      seconds: typeof b.seconds === 'number' && Number.isFinite(b.seconds) ? b.seconds : null,
      text,
    });
  }
  return out;
}

/** One line of per-dive / per-hold text, in session order, for compact lists. */
export interface NoteLine {
  kind: 'dive' | 'hold';
  /** 1-based dive or hold number. */
  n: number;
  text: string;
}

export function sessionNoteLines(blob: unknown): NoteLine[] {
  const s = (blob ?? {}) as { mode?: unknown; dives?: unknown; blockTimeline?: unknown };
  if (s.mode === 'dry') {
    return holdNotes(s.blockTimeline).map((h) => ({ kind: 'hold', n: h.holdNumber, text: h.text }));
  }
  return diveRemarks(s.dives).map((d) => ({ kind: 'dive', n: d.index + 1, text: d.text }));
}

/** Headline numbers for a one-line summary of an attached session. Each field is
 *  null when the session does not carry it. */
export interface SessionChips {
  mode: 'depth' | 'pool' | 'dry' | null;
  diveCount: number | null;
  /** Deepest dive, metres (depth). */
  maxDepth: number | null;
  /** Longest single swim, metres (pool, dynamic disciplines). */
  bestDistance: number | null;
  /** Longest hold, seconds (dry holds, or pool STA). */
  longestHoldSec: number | null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function sessionChips(blob: unknown): SessionChips {
  const s = (blob ?? {}) as Record<string, unknown>;
  const mode = s.mode === 'depth' || s.mode === 'pool' || s.mode === 'dry' ? s.mode : null;
  const dives = Array.isArray(s.dives) ? (s.dives as Record<string, unknown>[]) : [];
  const out: SessionChips = { mode, diveCount: null, maxDepth: null, bestDistance: null, longestHoldSec: null };
  const maxOf = (vals: (number | null)[]) => {
    const ok = vals.filter((v): v is number => v != null && v > 0);
    return ok.length ? Math.max(...ok) : null;
  };
  if (mode === 'depth') {
    out.diveCount = dives.length;
    out.maxDepth = maxOf([num(s.maxDepth), ...dives.map((d) => num(d.depth))]);
  } else if (mode === 'pool') {
    out.diveCount = dives.length;
    out.bestDistance = maxOf(dives.filter((d) => d.discipline !== 'STA').map((d) => num(d.distance)));
    out.longestHoldSec = maxOf(dives.filter((d) => d.discipline === 'STA').map((d) => num(d.diveTime)));
  } else if (mode === 'dry') {
    const tl = Array.isArray(s.blockTimeline) ? (s.blockTimeline as Record<string, unknown>[]) : [];
    out.longestHoldSec = maxOf(tl.filter((b) => b.type === 'Hold').map((b) => num(b.seconds)));
  }
  return out;
}
