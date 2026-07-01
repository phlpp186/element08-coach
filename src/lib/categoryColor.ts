/**
 * categoryColor — a deterministic colour per exercise-category name so a category
 * looks the same everywhere it appears (Exercises tab chips/rows/filters + the
 * plan builder's palette). A fixed 10-hue palette, theme-agnostic (reads on dark,
 * light, sky and neon). Uncategorized falls back to dim grey.
 */
const CAT_HUES = [
  '#5bcdfa',
  '#66c87c',
  '#ffb236',
  '#ff6fa5',
  '#b98cff',
  '#3fd0c0',
  '#f6825b',
  '#9ccc65',
  '#e6c84e',
  '#7aa7ff',
];

export function categoryColor(name?: string | null): string {
  if (!name) return 'rgb(var(--c-textDim))';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_HUES[h % CAT_HUES.length];
}
