/**
 * categoryColor — a deterministic colour per exercise-category name so a category
 * looks the same everywhere it appears (Exercises tab chips/rows/filters + the
 * plan builder's palette). A fixed 10-hue palette drawn from the Open Water
 * themes (Caribbean + Chalk Dark accents plus a few mid-saturation neighbours),
 * theme-agnostic — every hue reads on both the white Caribbean panels and the
 * dark Chalk surfaces. Uncategorized falls back to dim grey.
 */
const CAT_HUES = [
  '#1bafe0', // sky cyan (Chalk Dark accent)
  '#1fb894', // sea green (Caribbean recover)
  '#e8a93a', // golden sand (Caribbean highlight)
  '#e84393', // pink (Chalk Dark highlight)
  '#f2764f', // coral (Caribbean accent)
  '#3dc96b', // leaf green (Chalk Dark recover)
  '#9b7bf5', // violet
  '#f0a500', // amber (Chalk Dark amber)
  '#7aa7ff', // periwinkle
  '#3fd0c0', // turquoise
];

export function categoryColor(name?: string | null): string {
  if (!name) return 'rgb(var(--c-textDim))';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_HUES[h % CAT_HUES.length];
}
