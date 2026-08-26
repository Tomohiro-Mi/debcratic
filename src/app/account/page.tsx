import Link from "next/link";
import { AccountNameForm, PasswordChangeForm } from "@/components/AccountForms";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireUser("/account");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black">⚙️ アカウント設定</h1>
        <p className="mt-1 text-sm text-stone-500">
          ユーザー名とパスワードを変更できます。
        </p>
      </div>

      <AccountNameForm currentName={session.name} />
      <PasswordChangeForm />

      <section className="card text-sm">
        <h2 className="section-title">📧 登録情報</h2>
        <p className="text-stone-500">
          メールアドレスや権限の変更が必要な場合は、管理者に連絡してください。
        </p>
        <Link href="/" className="mt-3 inline-block font-bold text-orange-600 hover:underline">
          議題一覧へ戻る →
        </Link>
      </section>
    </div>
  );
}
