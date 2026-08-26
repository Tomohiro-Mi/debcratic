const STYLES: Record<string, string> = {
  OPEN: "bg-green-100 text-green-700",
  RUNOFF_PENDING: "bg-amber-100 text-amber-700",
  RUNOFF: "bg-violet-100 text-violet-700",
  CLOSED: "bg-stone-200 text-stone-600",
};

const LABELS: Record<string, string> = {
  OPEN: "受付中",
  RUNOFF_PENDING: "決選投票待ち",
  RUNOFF: "決選投票中",
  CLOSED: "終了",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STYLES[status] ?? "bg-stone-100 text-stone-600"}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
