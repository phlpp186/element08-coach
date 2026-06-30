/**
 * chartTheme — palette for ECharts options, swapped with the UI theme.
 *
 * ECharts options are plain JS values built at render time, not CSS, so the
 * chart components can't read Tailwind classes directly. The portal swaps themes
 * by toggling a class on <html> (dark / .light / .neon — see ThemeToggle), so we
 * read the resolved CSS custom properties straight off documentElement and hand
 * ECharts `rgb(...)` strings. A MutationObserver on the <html> class re-renders
 * consumers when the theme flips. This mirrors the analyzer's useChartTheme()
 * contract (same field names) so its ported chart components work unchanged.
 */
import { useSyncExternalStore } from 'react';

export interface ChartTheme {
  surface: string;
  tooltipBg: string;
  tooltipBorder: string;
  axisLine: string;
  splitLine: string;
  text: string;
  textDim: string;
  accent: string;
}

/** Read a `--c-*` token ("r g b") and return an `rgb()`/`rgba()` string. */
function cssVar(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return alpha < 1 ? 'rgba(0,0,0,0)' : '#000';
  const parts = raw.split(/\s+/).join(', ');
  return alpha < 1 ? `rgba(${parts}, ${alpha})` : `rgb(${parts})`;
}

// Re-render when the <html> class changes (theme toggle flips dark/light/neon).
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
  };
}
