"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  postOpinionAction,
  type OpinionActionState,
} from "@/app/actions/proposals";

export function OpinionForm({ proposalId }: { proposalId: string }) {
  const [state, formAction, pending] = useActionState<OpinionActionState, FormData>(
    postOpinionAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state.success]);

  return (
    <form ref={ref} action={formAction} className="card">
      <p className="section-title">💬 意見を投稿する</p>
      <input type="hidden" name="proposalId" value={proposalId} />
      <textarea
        name="content"
        rows={5}
        maxLength={2000}
        required
        className="input resize-y"
        placeholder="でぶねこたちに向けた主張を書いてください。投稿すると全猫が即座に投票します。"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-400">
          同一議題への投稿は10分間隔に制限されています
        </p>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "猫たちが投票中…" : "投稿する 🐾"}
        </button>
      </div>
      {state.error && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
          {state.success}
        </p>
      )}
    </form>
  );
}
