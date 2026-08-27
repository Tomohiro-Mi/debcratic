"use client";

import { useActionState, useState } from "react";
import {
  saveSettingsAction,
  testLlmConnectionAction,
  upsertCatAction,
  type AdminActionState,
} from "@/app/actions/admin";
import {
  COMMENT_SUFFIXES,
  FOLLOWER_MAX_POWER,
  LEADER_POWER_THRESHOLD,
  SILENT_CAT_COMMENT,
} from "@/lib/constants";
import { isCatIconProxyUrl } from "@/lib/cat-icon";

export function CatForm({
  editingCat,
  factions,
}: {
  editingCat?: {
    id: string;
    name: string;
    icon: string;
    iconUrl: string | null;
    currentIcon: string;
    gender: "オス" | "メス" | "セン";
    commentSuffix: (typeof COMMENT_SUFFIXES)[number];
    silent: boolean;
    silentComment: string;
    power: number;
    factionId: string | null;
    role: "leader" | "follower" | null;
  } | null;
  factions: { id: string; name: string; leaderName: string }[];
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    upsertCatAction,
    {},
  );
  const c = editingCat ?? null;
  const [name, setName] = useState(c?.name ?? "");
  const [power, setPower] = useState(c?.power ?? 5);
  const [gender, setGender] = useState<"オス" | "メス" | "セン">(c?.gender ?? "セン");
  const [silent, setSilent] = useState(c?.silent ?? false);
  const [silentComment, setSilentComment] = useState(c?.silentComment ?? SILENT_CAT_COMMENT);
  const [isLeader, setIsLeader] = useState(c?.role === "leader");
  const [factionId, setFactionId] = useState(c?.role === "follower" ? c.factionId ?? "" : "");
  const canLead = power >= LEADER_POWER_THRESHOLD;
  const canFollow = power <= FOLLOWER_MAX_POWER;

  return (
    <form action={formAction} encType="multipart/form-data" className="card">
      <div className="flex items-center justify-between gap-2">
        <p className="section-title">{c ? `🐱 ${c.name} を編集` : "➕ 猫を追加"}</p>
        {c && (
          <button
            type="button"
            aria-label="編集を閉じる"
            title="編集を閉じる"
            onClick={(event) => {
              const details = event.currentTarget.form?.closest("details");
              if (details) details.open = false;
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-stone-400 hover:bg-orange-50 hover:text-orange-600"
          >
            ×
          </button>
        )}
      </div>
      {c && <input type="hidden" name="id" value={c.id} />}
      {c && <input type="hidden" name="currentIcon" value={c.currentIcon} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">名前</label>
          <input
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">アイコン（絵文字フォールバック）</label>
          <input name="icon" defaultValue={c?.icon ?? "🐱"} className="input" />
        </div>
        <div>
          <label className="label">アイコン画像URL（任意）</label>
          <input
            name="iconUrl"
            type="url"
            inputMode="url"
            defaultValue={c?.iconUrl ?? ""}
            className="input"
            placeholder="https://example.com/cat.png"
          />
          <p className="mt-1 text-[11px] text-stone-400">HTTPS画像URL、または下の画像ファイルを指定できます。</p>
          {c?.currentIcon && isCatIconProxyUrl(c.currentIcon) && (
            <label className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
              <input name="clearIconImage" type="checkbox" value="1" className="accent-orange-500" />
              現在のアップロード画像を解除する
            </label>
          )}
        </div>
        <div>
          <label className="label">アイコン画像をアップロード（任意）</label>
          <input
            name="iconFile"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="input file:mr-2 file:rounded-lg file:border-0 file:bg-orange-100 file:px-2 file:py-1 file:text-xs file:font-bold file:text-orange-700"
          />
          <p className="mt-1 text-[11px] text-stone-400">JPEG・PNG・WebP、2MB以下。ファイル指定時はURLより優先されます。</p>
        </div>
        <div>
          <label className="label">性別</label>
          <select
            name="gender"
            value={gender}
            onChange={(event) => setGender(event.target.value as "オス" | "メス" | "セン")}
            className="input"
          >
            <option value="オス">オス</option>
            <option value="メス">メス</option>
            <option value="セン">セン</option>
          </select>
        </div>
        <div>
          <label className="label">コメントの語尾</label>
          <select name="commentSuffix" defaultValue={c?.commentSuffix ?? "普通"} className="input">
            {COMMENT_SUFFIXES.map((suffix) => (
              <option key={suffix} value={suffix}>
                {suffix === "普通" ? "普通（指定なし）" : suffix}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-stone-400">この猫の投票理由コメントに反映されます。</p>
          <label className="mt-2 flex items-center gap-2 text-sm font-bold text-stone-700">
            <input
              name="silent"
              type="checkbox"
              value="1"
              checked={silent}
              onChange={(event) => setSilent(event.target.checked)}
              className="accent-orange-500"
            />
            <span>話さない</span>
          </label>
          <p className="mt-1 text-[10px] text-stone-400">
            投票理由は保存したまま、話さないがONの時は下の表示文言を表示します。
          </p>
          <label className="label mt-2">話さない際の表示文言</label>
          <input
            name="silentComment"
            value={silentComment}
            onChange={(event) => setSilentComment(event.target.value)}
            maxLength={200}
            className="input"
            placeholder={SILENT_CAT_COMMENT}
          />
          <p className="mt-1 text-[10px] text-stone-400">
            未入力の場合は「{SILENT_CAT_COMMENT}」を表示します。
          </p>
        </div>
        <div>
          <label className="label">初期権力（1〜10）</label>
          <input
            name="power"
            type="number"
            min={1}
            max={10}
            value={power}
            onChange={(event) => setPower(Number(event.target.value) || 0)}
            className="input"
          />
        </div>
        {canLead && (
          <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3">
            <label className="flex items-start gap-2 text-sm font-bold">
              <input
                name="isLeader"
                type="checkbox"
                value="1"
                checked={isLeader}
                onChange={(event) => setIsLeader(event.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <span>
                リーダーにする
                <span className="mt-0.5 block text-xs font-normal text-stone-500">
                  派閥名: {name.trim() || "猫名"}派
                </span>
              </span>
            </label>
          </div>
        )}
        {canFollow && (
          <div>
            <label className="label">初期所属派閥（子分）</label>
            <select
              name="factionId"
              value={factionId}
              onChange={(event) => setFactionId(event.target.value)}
              className="input"
            >
              <option value="">無所属</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.leaderName}派
                </option>
              ))}
            </select>
            {factions.length === 0 && (
              <p className="mt-1 text-[11px] text-stone-400">活動中の派閥がないため、現在は無所属になります。</p>
            )}
          </div>
        )}
        {!canLead && !canFollow && (
          <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
            権力6〜7では初期派閥を設定できません（無所属になります）。
          </p>
        )}
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
    opinionModel: string;
    commentModel: string;
    temperature: number;
    exilePenaltyProb: number;
    changeWindow: number;
    changeThreshold: number;
    runoffTurnLimit: number;
    voteIntervals: {
      within24h: number;
      withinWeek: number;
      withinMonth: number;
      afterMonth: number;
    };
    runoffVoteIntervalMinutes: number;
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
    opts?: { step?: string; min?: number; max?: number },
  ) => (
    <div key={name}>
      <label className="label">{label}</label>
      <input
        name={name}
        type="number"
        step={opts?.step ?? "any"}
        min={opts?.min}
        max={opts?.max}
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
          <div>
            <label className="label">意見の意味解析モデル</label>
            <input
              name="opinionModel"
              defaultValue={s.opinionModel}
              className="input"
              list="model-options"
              placeholder="google/gemini-2.5-flash"
            />
            <p className="mt-1 text-[10px] text-stone-400">
              投稿時に評価軸の値を推定するモデルです。Batch API専用（末尾が :batch）のモデルは選べません。
            </p>
          </div>
          <div>
            <label className="label">投票コメント生成モデル</label>
            <input
              name="commentModel"
              defaultValue={s.commentModel}
              className="input"
              list="model-options"
              placeholder="openai/gpt-4o-mini"
            />
            <p className="mt-1 text-[10px] text-stone-400">
              確定した投票値を猫の発言へ変換するモデルです。Batch API専用（末尾が :batch）のモデルは選べません。
            </p>
          </div>
          {field("temperature", "temperature", s.temperature, { step: "0.1" })}
          {field("exilePenaltyProb", "豹変ペナルティ確率", s.exilePenaltyProb, { step: "0.05" })}
          {field("changeWindow", "意見変更判定ウィンドウ(ターン)", s.changeWindow)}
          {field("changeThreshold", "意見変更ペナルティしきい値(回)", s.changeThreshold)}
          {field("runoffTurnLimit", "決選投票ターン数", s.runoffTurnLimit)}
          {field("voteIntervalWithin24h", "投稿から24時間以内（分）", s.voteIntervals.within24h, { step: "1", min: 1, max: 525600 })}
          {field("voteIntervalWithinWeek", "投稿から1週間以内（分）", s.voteIntervals.withinWeek, { step: "1", min: 1, max: 525600 })}
          {field("voteIntervalWithinMonth", "投稿から1ヶ月以内（分）", s.voteIntervals.withinMonth, { step: "1", min: 1, max: 525600 })}
          {field("voteIntervalAfterMonth", "投稿から1ヶ月超（分）", s.voteIntervals.afterMonth, { step: "1", min: 1, max: 525600 })}
          {field("runoffVoteIntervalMinutes", "決選投票の間隔（分）", s.runoffVoteIntervalMinutes, { step: "1", min: 1, max: 525600 })}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          初回投票は投稿直後に行われ、その後は投稿からの経過時間に応じた間隔で再投票します（1〜525600分）。24時間・1週間・1ヶ月の境界は投稿時刻を基準に判定します。決選投票は専用の間隔を使用します。
        </p>
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
          保存済みのAPIキーと2つのモデルでOpenRouterに実際に接続します。先に「設定を保存」してください。
          現在の状態: {" "}
          <b>
            {s.hasApiKey
              ? `キーあり(${s.apiKeySource === "db" ? "DB" : "環境変数"}) / 解析: ${s.opinionModel} / コメント: ${s.commentModel}`
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
