# 🐱 でぶねこによる民主主義

ユーザーの議論を入力として、でぶねこ社会の**世論・権力・派閥**が継続的に変化していく政治社会シミュレーション。

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
次回の投票結果が変化する …（循環）
```

## 技術スタック

| レイヤ | 技術 |
|---|---|
| Framework | Next.js 16 (App Router) / React 19 / TypeScript |
| Styling | Tailwind CSS v4 |
| DB | PostgreSQL + Drizzle ORM |
| LLM | OpenRouter API（Structured Output）※キー未設定時はデモモード |
| 認証 | メール/パスワード + JWT Cookie (jose + bcryptjs) |
| デプロイ | Vercel (+ Vercel Cron) |

## 機能

### 実装済み（Phase 1〜4 のコア）

- ユーザー登録・ログイン（最初の登録者 or `ADMIN_EMAIL` 一致者が管理者）
- 猫6匹のシードデータ（性別・権力つき）
- 猫管理（画像URLアイコン・オス/メス/セン選択・初期所属派閥）
- 議題作成（タイトル/説明/締切/**議題固有パラメータ**と各猫の値を設定、評価軸は最大20個）
- 意見投稿 → **即時初回投票**（全猫が一括でLLM評価、1 API Call/意見）
- Point = Σ賛同度 ＋ 平均賛同度・賛成/中立/反対割合・分極度
- 再投票スケジューラ（投稿から24時間以内／1週間以内／1ヶ月以内／それ以降で間隔を切り替え）
- 管理画面から通常投票の4区分と決選投票の間隔を分単位で指定（1〜525600分、初回投票は即時）
- 過去3投票＋理由をLLMコンテキストへ反映
- 意見変更判定（3分類: 反対/-10..-2, 中立/-1..+1, 賛成/+2..+10）と豹変ペナルティ
- **Rule Engine**（決定論的・Seed付き乱数で再現可能）
  - Point上昇→最高賛同猫+1/最低賛同猫-1（下降時は逆）
  - 権力総量保存（1〜10、ゼロサム正規化）
  - 派閥結成(権力8+)/子分補充(議題評価軸の類似度最大)/独立(5+)/破門(3未満)/解散(8未満)
- ベイズ推定による意見パラメータ推定
- Event Sourcing（全状態変化をイベント記録 → 議題ごとのタイムライン・履歴・グラフ再現）
- 議題ごとに権力・派閥シミュレーションの初期状態を保存し、議題間で状態を共有しない
- UI: 議題ランキング/各猫の投票カード（理由+要因内訳）/猫プロフィール/権力グラフ/派閥一覧/議題内タイムライン
- 決選投票フロー（同率1位 → RUNOFF_PENDING → 発案者開始 or 24h自動 → 5ターン → タイブレーク）
- 管理：猫CRUD（画像URL・性別・初期派閥）、**LLM設定（API KEY暗号化保存/モデル候補付き選択/temperature/各種閾値/接続テスト）**、議題・意見の削除、通報・BAN
- Rate Limit（ユーザーごとに直近24時間で10件）、Prompt Injection対策（`<user_opinion>`分離）

### Turn処理順（§43 準拠）

`src/lib/rules/faction.ts` の `simulateSocialTurn()` に実装。順序は仕様どおり固定:
再投票 → Point再計算 → 意見変更判定 → 権力変動候補 → 総量調整 → 確定 → 解散判定 → 独立判定 → 破門判定 → 新規リーダー判定 → 子分補充 → イベント記録 → 次回スケジュール設定

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
| `BLOB_READ_WRITE_TOKEN` | - | Vercel Blobの読み書きトークン。管理画面から猫画像をアップロードする場合に必要 |
| `ADMIN_EMAIL` | ✅（本番） | このメールで登録すると管理者になる。Productionでは未設定だと新規登録を停止 |
| `CRON_SECRET` | ✅（本番） | `/api/cron` のBearer認証。Productionでは必須 |
| `DEMO_SEED` | - | シード時に `1` を渡すとデモ用議題も作成 |

### ローカルDB（Docker例）

```bash
docker run -d --name debcratic-pg -e POSTGRES_PASSWORD=debcratic \
  -e POSTGRES_DB=debcratic -p 55432:5432 postgres:16-alpine
