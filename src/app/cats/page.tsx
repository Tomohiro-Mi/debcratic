import Link from "next/link";
import { getSocietyState } from "@/lib/queries";
import { CatAvatar } from "@/components/CatAvatar";
import { PowerBar } from "@/components/Bars";

export const dynamic = "force-dynamic";

export default async function CatsPage() {
  const { catsView, factionsView } = await getSocietyState();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">🐱 猫たち</h1>
        <p className="mt-1 text-sm text-stone-500">
          でぶねこ社会の権力構造。彼らは固定されたNPCではなく、議論の中で変化していきます。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...catsView]
          .sort((a, b) => b.power - a.power)
          .map((c) => (
            <Link
              key={c.id}
              href={`/cats/${c.id}`}
              className="card block transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <CatAvatar icon={c.icon} iconUrl={c.iconUrl} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-black">
                    {c.name}
                    {c.role === "leader" && <span title="リーダー">👑</span>}
                  </p>
                  <p className="truncate text-xs text-stone-400">性別: {c.gender}</p>
                </div>
              </div>
              <div className="mt-3">
                <PowerBar value={c.power} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                {c.factionName ? (
                  <span className="chip bg-orange-50 text-orange-600">
                    🏛️ {c.factionName}
                    {c.role === "follower" && c.leaderName ? `（${c.leaderName}の子分）` : ""}
                  </span>
                ) : (
                  <span className="chip bg-stone-100 text-stone-400">無所属</span>
                )}
                <span className="font-bold text-orange-500">プロフィール →</span>
              </div>
            </Link>
          ))}
      </div>

      {factionsView.length > 0 && (
        <section className="card">
          <h2 className="section-title">🏛️ 派閥一覧</h2>
          <div className="space-y-3">
            {factionsView.map((f) => {
              const followers = f.members.filter((m) => m.role === "follower");
              return (
                <div key={f.id} className="rounded-xl border border-orange-100 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <p className="font-black">{f.name}</p>
                    <p className="text-xs text-stone-400">
                      結成 Turn {f.foundedTurn} · 総権力 ⚡
                      {f.members.reduce((a, m) => a + m.power, 0)} · 子分上限{" "}
                      {Math.max(0, Math.min(3, (f.members.find((m) => m.role === "leader")?.power ?? 0) - 7))}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    👑 リーダー: {f.leaderName}
                    {followers.length > 0 && (
                      <>
                        {" · "}子分: {followers.map((m) => m.name).join(" ")}
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
