export function ParamBar({
  label,
  value,
  color = "#f97316",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs text-stone-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-6 text-right text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

export function PowerBar({ value }: { value: number }) {
  const tone =
    value >= 8 ? "#ef4444" : value >= 5 ? "#f97316" : value >= 3 ? "#eab308" : "#a8a29e";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(value / 10) * 100}%`, backgroundColor: tone }}
        />
      </div>
      <span className="w-10 text-right text-xs font-black tabular-nums" style={{ color: tone }}>
        ⚡{value}
      </span>
    </div>
  );
}
