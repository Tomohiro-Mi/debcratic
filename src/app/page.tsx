import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getHomeProposals, getSocietyState } from "@/lib/queries";
import { processAllActiveProposals } from "@/lib/catchup";
import { StatusChip } from "@/components/StatusChip";
import { ScoreChip } from "@/components/ScoreChip";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    try {
      await processAllActiveProposals();
    } catch (err) {
      console.error("[home] catchup failed:", err);
    }
  }

  const [proposals, society] = await Promise.all([
    session ? getHomeProposals() : Promise.resolve([]),
    getSocietyState(),
  ]);

  const active = proposals.filter((p) => p.status === "OPEN" || p.status.startsWith("RUNOFF"));
  const closed = proposals.filter((p) => p.status === "CLOSED");
  const totalPower = society.catsView.reduce((a, c) => a + c.power, 0);

  return (
    <div className="space-y-8">
      <section className="card overflow-hidden bg-gradient-to-br from-orange-50 via-[#fffdf8] to-amber-50 !p-8 text-center">
        <p className="text-4xl">🐈 ⚖️ 🐈‍⬛</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          でぶねこによる民主主義
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
          あなたの議論が、猫社会を動かす。
          <br />
          投稿された意見にでぶねこたちが賛否を表明し、
          <br className="sm:hidden" />
          議題への評価と権力と派閥が変化していく政治社会シミュレーション。
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {session ? (
            <Link href="/proposals/new" className="btn btn-primary px-6 py-3">
              議題を作成する
            </Link>
          ) : (
            <Link href="/register" className="btn btn-primary px-6 py-3">
              登録して参加する
            </Link>
          )}
          <Link href="/cats" className="btn btn-ghost px-6 py-3">
            猫たちを見る
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs font-bold text-stone-500">
          <span>🐱 就任猫 {society.catsView.length}匹</span>
          <span>⚡ 総権力 {totalPower}</span>
          <span>🏛️ 現存派閥 {society.factionsView.length}</span>
          {session && <span>🗳️ 進行中の議題 {active.length}</span>}
        </div>
      </section>

      {session ? (
        <>
          <section>
            <h2 className="section-title">🔥 進行中の議題</h2>
            {active.length === 0 ? (
              <div className="card py-10 text-center text-sm text-stone-400">
                まだ進行中の議題がありません。最初の議題を作ってみませんか？
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {active.map((p) => (
                  <ProposalCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </section>

          {closed.length > 0 && (
            <section>
              <h2 className="section-title">🏁 終了した議題</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {closed.map((p) => (
                  <ProposalCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="card py-10 text-center">
          <h2 className="text-lg font-black">🗳️ 議題を見るにはログインが必要です</h2>
          <p className="mt-2 text-sm text-stone-500">
            ログインすると、進行中・終了済みの議題を確認できます。
          </p>
          <Link href="/login?next=/" className="btn btn-primary mt-4 px-6">
            ログインして議題を見る
          </Link>
        </section>
      )}
    </div>
  );
}

type P = Awaited<ReturnType<typeof getHomeProposals>>[number];

function ProposalCard({ p }: { p: P }) {
  return (
    <Link
      href={`/proposals/${p.id}`}
      className="card block transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <StatusChip status={p.status} />
        <span className="text-xs text-stone-400">{formatDate(p.createdAt)}</span>
      </div>
      <h3 className="mt-2 line-clamp-2 font-black leading-snug">{p.title}</h3>
      {p.topOpinion ? (
        <p className="mt-2 line-clamp-1 text-xs text-stone-500">
          トップ案「{p.topOpinion.snippet}」
        </p>
      ) : (
        <p className="mt-2 text-xs text-stone-400">まだ意見がありません</p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-stone-400">
        <span>💬 {p.opinionCount}意見</span>
        <span>⏰ 締切 {formatDate(p.deadline)}</span>
        {p.topOpinion && <ScoreChip score={p.topOpinion.point} size="sm" />}
      </div>
    </Link>
  );
}
