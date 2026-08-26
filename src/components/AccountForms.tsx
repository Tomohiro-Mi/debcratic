"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  updateAccountNameAction,
  type AuthActionState,
} from "@/app/actions/auth";

function Message({ state }: { state: AuthActionState }) {
  if (state.error) {
    return (
      <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
        {state.success}
      </p>
    );
  }
  return null;
}

export function AccountNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    updateAccountNameAction,
    {},
  );

  return (
    <form action={formAction} className="card">
      <h2 className="section-title">✏️ ユーザー名を変更</h2>
      <p className="mb-4 text-xs text-stone-500">
        議題や意見に表示される名前を変更します。確認のため現在のパスワードが必要です。
      </p>
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="account-name">新しいユーザー名</label>
          <input
            id="account-name"
            name="name"
            required
            maxLength={30}
            defaultValue={currentName}
            className="input"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="label" htmlFor="account-name-password">現在のパスワード</label>
          <input
            id="account-name-password"
            name="currentPassword"
            type="password"
            required
            className="input"
            autoComplete="current-password"
          />
        </div>
      </div>
      <Message state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {pending ? "変更中…" : "ユーザー名を変更"}
      </button>
    </form>
  );
}

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="card">
      <h2 className="section-title">🔒 パスワードを変更</h2>
      <p className="mb-4 text-xs text-stone-500">
        変更後は、現在使っている端末以外のログインも終了します。
      </p>
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="password-current">現在のパスワード</label>
          <input
            id="password-current"
            name="currentPassword"
            type="password"
            required
            className="input"
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label" htmlFor="password-new">新しいパスワード</label>
          <input
            id="password-new"
            name="newPassword"
            type="password"
            required
            minLength={8}
            maxLength={100}
            className="input"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label" htmlFor="password-confirm">新しいパスワード（確認）</label>
          <input
            id="password-confirm"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={100}
            className="input"
            autoComplete="new-password"
          />
        </div>
      </div>
      <Message state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {pending ? "変更中…" : "パスワードを変更"}
      </button>
    </form>
  );
}
