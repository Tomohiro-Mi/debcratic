"use client";

import { useActionState } from "react";
import {
  saveSettingsAction,
  upsertCatAction,
  type AdminActionState,
} from "@/app/actions/admin";

const PERSONALITY_PARAMS = [
  "協調性",
  "保守性",
  "好奇心",
  "自己利益志向",
  "集団利益志向",
] as const;

export function CatForm({
  editingCat,
}: {
  editingCat?: {
    id: string;
    name: string;
    type: string;
    icon: string;
    gender: string;
    power: number;
    permanentParams: Record<string, number>;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    upsertCatAction,
    {},
  );
  const c = editingCat ?? null;

  return (
    <form action={formAction} className="card">
      <p className="section-title">{c ? `🐱 ${c.name} を編集` : "➕ 猫を追加"}</p>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">名前</label>
          <input name="name" required defaultValue={c?.name} className="input" />
        </div>
        <div>
          <label className="label">種類</label>
          <input
            name="type"
            required
            defaultValue={c?.type}
            className="input"
            placeholder="ミケ / 茶トラ ..."
          />
        </div>
        <div>
          <label className="label">アイコン（絵文字）</label>
          <input name="icon" defaultValue={c?.icon ?? "🐱"} className="input" />
        </div>
        <div>
          <label className="label">性別</label>
          <input
            name="gender"
            defaultValue={c?.gender ?? "不明"}
            className="input"
            placeholder="オス / メス / 不明"
          />
        </div>
        <div>
          <label className="label">初期権力（1〜10）</label>
          <input
            name="power"
            type="number"
            min={1}
            max={10}
            defaultValue={c?.power ?? 5}
            className="input"
          />
        </div>
      </div>
      <p className="label mt-4">恒久パラメータ（1〜10）</p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {PERSONALITY_PARAMS.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs font-bold text-stone-500">{p}</span>
            <input
              type="range"
              name={`pp:${p}`}
              min={1}
              max={10}
              defaultValue={c?.permanentParams?.[p] ?? 5}
              className="flex-1 accent-orange-500"
            />
          </div>
        ))}
      </div>
      {state.error && <p className="mt-3 text-sm font-bold text-red-600">{state.error}</p>}
      {state.success && (
        <p className="mt-3 text-sm font-bold text-green-600">{state.success}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {pending ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}

export function SettingsForm({
  s,
}: {
  s: {
    llmModel: string;
    temperature: number;
    exilePenaltyProb: number;
    assimilationProb: number;
    assimilationMinTurns: number;
    changeWindow: number;
    changeThreshold: number;
    runoffTurnLimit: number;
    hasApiKey: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    saveSettingsAction,
    {},
  );

  const field = (
    name: string,
    label: string,
    value: number | string,
    opts?: { step?: string },
  ) => (
    <div key={name}>
      <label className="label">{label}</label>
      <input
        name={name}
        type="number"
        step={opts?.step ?? "any"}
        defaultValue={value}
        className="input"
      />
    </div>
  );

  return (
    <form action={formAction} className="card">
      <p className="section-title">⚙️ システム設定</p>
      <p className="mb-3 text-xs text-stone-500">
        未入力の項目は既定値を使用します。OpenRouter APIキーは環境変数{" "}
        <code className="rounded bg-stone-100 px-1">OPENROUTER_API_KEY</code>{" "}
        でのみ設定できます（現在:{" "}
        <b>{s.hasApiKey ? "設定済み ✅ 実際のLLMで投票" : "未設定 ❌ デモモードで動作"}</b>）
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">使用モデル</label>
          <input name="llmModel" defaultValue={s.llmModel} className="input" />
        </div>
        {field("temperature", "temperature", s.temperature, { step: "0.1" })}
        {field("exilePenaltyProb", "豹変ペナルティ確率", s.exilePenaltyProb, { step: "0.05" })}
        {field("assimilationProb", "思想同化確率", s.assimilationProb, { step: "0.05" })}
        {field("assimilationMinTurns", "思想同化までの最低同棲ターン", s.assimilationMinTurns)}
        {field("changeWindow", "意見変更判定ウィンドウ(ターン)", s.changeWindow)}
        {field("changeThreshold", "意見変更ペナルティしきい値(回)", s.changeThreshold)}
        {field("runoffTurnLimit", "決選投票ターン数", s.runoffTurnLimit)}
      </div>
      {state.error && <p className="mt-3 text-sm font-bold text-red-600">{state.error}</p>}
      {state.success && (
        <p className="mt-3 text-sm font-bold text-green-600">{state.success}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary mt-4">
        {pending ? "保存中…" : "設定を保存"}
      </button>
    </form>
  );
}
