import { CatAvatar } from "@/components/CatAvatar";
import { ScoreChip } from "@/components/ScoreChip";
import type { VoteFactor } from "@/db/schema";
import { displayCatComment } from "@/lib/comment-display";

export interface VoteView {
  catId: string;
  name: string;
  icon: string;
  factionName: string | null;
  role: "leader" | "follower" | null;
  score: number;
  stance: string;
  reason: string;
  silent: boolean;
  confidence: number;
  factors: VoteFactor[];
  model: string;
}

const STANCE_LABEL: Record<string, string> = {
  for: "賛成",
  neutral: "中立",
  against: "反対",
};

export function VoteCard({ v, prevScore }: { v: VoteView; prevScore?: number }) {
  const isDemo = v.model.includes("demo");
  const displayReason = displayCatComment(v.reason, v.silent);
  const trend =
    prevScore !== undefined && prevScore !== v.score
      ? v.score > prevScore
        ? <span className="text-xs text-green-600">▲</span>
        : <span className="text-xs text-red-500">▼</span>
      : null;

  return (
    <div className="rounded-xl border border-orange-100 bg-[#fffdf8] p-3">
      <div className="flex items-center gap-2">
        <CatAvatar icon={v.icon} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">
            {v.name}
            {v.role === "leader" && <span title="リーダー"> 👑</span>}
            {trend}
          </p>
          {v.factionName && (
            <p className="truncate text-[10px] text-stone-400">{v.factionName}</p>
          )}
        </div>
        <ScoreChip score={v.score} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`chip ${
            v.stance === "for"
              ? "bg-green-50 text-green-600"
              : v.stance === "against"
                ? "bg-red-50 text-red-500"
                : "bg-stone-100 text-stone-500"
          }`}
        >
          {STANCE_LABEL[v.stance] ?? v.stance}
        </span>
        <span className="text-[10px] text-stone-300">
          確信度 {"★".repeat(Math.max(1, Math.round(v.confidence * 5)))}
          {"☆".repeat(Math.max(0, 5 - Math.round(v.confidence * 5)))}
        </span>
      </div>
      {displayReason && (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-stone-600 ring-1 ring-orange-50">
          「{displayReason}」
        </p>
      )}
      {v.factors.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {v.factors.map((f, i) => (
            <li key={i} className="flex justify-between text-[11px] text-stone-400">
              <span>{f.label}</span>
              <span className="tabular-nums">
                {f.delta > 0 ? "+" : ""}
                {f.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-right text-[9px] text-stone-200">
        {isDemo ? "demo" : v.model.split("/").pop()}
      </p>
    </div>
  );
}
