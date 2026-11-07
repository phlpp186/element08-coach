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

/** Asked before the hash moves on; false keeps the page (unsaved changes). */
let leaveGuard: (() => boolean) | null = null;

/** Set while a page has unsaved changes; null when it has none. */
export function setLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard;
}

// Registered before any view subscribes, so a refused move is put back
// before a view can render the next page.
window.addEventListener('hashchange', (e) => {
  if (!leaveGuard || window.location.hash === cachedHash) return;
  if (leaveGuard()) return;
  e.stopImmediatePropagation();
  history.replaceState(null, '', cachedHash || '#/');
});

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

/** Navigate by setting the hash (adds a history entry). `replace` swaps
 *  the current entry instead, for a redirect Back should skip. */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (opts.replace) window.location.replace(hash);
  else window.location.hash = hash;
}
