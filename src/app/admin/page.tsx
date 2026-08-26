import Link from "next/link";
import { desc, eq, isNull } from "drizzle-orm";
import { cats, factions, reports, users } from "@/db/schema";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getEffectiveSettings } from "@/lib/settings";
import { CatForm, SettingsForm } from "@/components/admin/AdminForms";
import { CatAvatar } from "@/components/CatAvatar";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { fetchOpenRouterModels, POPULAR_MODELS } from "@/lib/llm";
import {
  resolveReportAction,
  moderateOpinionAction,
  moderateProposalAction,
  toggleBanUserAction,
} from "@/app/actions/admin";
import { toggleCatActiveAction } from "@/app/actions/admin";
import { formatDate } from "@/lib/format";
import { isCatIconImage } from "@/lib/cat-icon";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  const [catRows, factionRows, settings, reportRows, userRows, remoteModels] = await Promise.all([
    getDb().select().from(cats).orderBy(desc(cats.power)),
    getDb().select().from(factions).where(eq(factions.status, "active")).orderBy(factions.name),
    getEffectiveSettings(),
    getDb()
      .select({ r: reports, reporterName: users.name })
      .from(reports)
      .leftJoin(users, eq(reports.reporterId, users.id))
      .where(isNull(reports.resolvedAt))
      .orderBy(desc(reports.createdAt))
      .limit(30),
    getDb()
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(30),
    fetchOpenRouterModels(),
  ]);

  const modelOptions = [
    ...new Set([...POPULAR_MODELS, ...remoteModels]),
  ];
  const factionOptions = factionRows.map((f) => ({
    id: f.id,
    name: `${catRows.find((c) => c.id === f.leaderId)?.name ?? f.leaderId}派`,
    leaderName: catRows.find((c) => c.id === f.leaderId)?.name ?? f.leaderId,
  }));
  const factionNameById = new Map(factionOptions.map((f) => [f.id, f.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">🛠️ 管理画面</h1>
        <p className="mt-1 text-sm text-stone-500">
          猫の管理、システム設定、モデレーション。
        </p>
      </div>

      <SettingsForm s={settings} modelOptions={modelOptions} />

      <CatForm factions={factionOptions} />

      <section className="card">
        <h2 className="section-title">🐱 猫一覧</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400">
                <th className="py-1">猫</th>
                <th>権力</th>
                <th>派閥</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {catRows.map((c) => (
                <tr key={c.id} className={`border-t border-orange-50 ${c.active ? "" : "opacity-40"}`}>
                  <td className="py-2 font-bold whitespace-nowrap">
                    <Link href={`/cats/${c.id}`} className="hover:text-orange-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CatAvatar icon={c.icon} size={24} />
                        {c.name}
                      </span>
                    </Link>
                  </td>
                  <td className="tabular-nums">⚡{c.power}</td>
                  <td className="text-xs">
                    {c.factionId ? factionNameById.get(c.factionId) ?? "無所属" : "無所属"}
                  </td>
                  <td className="text-xs">{c.active ? "活動中" : "停止中"}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <details>
                        <summary className="btn btn-ghost !px-2 !py-1 text-[10px]">編集</summary>
                        <div className="absolute right-4 z-10 mt-2 w-[min(92vw,640px)]">
                          <CatForm
                            key={`${c.id}:${c.name}:${c.icon}:${c.gender}:${c.commentSuffix}:${c.silent}:${c.power}:${c.factionId ?? ""}:${c.leaderId ?? ""}`}
                            factions={factionOptions}
                            editingCat={{
                              id: c.id,
                              name: c.name,
                              icon: isCatIconImage(c.icon) ? "🐱" : c.icon,
                              iconUrl: /^https?:\/\//i.test(c.icon) ? c.icon : "",
                              currentIcon: c.icon,
                              gender: c.gender,
                              commentSuffix: c.commentSuffix,
                              silent: c.silent,
                              power: c.power,
                              factionId: c.factionId,
                              role: c.factionId ? (c.leaderId === c.id ? "leader" : "follower") : null,
                            }}
                          />
                        </div>
                      </details>
                      <form action={toggleCatActiveAction}>
                        <input type="hidden" name="catId" value={c.id} />
                        <button type="submit" className="btn btn-ghost !px-2 !py-1 text-[10px]">
                          {c.active ? "停止" : "有効化"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">🚨 通報（未解決 {reportRows.length}件）</h2>
        {reportRows.length === 0 ? (
          <p className="text-sm text-stone-400">通報はありません。平和な猫社会です 🐾</p>
        ) : (
          <div className="space-y-3">
            {reportRows.map(({ r, reporterName }) => (
              <div key={r.id} className="rounded-xl border border-red-100 p-3 text-sm">
                <p className="font-bold text-stone-600">
                  {r.targetType === "opinion" ? "💬 意見" : "🗳️ 議題"}への通報 ·{" "}
                  <span className="font-normal text-stone-400">
                    by {reporterName ?? "?"} / {formatDate(r.createdAt)}
                  </span>
                </p>
                {r.reason && <p className="mt-0.5 text-xs text-stone-500">理由: {r.reason}</p>}
                <p className="mt-0.5 break-all font-mono text-[10px] text-stone-300">{r.targetId}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.targetType === "opinion" && (
                    <form action={moderateOpinionAction}>
                      <input type="hidden" name="opinionId" value={r.targetId} />
                      <ConfirmSubmitButton
                        message="この意見を削除しますか？"
                        className="btn btn-danger !px-3 !py-1 text-xs"
                      >
                        意見を削除
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  {r.targetType === "proposal" && (
                    <form action={moderateProposalAction}>
                      <input type="hidden" name="proposalId" value={r.targetId} />
                      <ConfirmSubmitButton
                        message="この議題と投稿済みの意見を削除しますか？"
                        className="btn btn-danger !px-3 !py-1 text-xs"
                      >
                        議題を削除
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  <form action={resolveReportAction}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <button type="submit" className="btn btn-ghost !px-3 !py-1 text-xs">
                      対応済みにする
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">👥 ユーザー</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400">
              <th className="py-1">名前</th>
              <th>メール</th>
              <th>権限</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {userRows.map((u) => (
              <tr key={u.id} className="border-t border-orange-50">
                <td className="py-2 font-bold">{u.name}</td>
                <td className="text-xs text-stone-400">{u.email}</td>
                <td className="text-xs">{u.role === "admin" ? "管理者" : "一般"}</td>
                <td className="text-xs">{u.bannedAt ? "BAN" : "通常"}</td>
                <td className="text-right">
                  {u.role !== "admin" && (
                    <form action={toggleBanUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button type="submit" className="btn btn-ghost !px-2 !py-1 text-[10px]">
                        {u.bannedAt ? "解除" : "BAN"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
