import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatProfile } from "@/lib/queries";
import { CatAvatar } from "@/components/CatAvatar";
import { PowerBar } from "@/components/Bars";
import { ScoreChip } from "@/components/ScoreChip";
import { LineChart, ChartLegend, CHART_COLORS } from "@/components/LineChart";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getCatProfile(id);
  if (!d) notFound();

  const c = d.cat;
  const powerSeries = buildPowerSeries(d.powerEvents, c.power);

  return (
    <div className="space-y-6">
      <header className="card">
        <div className="flex items-center gap-4">
          <CatAvatar icon={c.icon} iconUrl={c.iconUrl} size={72} />
          <div className="flex-1">
            <h1 className="text-2xl font-black">
              {c.name}
              {c.role === "leader" && (
                <span className="chip ml-2 bg-red-50 text-red-500">👑 リーダー</span>
              )}
            </h1>
            <p className="text-sm text-stone-400">
              性別: {c.gender}
            </p>
          </div>
          <div className="w-40">
            <p className="label">現在権力</p>
            <PowerBar value={c.power} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <p className="label !mb-0.5">所属派閥</p>
            <p className="font-bold">{c.factionName ?? "無所属"}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <p className="label !mb-0.5">リーダー</p>
            <p className="font-bold">{c.leaderName ?? (c.role === "leader" ? "自分（結成者）" : "-")}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <p className="label !mb-0.5">子分</p>
            <p className="font-bold">
              {d.followers.length > 0
                ? d.followers.map((f) => `${f.icon}${f.name}`).join("・")
                : "-"}
            </p>
          </div>
        </div>
      </header>

      <section className="card">
        <h2 className="section-title">📈 権力推移</h2>
        <LineChart
          series={[
            {
              label: `${c.name}の権力`,
              color: CHART_COLORS[0],
              points: powerSeries,
            },
          ]}
          yMin={1}
          yMax={10}
        />
        <ChartLegend
          series={[
            { label: `${c.name}`, color: CHART_COLORS[0], points: [] },
          ]}
        />
      </section>

      <section className="card">
        <h2 className="section-title">🗳️ 最近の投票</h2>
        {d.recentVotes.length === 0 ? (
          <p className="text-sm text-stone-400">まだ投票していません。</p>
        ) : (
          <div className="space-y-2">
            {d.recentVotes.map((v, i) => (
              <div key={i} className="rounded-xl border border-orange-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/proposals/${v.proposalId}`}
                      className="line-clamp-1 text-xs font-bold text-orange-600 hover:underline"
                    >
                      {v.proposalTitle}
                    </Link>
                    <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">
                      対象案: {v.content}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <ScoreChip score={v.score} />
                    <p className="mt-0.5 text-[10px] text-stone-300">
                      Turn {v.turnNumber}
                    </p>
                  </div>
                </div>
                {v.reason && (
                  <p className="mt-1.5 text-xs text-stone-400">「{v.reason}」</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">🔄 意見変更履歴</h2>
          {d.stanceChanges.length === 0 ? (
            <p className="text-sm text-stone-400">意見を変えた記録はありません。</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-stone-600">
              {d.stanceChanges.map((e) => (
                <li key={e.id}>
                  Turn {e.turnNumber}: 「{String(e.payload["opinion_snippet"] ?? "")}」{" "}
                  {String(e.payload["before_score"])} → {String(e.payload["after_score"])}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">🏛️ 派閥履歴</h2>
          {d.factionEvents.length === 0 ? (
            <p className="text-sm text-stone-400">派閥の移動履歴はありません。</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-stone-600">
              {d.factionEvents.map((e) => (
                <li key={e.id}>
                  Turn {e.turnNumber ?? "-"}: {e.text}{" "}
                  <span className="text-stone-300">{formatDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function buildPowerSeries(
  events: { turnNumber: number; before: number; after: number }[],
  current: number,
): { x: number; y: number }[] {
  if (events.length === 0) return [{ x: 0, y: current }];
  const points: { x: number; y: number }[] = [
    { x: 0, y: events[0]?.before ?? current },
  ];
  for (const e of events) points.push({ x: e.turnNumber, y: e.after });
  return points;
}
