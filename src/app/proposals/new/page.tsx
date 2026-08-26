import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getActiveCats } from "@/lib/queries";
import { ProposalForm } from "@/components/ProposalForm";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  title: "タイトルを入力してください（120字以内）",
  description: "説明は4000字以内にしてください",
  deadline: "締め切りは未来の日時にしてください",
  params: "評価軸を1つ以上入力してください",
  dup: "評価軸に重複があります",
  nocats: "活動中の猫がいないため、議題を作成できません",
};

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/proposals/new");
  const { error } = await searchParams;

  const cats = await getActiveCats();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black">🗳️ 議題を作成</h1>
        <p className="mt-1 text-sm text-stone-500">
          議題と評価軸を設定し、各猫の価値観を定義して猫社会に問いかけよう。
        </p>
      </div>
      {error && ERRORS[error] && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {ERRORS[error]}
        </p>
      )}
      <ProposalForm
        cats={cats.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
        }))}
      />
    </div>
  );
}