# .env.local: DATABASE_URL=postgres://postgres:debcratic@localhost:55432/debcratic
```

## Vercel へのデプロイ

1. GitHub リポジトリを Vercel に Import（Framework PresetはNext.jsのまま、Build Commandは`npm run build`）。
2. VercelのProject Settings → Environment Variablesに、Production用の値を設定する。
   `AUTH_SECRET` と `CRON_SECRET` はそれぞれ別の32文字以上のランダム値にする。
3. `DEMO_SEED` は本番では設定しない。設定すると既知のデモ管理者アカウントが作られるため。
4. Deploy（`vercel.json` によりUTC 0:00の1日1回クロン `/api/cron` が登録される）。
5. 初回のみ、本番DBに対してローカルから `DATABASE_URL=<本番URL> npm run db:push && npm run db:seed` を実行する（`DEMO_SEED`は未設定）。
6. `ADMIN_EMAIL`を設定してから最初の管理者アカウントを登録し、`/admin`へログインできることを確認する。

ランダム値の例:

```bash
openssl rand -base64 48  # AUTH_SECRET用
openssl rand -base64 48  # CRON_SECRET用（AUTH_SECRETとは別の値）
```

Vercel上では、`DATABASE_URL`にNeon/Vercel Postgres等の本番Postgres接続URLを設定する。`OPENROUTER_API_KEY`は任意で、未設定ならデモモードで動作する。APIキーを使う場合はVercelの環境変数に登録するか、デプロイ後に管理画面から暗号化保存する。

猫画像のアップロードを使う場合は、Vercel StorageでBlobストアを作成し、Productionを接続対象にする。自動作成される`BLOB_READ_WRITE_TOKEN`をVercelの環境変数へ設定すると、管理画面からJPEG・PNG・WebP（2MB以下）を保存できる。

`vercel.json`のCronはHobbyプランでデプロイできるよう1日1回にしている。短い投票間隔を設定する場合やPro以上で高頻度に処理したい場合は、Cronのscheduleを`0 * * * *`などに変更して再デプロイする。Cronの時刻はUTCで、ページ閲覧時にも遅れていた処理をcatch-upする。通常投票の間隔は意見の投稿時刻を基準に、24時間以内・1週間以内・1ヶ月以内・それ以降の区分で判定する。

> **再投票について**: ページ閲覧時にも遡及処理（catch-up）が走るため、クロンなしでも時間経過分のターンが自動処理されます。クロンは確実な定期実行のための補助です。Vercel Hobby プランではクロンのスケジュール制限があるため、この二段構えにしています。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` / `build` / `start` | 開発 / 本番ビルド / 本番起動 |
| `npm test` | ユニットテスト（ルールエンジン・20ターン社会シミュレーション等） |
| `npm run typecheck` / `lint` | 型チェック / ESLint |
| `npm run db:push` | スキーマをDBへ反映 |
| `npm run db:seed` | シードデータ投入（`DEMO_SEED=1` でデモ議題も） |

## アーキテクチャ

```
src/
├─ app/
│  ├─ page.tsx                    # トップ（進行中/終了議題）
│  ├─ proposals/[id]/page.tsx     # 議題詳細（ランキング・投票・議題内タイムライン）
│  ├─ proposals/new/page.tsx      # 議題作成
│  ├─ cats/[id]/page.tsx          # 猫プロフィール（権力グラフ・履歴）
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
- **既知の脆弱性スキャンについて**: `npm audit` で drizzle-kit（開発用CLIのみ）経由の esbuild 中危険度4件が残っています。アップストリームに修正版が未リリースのため。ランタイムには影響しません（drizzle-kitは `db:push` 等の開発時コマンドでのみ使用）。
- **API KEY**: 管理画面から保存すると AES-256-GCM（`AUTH_SECRET`由来の鍵）で暗号化してDBに保存。ブラウザへは送信されず、UIでは下4桁のみ表示（§67）。環境変数 `OPENROUTER_API_KEY` も利用可（DB保存キーが優先）。
- **監査ログ**: 全LLM呼び出しを `llm_logs` に記録（model/prompt_version/input_hash/output、§68）。
