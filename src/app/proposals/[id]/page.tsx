import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposalDetail } from "@/lib/queries";
import { processProposalCatchup } from "@/lib/catchup";
import { estimateOpinionParams } from "@/lib/bayes";
import { formatDate } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { OpinionForm } from "@/components/OpinionForm";
import { OpinionCard } from "@/components/OpinionCard";
import { TimelineList } from "@/components/TimelineList";
import { AutoRefresh } from "@/components/AutoRefresh";
import { startRunoffAction } from "@/app/actions/proposals";
import type { VoteView } from "@/components/VoteCard";
import { CatAvatar } from "@/components/CatAvatar";

export const dynamic = "force-dynamic";

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser(`/proposals/${id}`);

  try {
    await processProposalCatchup(id);
  } catch (err) {
    console.error("[proposal] catchup failed:", err);
  }

  const d = await getProposalDetail(id);
  if (!d) notFound();

  const isAuthorOrAdmin =
    session && (session.role === "admin" || session.userId === d.proposal.authorId);
  const canVoteHere = Boolean(session) && d.proposal.status === "OPEN";

  const catById = new Map(d.catsView.map((c) => [c.id, c]));
  const cvMap = new Map(d.catValues.map((cv) => [cv.catId, cv.values]));

  const opinionsWithVotes = d.opinions.map((o) => {
    const votes: VoteView[] = [];
    for (const c of d.catsView) {
      const lv = d.latestVotes.get(`${o.id}:${c.id}`);
      if (!lv) continue;
      votes.push({
        catId: c.id,
        name: c.name,
        icon: c.icon,
        factionName: c.factionName,
        role: c.role,
        score: lv.score,
        stance: lv.stance,
        reason: lv.reason,
        confidence: lv.confidence,
        factors: lv.factors ?? [],
        model: lv.model,
      });
    }
    votes.sort((a, b) => (catById.get(b.catId)?.power ?? 0) - (catById.get(a.catId)?.power ?? 0));

    const samples = d.catsView
      .map((c) => ({
        values: cvMap.get(c.id) ?? {},
        score: d.latestVotes.get(`${o.id}:${c.id}`)?.score,
      }))
      .filter((s): s is { values: Record<string, number>; score: number } => typeof s.score === "number");
    const estimates = estimateOpinionParams(samples);

    return { o, votes, estimates };
  });

  const adoptedId = d.proposal.adoptedOpinionId;
  const ranked = [...opinionsWithVotes].sort((a, b) => {
    if (a.o.id === adoptedId) return -1;
    if (b.o.id === adoptedId) return 1;
    return b.o.point - a.o.point || a.o.createdAt.getTime() - b.o.createdAt.getTime();
  });

  const unaffiliated = d.catsView.filter((c) => !c.factionName);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        <div className="space-y-5">
          <header className="card">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={d.proposal.status} />
              <span className="text-xs text-stone-400">
                発案者: {d.proposal.authorName ?? "匿名"}
              </span>
              <span className="text-xs text-stone-400">·</span>
              <span className="text-xs text-stone-400">{formatDate(d.proposal.createdAt)}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black leading-snug">{d.proposal.title}</h1>
            {d.proposal.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                {d.proposal.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="font-bold text-red-400">
                ⏰ 締切: {formatDate(d.proposal.deadline)}
              </span>
              <span>💬 意見 {d.opinions.length}件</span>
            </div>
            {d.params.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="chip bg-orange-50 text-orange-600">評価軸</span>
                {d.params.map((p) => (
                  <span key={p.id} className="chip bg-white ring-1 ring-orange-100">
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </header>

          {d.proposal.status === "RUNOFF_PENDING" && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-700">
                ⚖️ 同率1位です！決選投票の準備ができています
              </p>
              <p className="mt-1 text-xs text-amber-600">
                {isAuthorOrAdmin
                  ? "あなたは発案者なので今すぐ開始できます。"
                  : `発案者が開始しない場合、${formatDate(d.proposal.runoffAutoStartAt)}に自動開始されます。`}
              </p>
              {isAuthorOrAdmin && (
                <form action={startRunoffAction} className="mt-3">
                  <input type="hidden" name="proposalId" value={d.proposal.id} />
                  <button type="submit" className="btn bg-amber-500 !px-4 !py-2 text-white hover:bg-amber-600">
                    今すぐ決選投票を開始
                  </button>
                </form>
              )}
            </section>
          )}

          {d.proposal.status === "RUNOFF" && (
            <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-sm font-black text-violet-700">
                🏁 決選投票中 — {d.proposal.runoffTurnsDone}/{d.runoffTurnLimitRow} ターン終了（{d.runoffVoteIntervalMinutes}分ごと）
              </p>
            </section>
          )}

          {canVoteHere && <OpinionForm proposalId={d.proposal.id} />}
          {!session && d.proposal.status === "OPEN" && (
            <div className="card text-center text-sm text-stone-500">
              <Link href={`/login?next=/proposals/${d.proposal.id}`} className="font-bold text-orange-600 hover:underline">
                ログイン
              </Link>{" "}
             すると意見を投稿できます 🐾
            </div>
          )}

          <section>
            <h2 className="section-title">📊 意見ランキング</h2>
            {ranked.length === 0 ? (
              <div className="card py-10 text-center text-sm text-stone-400">
                最初の意見を投稿して、猫社会を動かそう。
              </div>
            ) : (
              <div className="space-y-4">
                {ranked.map(({ o, votes, estimates }, i) => (
                  <OpinionCard
                    key={o.id}
                    rank={i + 1}
                    opinionId={o.id}
                    content={o.content}
                    authorName={o.authorName}
                    createdAt={o.createdAt}
                    point={o.point}
                    prevPoint={o.prevPoint}
                    isAdopted={o.id === adoptedId}
                    votes={votes}
                    estimates={estimates}
                    canDelete={Boolean(
                      session && (session.role === "admin" || session.userId === o.authorId),
                    )}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card">
            <h2 className="section-title">🏛️ 現在の派閥</h2>
            <div className="space-y-3">
              {d.factionsView.length === 0 && (
                <p className="text-xs text-stone-400">派閥はまだありません。権力8以上の猫が現れれば結成されます。</p>
              )}
              {d.factionsView.map((f) => (
                <div key={f.id} className="rounded-xl border border-orange-100 p-2.5">
                  <p className="text-sm font-black">
                    {f.name}
                    <span className="ml-1 text-[10px] font-bold text-stone-400">
                      計⚡{f.members.reduce((a, m) => a + m.power, 0)}
                    </span>
                  </p>
                  <p className="text-[11px] text-stone-500">
                    👑 {f.leaderName}
                    {f.members.filter((m) => m.role === "follower").length > 0 && (
                      <>
                        {" "}
                        · 子分{" "}
                        {f.members
                          .filter((m) => m.role === "follower")
                          .map((m) => m.name)
                          .join("・")}
                      </>
                    )}
                  </p>
                </div>
              ))}
              <div>
                <p className="mb-1 text-[11px] font-bold text-stone-400">無所属</p>
                <div className="flex flex-wrap gap-1">
                  {unaffiliated.map((c) => (
                    <span key={c.id} className="chip bg-stone-100 text-stone-500">
                      <span className="inline-flex items-center gap-1">
                        <CatAvatar icon={c.icon} size={20} />
                        {c.name} ⚡{c.power}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">🐾 猫社会タイムライン</h2>
            <TimelineList events={d.events} />
          </section>

          <section className="card overflow-hidden">
            <h2 className="section-title">🐱 各猫の評価軸値</h2>
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <table className="w-full min-w-full text-[11px]">
                <thead>
                  <tr className="text-left text-stone-400">
                    <th className="py-1 pr-1">猫</th>
                    {d.params.map((p) => (
                      <th key={p.id} className="px-1 py-1 text-center whitespace-nowrap">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...d.catsView]
                    .sort((a, b) => b.power - a.power)
                    .map((c) => (
                      <tr key={c.id} className="border-t border-orange-50">
                        <td className="py-1.5 font-bold whitespace-nowrap">
                          <Link href={`/cats/${c.id}`} className="hover:text-orange-600">
                            <span className="inline-flex items-center gap-1">
                              <CatAvatar icon={c.icon} size={20} />
                              {c.name}
                            </span>
                          </Link>
                        </td>
                        {d.params.map((p) => (
                          <td key={p.id} className="px-1 py-1.5 text-center tabular-nums text-stone-600">
                            {cvMap.get(c.id)?.[p.name] ?? "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
