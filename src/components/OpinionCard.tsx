import { deleteOpinionAction, reportTargetAction } from "@/app/actions/proposals";
import { ScoreChip } from "@/components/ScoreChip";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { VoteCard, type VoteView } from "@/components/VoteCard";
import { computeOpinionStats } from "@/lib/rules/points";
import { formatDate, scoreLabel } from "@/lib/format";
import type { ParamEstimate } from "@/lib/bayes";

const MEDALS = ["🥇", "🥈", "🥉"];

export function OpinionCard({
  rank,
  opinionId,
  content,
  authorName,
  createdAt,
  point,
  prevPoint,
  isAdopted,
  votes,
  estimates,
  canDelete,
}: {
  rank: number;
  opinionId: string;
  content: string;
  authorName: string | null;
  createdAt: Date;
  point: number;
  prevPoint: number;
  isAdopted: boolean;
  votes: VoteView[];
  estimates: Record<string, ParamEstimate>;
  canDelete: boolean;
}) {
  const scores = Object.fromEntries(votes.map((v) => [v.catId, v.score]));
  const st = computeOpinionStats(scores);
  const trend = point - prevPoint;

  return (
    <article id={`op-${opinionId}`} className="card">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-1">
          <span className="text-xl">{MEDALS[rank - 1] ?? `${rank}位`}</span>
          {isAdopted && <span className="chip bg-yellow-100 text-yellow-700">🏆 採用</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
            {content}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {authorName ?? "匿名"} · {formatDate(createdAt)}
          </p>
          <div className="mt-1 flex gap-2">
            {canDelete && (
              <form action={deleteOpinionAction}>
                <input type="hidden" name="opinionId" value={opinionId} />
                <ConfirmSubmitButton
                  message="この意見を削除しますか？"
                  className="text-[10px] text-red-300 hover:text-red-500"
                >
                  削除
                </ConfirmSubmitButton>
              </form>
            )}
            <form action={reportTargetAction}>
              <input type="hidden" name="targetType" value="opinion" />
              <input type="hidden" name="targetId" value={opinionId} />
              <input type="hidden" name="reason" value="" />
              <button
                type="submit"
                className="text-[10px] text-stone-300 hover:text-orange-400"
              >
                通報
              </button>
            </form>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-2xl font-black tabular-nums ${
              point > 0 ? "text-green-600" : point < 0 ? "text-red-500" : "text-stone-500"
            }`}
          >
            {scoreLabel(point)}
            {trend !== 0 && (
              <span className="ml-1 align-middle text-xs font-bold">
                {trend > 0 ? "▲" : "▼"}
                {scoreLabel(trend)}
              </span>
            )}
          </p>
          <p className="text-[10px] font-bold text-stone-400">Point</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
        <span>平均賛同 <b className="tabular-nums">{st.avg.toFixed(1)}</b></span>
        <span className="text-green-600">賛成 {st.agreePct}%</span>
        <span>中立 {st.neutralPct}%</span>
        <span className="text-red-500">反対 {st.againstPct}%</span>
        <span>分極度 <b className="tabular-nums">{st.polarization}</b></span>
      </div>

      {Object.keys(estimates).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="chip bg-sky-50 text-sky-600">推定パラメータ</span>
          {Object.entries(estimates).map(([k, e]) => (
            <span key={k} className="chip bg-white ring-1 ring-sky-100 text-sky-700 tabular-nums">
              {k} ≈{e.mean}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {votes.map((v) => (
          <VoteCard key={v.catId} v={v} />
        ))}
      </div>
    </article>
  );
}

export function ScoreLegend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-stone-400">
      <ScoreChip score={5} size="sm" /> 賛成
      <ScoreChip score={0} size="sm" /> 中立
      <ScoreChip score={-5} size="sm" /> 反対
    </div>
  );
}
