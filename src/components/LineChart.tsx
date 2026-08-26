export interface ChartSeries {
  label: string;
  color: string;
  points: { x: number; y: number }[];
}

export function LineChart({
  series,
  yMin = 0,
  yMax = 10,
  height = 220,
  xLabel = "Turn",
}: {
  series: ChartSeries[];
  yMin?: number;
  yMax?: number;
  height?: number;
  xLabel?: string;
}) {
  const W = 640;
  const H = height;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 26;

  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const maxX = Math.max(1, ...allX);
  const sx = (x: number) => padL + ((W - padL - padR) * x) / maxX;
  const sy = (y: number) =>
    padT + ((H - padT - padB) * (yMax - y)) / (yMax - yMin);

  const yTicks = [];
  for (let v = yMin; v <= yMax; v += Math.ceil((yMax - yMin) / 5)) yTicks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={W - padR}
            y1={sy(v)}
            y2={sy(v)}
            stroke="#e7e5e4"
            strokeWidth={1}
          />
          <text x={padL - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="#a8a29e">
            {v}
          </text>
        </g>
      ))}
      {[0, Math.floor(maxX / 2), maxX].map((x, i) => (
        <text key={i} x={sx(x)} y={H - 8} textAnchor="middle" fontSize={10} fill="#a8a29e">
          {xLabel === "Turn" ? x : ""}
          {i === 2 ? ` ${xLabel}` : ""}
        </text>
      ))}
      {series.map((s) => {
        const pts = [...s.points].sort((a, b) => a.x - b.x);
        if (pts.length === 0) return null;
        if (pts.length === 1) pts.push({ x: pts[0].x + 0.001, y: pts[0].y });
        const d = pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
        return (
          <g key={s.label}>
            <polyline
              points={d}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {pts.map((p, i) => (
              <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-xs text-stone-500">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export const CHART_COLORS = [
  "#f97316",
  "#0ea5e9",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#eab308",
  "#14b8a6",
  "#ec4899",
];
