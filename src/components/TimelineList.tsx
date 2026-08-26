import { describeEvent } from "@/lib/eventfmt";
import { timeAgo } from "@/lib/format";

export interface TimelineItem {
  id: number;
  type: string;
  turnNumber: number | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export function TimelineList({
  events,
  showProposal = false,
}: {
  events: (TimelineItem & { proposalTitle?: string | null })[];
  showProposal?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-stone-400">
        まだ何も起きていない。静かな猫社会… 🐾
      </p>
    );
  }

  const blocks: { key: string; label: string; items: typeof events }[] = [];
  for (const e of events) {
    const key =
      e.turnNumber !== null ? `turn:${e.turnNumber}` : `time:${e.id}`;
    const label =
      e.turnNumber !== null ? `Turn ${e.turnNumber}` : timeAgo(e.createdAt);
    const last = blocks[blocks.length - 1];
    if (last && last.key === key) {
      last.items.push(e);
    } else {
      blocks.push({ key, label, items: [e] });
    }
  }

  return (
    <div className="space-y-4">
      {blocks.map((b) => (
        <div key={b.key}>
          <p className="mb-1.5 text-xs font-black tracking-wider text-orange-500">
            ━ {b.label}
          </p>
          <div className="space-y-2 border-l-2 border-orange-100 pl-3">
            {b.items.map((e) => {
              const d = describeEvent(e);
              if (!d) return null;
              return (
                <div key={e.id} className="text-sm">
                  <span className="mr-1">{d.icon}</span>
                  <span className="text-stone-700">{d.text}</span>
                  {showProposal && e.proposalTitle && (
                    <span className="ml-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
                      {e.proposalTitle}
                    </span>
                  )}
                  <span className="ml-1 text-[10px] text-stone-300">
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
