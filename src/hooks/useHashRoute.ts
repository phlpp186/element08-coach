import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router (no dependency). Routes look like `#/athletes/ath-123` with
 * an optional query: `#/plan/new?athlete=ath-123`. Hash routing keeps the app a
 * single static file on GitHub Pages — deep links + the back button just work.
 */
export interface Route {
  /** Path segments after the leading `#/`, e.g. ['athletes', 'ath-123']. */
  segments: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  return { segments, query: new URLSearchParams(qs ?? '') };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

let cached: Route = parse();
let cachedHash = window.location.hash;
function getSnapshot(): Route {
  // useSyncExternalStore needs a stable reference when nothing changed.
  if (window.location.hash !== cachedHash) {
    cachedHash = window.location.hash;
    cached = parse();
  }
  return cached;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Navigate by setting the hash (adds a history entry). */
export function navigate(to: string): void {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}
