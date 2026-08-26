"use client";

import { useActionState } from "react";
import {
  saveSettingsAction,
  testLlmConnectionAction,
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
  modelOptions,
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
    apiKeySource: "db" | "env" | null;
    apiKeyHint: string | null;
  };
  modelOptions: string[];
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    saveSettingsAction,
    {},
  );
  const [testState, testAction, testing] = useActionState<
    AdminActionState,
    FormData
  >(testLlmConnectionAction, {});

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

  const keyStatus = s.apiKeySource === "db"
    ? `保存済み ${s.apiKeyHint ?? ""}（入力しない場合は現在のキーを維持します）`
    : s.apiKeySource === "env"
      ? "環境変数 OPENROUTER_API_KEY で設定中 — ここに保存するとDBが優先されます"
      : "未設定（デモモードで動作中）";

  return (
    <div className="space-y-4">
      <datalist id="model-options">
        {modelOptions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <form action={formAction} className="card">
        <p className="section-title">⚙️ システム設定</p>

        <div className="mb-4 rounded-xl bg-amber-50 p-3">
          <p className="label !text-amber-700">OpenRouter API KEY</p>
          <input
            name="llmApiKey"
            type="password"
            autoComplete="off"
            className="input"
            placeholder="sk-or-v1-..."
          />
          <p className="mt-1.5 text-xs text-amber-700">
            現状: {keyStatus}
          </p>
          <p className="mt-0.5 text-[10px] text-amber-600/80">
            キーは暗号化(AES-256-GCM)してDBに保存され、ブラウザには送信されません。
          </p>
          {s.apiKeySource === "db" && (
            <button
              type="submit"
              name="clearApiKey"
              value="1"
              className="btn btn-danger mt-2 !px-3 !py-1 text-xs"
            >
              保存したキーを削除
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">使用モデル</label>
            <input
              name="llmModel"
              defaultValue={s.llmModel}
              className="input"
              list="model-options"
              placeholder="openai/gpt-4o-mini"
            />
            <p className="mt-1 text-[10px] text-stone-400">
              入力して候補から選択、または自由入力（OpenRouterのモデルID）。
            </p>
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

      <form action={testAction} className="card">
        <p className="section-title">🔌 接続テスト</p>
        <p className="text-xs text-stone-500">
          保存済みのAPIキーとモデルでOpenRouterに実際に接続します。先に「設定を保存」してください。
          現在の状態:{" "}
          <b>
            {s.hasApiKey
              ? `キーあり(${s.apiKeySource === "db" ? "DB" : "環境変数"}) / ${s.llmModel}`
              : "キーなし（デモモード）"}
          </b>
        </p>
        {testState.error && (
          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
            {testState.error}
          </p>
        )}
        {testState.success && (
          <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
            {testState.success}
          </p>
        )}
        <button type="submit" disabled={testing} className="btn btn-ghost mt-3">
          {testing ? "テスト中…" : "接続テストを実行"}
        </button>
      </form>
    </div>
  );
}
