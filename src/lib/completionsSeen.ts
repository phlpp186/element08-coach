/**
 * The coach's "seen up to" stamp for athlete activity, shared by the header
 * bell and the Activity page so marking things seen in one clears the other.
 * Kept in localStorage under the key the bell has always used, so existing
 * coaches keep their read state.
 *
 * Single entries can be marked seen too (the Activity card's "Mark seen"): a
 * map of entry id -> the event time that was seen, so an athlete editing the
 * session afterwards makes it new again. Marking all seen clears the map.
 */
import { useSyncExternalStore } from 'react';

export const SEEN_KEY = 'element08.coach.completionsSeen';
const IDS_KEY = 'element08.coach.completionsSeenIds';
const EVENT = 'e08:completionsSeen';

export interface SeenState {
  /** ISO stamp: everything up to it is seen ('' = never). */
  at: string;
  /** Entry id -> event time seen. */
  ids: Readonly<Record<string, string>>;
}

/** Whether an event (entry id + event time) is still new for the coach. */
export function isNewFor(seen: SeenState, id: string, at: string): boolean {
  if (seen.at && Date.parse(at) <= Date.parse(seen.at)) return false;
  const one = seen.ids[id];
  return !(one && Date.parse(at) <= Date.parse(one));
}

function read(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function readIds(): string {
  try {
    return localStorage.getItem(IDS_KEY) ?? '';
  } catch {
    return '';
  }
}

let cacheKey: string | null = null;
let cacheVal: SeenState = { at: '', ids: {} };
/** A stable snapshot for useSyncExternalStore: re-parsed only when storage changed. */
function readState(): SeenState {
  const at = read();
  const raw = readIds();
  const key = `${at}|${raw}`;
  if (key !== cacheKey) {
    let ids: Record<string, string> = {};
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ids = parsed;
    } catch {
      /* corrupt map: treat as empty */
    }
    cacheKey = key;
    cacheVal = { at, ids };
  }
  return cacheVal;
}

/** Mark one entry's event as seen. Ids already covered by the stamp are
 *  dropped on the way, so the map stays small. */
export function markSeen(id: string, at: string): void {
  const { at: stamp, ids } = readState();
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(ids)) {
    if (!stamp || Date.parse(v) > Date.parse(stamp)) next[k] = v;
  }
  next[id] = at;
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Mark everything up to now as seen; returns the new stamp. */
export function markAllSeen(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(SEEN_KEY, now);
    localStorage.removeItem(IDS_KEY);
  } catch {
    // Private mode / blocked storage: the stamp lives for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
  return now;
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEEN_KEY || e.key === IDS_KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** The current seen stamp ('' = never), live across components and tabs. */
export function useCompletionsSeen(): string {
  return useSyncExternalStore(subscribe, read);
}

/** The stamp plus single-entry marks, live across components and tabs. */
export function useSeenState(): SeenState {
  return useSyncExternalStore(subscribe, readState);
}
