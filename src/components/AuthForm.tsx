"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/app/actions/auth";

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "register";
  next?: string;
}) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="card mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-black">
        {mode === "login" ? "ログイン" : "新規登録"}
      </h1>
      <input type="hidden" name="next" value={next ?? "/"} />
      <div className="space-y-3">
        {mode === "register" && (
          <div>
            <label className="label">名前</label>
            <input name="name" required maxLength={30} className="input" placeholder="有権者たろう" />
          </div>
        )}
        <div>
          <label className="label">メールアドレス</label>
          <input
            name="email"
            type="email"
            required
            className="input"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label">パスワード</label>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : 1}
            className="input"
            placeholder="********"
          />
        </div>
      </div>
      {state.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4 w-full">
        {pending ? "処理中…" : mode === "login" ? "ログイン" : "アカウントを作成"}
      </button>
      <p className="mt-4 text-center text-xs text-stone-500">
        {mode === "login" ? (
          <>
            初めての方は{" "}
            <Link href="/register" className="font-bold text-orange-600 hover:underline">
              新規登録
            </Link>
          </>
        ) : (
          <>
            既に登録済みなら{" "}
            <Link href="/login" className="font-bold text-orange-600 hover:underline">
              ログイン
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
