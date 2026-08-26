export function ScoreChip({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const tone =
    score >= 2
      ? "bg-green-100 text-green-700"
      : score <= -2
        ? "bg-red-100 text-red-600"
        : "bg-stone-100 text-stone-500";
  const sz =
    size === "lg"
      ? "text-lg px-3 py-1"
      : size === "sm"
        ? "text-xs px-2 py-0.5"
        : "text-sm px-2.5 py-0.5";
  return (
    <span className={`chip ${tone} ${sz} tabular-nums`}>
      {score > 0 ? `+${score}` : score}
    </span>
  );
}
