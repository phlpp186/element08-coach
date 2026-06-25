/** A tiny inline progress line for a PB history (chronological values). Higher is
 *  always better in freediving (deeper / longer / further), so an upward line = up.
 *  The line is colour-coded by net trend: green = improving, cyan = flat, amber =
 *  regressing. Renders nothing useful below 2 points (the caller shows the single
 *  value). */
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

  // Net trend over the logged marks → semantic colour.
  const delta = values[values.length - 1] - values[0];
  const token = delta > 0 ? '--c-recover' : delta < 0 ? '--c-amber' : '--c-accent';
  const color = `rgb(var(${token}))`;
  // Soft area under the line in the same hue (low alpha), for a touch of body.
  const areaId = `spark-${token.slice(2)}`;
  const area = `${d} L${lx.toFixed(1)} ${(height - pad).toFixed(1)} L${pad} ${(height - pad).toFixed(1)} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${areaId})`} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}
