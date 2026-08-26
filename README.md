# 🐱 でぶねこによる民主主義

ユーザーの議論を入力として、でぶねこ社会の**世論・権力・派閥・思想**が継続的に変化していく政治社会シミュレーション。

```
ユーザーが意見を投稿
    ↓
猫たちがLLMで評価（-10〜+10）
    ↓
世論が形成され Point が算出される
    ↓
権力構造が変化（ゼロサム）
    ↓
派閥が結成・崩壊する
    ↓
思想が同化・反発する
    ↓
次回の投票結果が変化する …（循環）
```

## 技術スタック

| レイヤ | 技術 |
|---|---|
| Framework | Next.js 15 (App Router) / React 19 / TypeScript |
| Styling | Tailwind CSS v4 |
| DB | PostgreSQL + Drizzle ORM |
| LLM | OpenRouter API（Structured Output）※キー未設定時はデモモード |
| 認証 | メール/パスワード + JWT Cookie (jose + bcryptjs) |
| デプロイ | Vercel (+ Vercel Cron) |

## 機能

### 実装済み（Phase 1〜4 のコア）

- ユーザー登録・ログイン（最初の登録者 or `ADMIN_EMAIL` 一致者が管理者）
- 猫6匹のシードデータ（価値観パラメータ・権力つき）
- 議題作成（タイトル/説明/締切/**議題固有パラメータ**と各猫の値を設定）
- 意見投稿 → **即時初回投票**（全猫が一括でLLM評価、1 API Call/意見）
- Point = Σ賛同度 ＋ 平均賛同度・賛成/中立/反対割合・分極度
- 再投票スケジューラ（投稿後24hは毎時 → 1週間は1日2回 → 以降週1、§33準拠）
- 過去3投票＋理由をLLMコンテキストへ反映
- 意見変更判定（3分類: 反対/-10..-2, 中立/-1..+1, 賛成/+2..+10）と豹変ペナルティ
- **Rule Engine**（決定論的・Seed付き乱数で再現可能）
  - Point上昇→最高賛同猫+1/最低賛同猫-1（下降時は逆）
  - 権力総量保存（1〜10、ゼロサム正規化）
  - 派閥結成(権力8+)/子分補充(類似度最大)/独立(5+)/破門(3未満+思想反発)/解散(8未満)
  - 師弟関係5ターン以上→思想同化(確率0.5)
- ベイズ推定による意見パラメータ推定
- Event Sourcing（全状態変化をイベント記録 → タイムライン・履歴・グラフ再現）
- UI: 議題ランキング/各猫の投票カード（理由+要因内訳）/猫プロフィール/権力グラフ/派閥一覧/猫社会タイムライン
- 決選投票フロー（同率1位 → RUNOFF_PENDING → 発案者開始 or 24h自動 → 5ターン → タイブレーク）
- 管理：猫CRUD、**LLM設定（API KEY暗号化保存/モデル候補付き選択/temperature/各種閾値/接続テスト）**、通報・削除・BAN
- Rate Limit（同一議題への投稿は10分間隔）、Prompt Injection対策（`<user_opinion>`分離）

### Turn処理順（§43 準拠）

`src/lib/rules/faction.ts` の `simulateSocialTurn()` に実装。順序は仕様どおり固定:
再投票 → Point再計算 → 意見変更判定 → 権力変動候補 → 総量調整 → 確定 → 解散判定 → 独立判定 → 破門判定 → 新規リーダー判定 → 子分補充 → 思想同化 → イベント記録 → 次回スケジュール設定

## セットアップ

```bash
npm install
cp .env.example .env.local   # 編集する
npm run db:push              # テーブル作成
npm run db:seed              # 猫6匹を投入
npm run dev                  # http://localhost:3000
```

### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres 接続URL（Neon / Vercel Postgres / ローカル等） |
| `AUTH_SECRET` | ✅ | セッション署名用の長いランダム文字列 |
| `OPENROUTER_API_KEY` | - | 未設定なら**デモモード**（決定論的なモック投票で全機能動作）。**管理画面からも設定可（暗号化保存・環境変数より優先）** |
| `OPENROUTER_MODEL` | - | 既定 `openai/gpt-4o-mini`（管理画面でも変更可） |
| `ADMIN_EMAIL` | - | このメールで登録すると管理者になる |
| `CRON_SECRET` | - | 設定すると `/api/cron` を Bearer 認証で保護 |
| `DEMO_SEED` | - | シード時に `1` を渡すとデモ用議題も作成 |

### ローカルDB（Docker例）

```bash
docker run -d --name debcratic-pg -e POSTGRES_PASSWORD=debcratic \
  -e POSTGRES_DB=debcratic -p 55432:5432 postgres:16-alpine
# .env.local: DATABASE_URL=postgres://postgres:debcratic@localhost:55432/debcratic
```

## Vercel へのデプロイ

1. GitHub リポジトリを Vercel に Import
2. 環境変数を設定（`DATABASE_URL`, `AUTH_SECRET`, 必要に応じて `OPENROUTER_API_KEY` 等）
3. Deploy（`vercel.json` により毎時クロン `/api/cron` が自動登録される）
4. 初回のみ本番DBに対して `DATABASE_URL=<本番URL> npm run db:push && npm run db:seed` を実行

> **再投票について**: ページ閲覧時にも遡及処理（catch-up）が走るため、クロンなしでも時間経過分のターンが自動処理されます。クロンは確実な定期実行のための補助です。Vercel Hobby プランではクロンのスケジュール制限があるため、この二段構えにしています。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` / `build` / `start` | 開発 / 本番ビルド / 本番起動 |
| `npm test` | ユニットテスト（ルールエンジン等 26件） |
| `npm run typecheck` / `lint` | 型チェック / ESLint |
| `npm run db:push` | スキーマをDBへ反映 |
| `npm run db:seed` | シードデータ投入（`DEMO_SEED=1` でデモ議題も） |

## アーキテクチャ

```
src/
├─ app/
│  ├─ page.tsx                    # トップ（進行中/終了議題）
│  ├─ proposals/[id]/page.tsx     # 議題詳細（ランキング・投票・タイムライン）
│  ├─ proposals/new/page.tsx      # 議題作成
│  ├─ cats/[id]/page.tsx          # 猫プロフィール（権力グラフ・履歴）
│  ├─ timeline/page.tsx           # 猫社会タイムライン
│  ├─ admin/page.tsx              # 管理画面
│  ├─ api/cron/route.ts           # 定期実行エントリ
│  └─ actions/                    # Server Actions (auth/proposals/admin)
├─ lib/
│  ├─ rules/faction.ts            # 派閥・権力シミュレーション（純粋関数・テスト済み）
│  ├─ rules/turn.ts               # Turn実行オーケストレータ（トランザクション）
│  ├─ rules/points.ts             # Point/スタンス/分極度
│  ├─ llm.ts                      # OpenRouter呼び出し + デモモック
│  ├─ bayes.ts                    # 意見パラメータのベイズ推定
│  ├─ scheduler.ts                # 再投票間隔ロジック（§33）
│  └─ catchup.ts                  # 締切処理・決選投票・遡及実行
└─ db/schema.ts                   # Drizzle スキーマ（Event Sourcing）
```

## 設計メモ

- **LLMが判断しないもの**: 権力変動・派閥成立/解散/破門・Point計算・決選投票はすべて Rule Engine が決定論的に処理（§22）。LLMは賛同度・理由・要因の生成のみ。
- **Seed付き乱数**: 各Turnの `random_seed` を保存し、同一入力から同一結果を再現可能（§44）。
- **API KEY**: 管理画面から保存すると AES-256-GCM（`AUTH_SECRET`由来の鍵）で暗号化してDBに保存。ブラウザへは送信されず、UIでは下4桁のみ表示（§67）。環境変数 `OPENROUTER_API_KEY` も利用可（DB保存キーが優先）。
- **監査ログ**: 全LLM呼び出しを `llm_logs` に記録（model/prompt_version/input_hash/output、§68）。
