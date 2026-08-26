import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";

export async function NavBar() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-20 border-b border-orange-100 bg-[#fbf6ec]/90 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-black whitespace-nowrap">
          <span className="text-2xl">🐱</span>
          <span className="hidden sm:inline">でぶねこによる民主主義</span>
          <span className="sm:hidden">でぶ民主</span>
        </Link>
        <div className="flex flex-1 items-center gap-3 text-sm font-bold text-stone-500">
          <Link href="/" className="hover:text-orange-600">
            議題
          </Link>
          <Link href="/cats" className="hover:text-orange-600">
            猫たち
          </Link>
          <Link href="/timeline" className="hover:text-orange-600">
            タイムライン
          </Link>
          {session?.role === "admin" && (
            <Link href="/admin" className="hover:text-orange-600">
              管理
            </Link>
          )}
        </div>
        {session ? (
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/account"
              aria-label="アカウント設定"
              className="font-bold text-stone-600 hover:text-orange-600"
            >
              {session.name}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost !px-3 !py-1.5 text-xs">
                ログアウト
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="btn btn-ghost !px-3 !py-1.5 text-xs">
              ログイン
            </Link>
            <Link href="/register" className="btn btn-primary !px-3 !py-1.5 text-xs">
              登録
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
