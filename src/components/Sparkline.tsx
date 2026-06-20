/** A tiny inline progress line for a PB history (chronological values). Higher is
 *  always better in freediving (deeper / longer / further), so an upward line = up.
 *  Renders nothing useful below 2 points (the caller shows the single value). */
export function Sparkline({
  values,
  width = 96,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <path d={d} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} fill="rgb(var(--c-accent))" />
    </svg>
  );
}
