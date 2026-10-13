/**
 * The coach's "seen up to" stamp for athlete activity, shared by the header
 * bell and the Activity page so marking things seen in one clears the other.
 * Kept in localStorage under the key the bell has always used, so existing
 * coaches keep their read state.
 */
import { useSyncExternalStore } from 'react';

export const SEEN_KEY = 'element08.coach.completionsSeen';
const EVENT = 'e08:completionsSeen';

function read(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Mark everything up to now as seen; returns the new stamp. */
export function markAllSeen(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(SEEN_KEY, now);
  } catch {
    // Private mode / blocked storage: the stamp lives for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
  return now;
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEEN_KEY) cb();
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
