/**
 * chartTheme — palette for ECharts options, swapped with the UI theme.
 *
 * ECharts options are plain JS values built at render time, not CSS, so the
 * chart components can't read Tailwind classes directly. The portal swaps
 * themes by toggling a class on <html> (Chalk Dark default / .light =
 * Caribbean — see ThemeToggle), so we read the resolved CSS custom properties
 * straight off documentElement and hand ECharts `rgb(...)` strings. A
 * MutationObserver on the <html> class re-renders consumers when the theme
 * flips. This mirrors the analyzer's useChartTheme() contract (same field
 * names) so its ported chart components work unchanged.
 */
import { useSyncExternalStore } from 'react';

/** Semantic series tokens — the `--c-*` palette entries charts draw with. */
export type ChartToken = 'accent' | 'highlight' | 'recover' | 'amber' | 'red';

export interface ChartTheme {
  surface: string;
  tooltipBg: string;
  tooltipBorder: string;
  axisLine: string;
  splitLine: string;
  text: string;
  textDim: string;
  accent: string;
  highlight: string;
  recover: string;
  amber: string;
  red: string;
  /** Chart typography — follows the UI (Nunito). */
  fontFamily: string;
  /** A palette token at reduced opacity, e.g. `alpha('accent', 0.1)` for
   *  area fills and shaded bands. */
  alpha: (token: ChartToken, a: number) => string;
}

/** Read a `--c-*` token ("r g b") and return an `rgb()`/`rgba()` string. */
function cssVar(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return alpha < 1 ? 'rgba(0,0,0,0)' : '#000';
  const parts = raw.split(/\s+/).join(', ');
  return alpha < 1 ? `rgba(${parts}, ${alpha})` : `rgb(${parts})`;
}

// Re-render when the <html> class changes (theme toggle flips dark/light).
function subscribe(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}
function getSnapshot(): string {
  return document.documentElement.className;
}

export function useChartTheme(): ChartTheme {
  // Subscribe so the option rebuilds on theme change; the value itself is read
  // fresh from the CSS vars below.
  useSyncExternalStore(subscribe, getSnapshot, () => '');
  return {
    surface: cssVar('--c-panel'),
    tooltipBg: cssVar('--c-abyss'),
    tooltipBorder: cssVar('--c-border'),
    axisLine: cssVar('--c-border'),
    splitLine: cssVar('--c-border', 0.45),
    text: cssVar('--c-text'),
    textDim: cssVar('--c-textDim'),
    accent: cssVar('--c-accent'),
    highlight: cssVar('--c-highlight'),
    recover: cssVar('--c-recover'),
    amber: cssVar('--c-amber'),
    red: cssVar('--c-red'),
    fontFamily: 'Nunito, system-ui, sans-serif',
    alpha: (token, a) => cssVar(`--c-${token}`, a),
  };
}
