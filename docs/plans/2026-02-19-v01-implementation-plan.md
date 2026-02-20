# v0.1 実装計画書

## 概要

Giddy v0.1（MVP）の実装計画。GitHub Issue と Discord Forum Channel の双方向同期 Bot を Cloudflare Workers 上に構築する。

**完了条件:**

- GitHub で Issue を作成すると Discord Forum に Post が自動生成される
- Issue の編集・クローズ・リオープン・コメントが Discord に同期される
- Discord から `/comment`, `/create-issue`, `/summarize` が実行できる
- エコーループ防止と冪等性が確保されている
- dev / production の 2 環境が稼働し、main マージで自動デプロイされる

**参照ドキュメント（giddy-research）:**

- `giddy-spec-overview.md` — 仕様の全体像
- `research/design/directory-structure.md` — ディレクトリ構成
- `research/design/markdown-conversion.md` — Markdown 変換ルール
- `research/strategy/v01-build-strategy.md` — 構築戦略の原案
- `environment-setup.md` — 環境構成ガイド

---

## Phase 一覧と依存関係

```text
Phase 1-2（人間）外部サービス + Cloudflare リソース
  │
  │ 収集した値を Claude に渡す
  ▼
Phase 3（Claude）リポジトリ初期化 — 依存追加、スキーマ、最小 Worker
  │
  │ Worker URL が確定
  ▼
Phase 4（人間）Doppler シークレット管理
  │
  │ Sync 完了を Claude に伝える
  ▼
Phase 5（人間 + Claude）手動デプロイ + エンドポイント URL 設定
  │
  ▼
Phase 6-7（Claude）CI/CD 調整 + リリースフロー通し
  │
  ▼
Phase 8（Claude）機能実装
  Step 1: GitHub → Discord 片方向同期
  Step 2: GitHub → Discord 拡張（edit/close/reopen/comment）
  Step 3: Discord → GitHub（/comment → /create-issue → /summarize）
  Step 4: 整合性（エコーループ防止、冪等性）
```

---

## Phase 1-2: 外部サービス作成（人間タスク）

> Phase 1 と Phase 2 は互いに独立しているため並行作業可能。

### 1. Discord サーバー作成

- [X] ~~テスト用サーバー `Giddy Dev` を作成~~ [2026-02-19]
- [X] ~~本番用サーバーを作成（既存でも可）~~ [2026-02-19]
- [X] ~~各サーバーに Forum Channel `#github-issues` を作成~~ [2026-02-19]
- [X] ~~開発者モードを有効化（ユーザー設定 → 詳細設定 → 開発者モード）~~ [2026-02-19]

> **実践メモ:**
> - サーバーテンプレートは「オリジナル」を選択（他のテンプレートは不要なチャンネルが大量に作られる）
> - Forum Channel 作成時の推奨権限・タグ等の設定はデフォルトのままでよい（後から変更可能）

| 値 | テスト用 | 本番用 |
|---|---|---|
| Guild ID | `1473973356788191369` | `1473974561723912316` |
| Forum Channel ID | `1473973552943206510` | `1473974620204961845` |

### 2. GitHub App 作成（dev 用 + prod 用の 2 つ）

> **順序:** dev 用を先に作成し、動作確認後に同じ手順で prod 用を作成する。

各 App について:

#### dev

- [X] ~~GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**~~ [2026-02-19]
- [X] ~~App name: dev 用 = `Giddy Bot Dev`~~ [2026-02-19]
- [X] ~~Homepage URL: `https://github.com/aromarious/giddy-app`~~ [2026-02-19]
- [X] ~~Webhook URL: `https://placeholder.example.com`（Phase 5 で更新）~~ [2026-02-19]
- [X] ~~Webhook secret: `openssl rand -hex 20` で生成（dev / prod 別々）~~ [2026-02-19]
- [X] ~~Permissions: Issues = Read & Write, Metadata = Read~~ [2026-02-19]
- [X] ~~Subscribe to events: `Issues`, `Issue comment`~~ [2026-02-19]
- [X] ~~**Create GitHub App** → App ID をメモ~~ [2026-02-19]
- [X] ~~**Generate a private key** → `.pem` をダウンロード~~ [2026-02-19]
- [X] ~~`.pem` を Base64 エンコード: `base64 -i <file>.private-key.pem`（macOS）~~ [2026-02-19]
- [X] ~~Install: dev 用 → テスト用リポジトリ(aromarious/Giddy-dev)~~ [2026-02-19]

#### prod

- [X] ~~GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**~~ [2026-02-19]
- [X] ~~App name: prod 用 = `Giddy Bot`~~ [2026-02-19]
- [X] ~~Homepage URL: `https://github.com/aromarious/giddy-app`~~ [2026-02-19]
- [X] ~~Webhook URL: `https://placeholder.example.com`（Phase 5 で更新）~~ [2026-02-19]
- [X] ~~Webhook secret: `openssl rand -hex 20` で生成（dev / prod 別々）~~ [2026-02-19]
- [X] ~~Permissions: Issues = Read & Write, Metadata = Read~~ [2026-02-19]
- [X] ~~Subscribe to events: `Issues`, `Issue comment`~~ [2026-02-19]
- [X] ~~**Create GitHub App** → App ID をメモ~~ [2026-02-19]
- [X] ~~**Generate a private key** → `.pem` をダウンロード~~ [2026-02-19]
- [X] ~~`.pem` を Base64 エンコード: `base64 -i <file>.private-key.pem`（macOS）~~ [2026-02-19]
- [X] ~~Install: prod 用 → 本番リポジトリ(aromarious/Giddy-prod)~~ [2026-02-19]

| 値 | dev 用 | prod 用 |
|---|---|---|
| `GITHUB_APP_ID` | 取得済み（Phase 4 で Doppler に登録） | 取得済み（Phase 4 で Doppler に登録） |
| `GITHUB_WEBHOOK_SECRET` | 取得済み（Phase 4 で Doppler に登録） | 取得済み（Phase 4 で Doppler に登録） |
| `GITHUB_APP_PRIVATE_KEY`（Base64） | 取得済み（Phase 4 で Doppler に登録） | 取得済み（Phase 4 で Doppler に登録） |

### 3. Discord Application 作成（dev 用 + prod 用の 2 つ）

> **順序:** dev 用を先に作成し、動作確認後に同じ手順で prod 用を作成する。

各 Application について:

#### Giddy Dev
- [X] ~~[Discord Developer Portal](https://discord.com/developers/applications) → New Application~~ [2026-02-19]
- [X] ~~App name: dev 用 = `Giddy Dev`~~ [2026-02-19]
- [X] ~~General Information → Application ID と Public Key をメモ~~ [2026-02-19]
- [X] ~~Bot タブ → Bot Token をリセットしてメモ（**この画面を閉じると再表示不可**）~~ [2026-02-19]
- [X] ~~Privileged Gateway Intents → `MESSAGE_CONTENT` を **ON**~~ [2026-02-19]
- [X] ~~OAuth2 → URL Generator:~~ [2026-02-19]
  - Scopes: `bot`, `applications.commands`
  - Bot Permissions: Send Messages, Send Messages in Threads, Manage Threads, Read Message History, Create Public Threads
- [X] ~~生成 URL でBot を招待: dev 用 → `Giddy Dev` サーバー~~ [2026-02-19]
- [ ] **Interactions Endpoint URL は Phase 5 で設定**（Worker デプロイ後でないと PING 検証が通らない）

#### Giddy
- [X] ~~[Discord Developer Portal](https://discord.com/developers/applications) → **New Application**~~ [2026-02-19]
- [X] ~~App name: prod 用 = `Giddy`~~ [2026-02-19]
- [X] ~~General Information → Application ID と Public Key をメモ~~ [2026-02-19]
- [X] ~~Bot タブ → Bot Token をリセットしてメモ（**この画面を閉じると再表示不可**）~~ [2026-02-19]
- [X] ~~Privileged Gateway Intents → `MESSAGE_CONTENT` を **ON**~~ [2026-02-19]
- [X] ~~OAuth2 → URL Generator:~~ [2026-02-19]
  - Scopes: `bot`, `applications.commands`
  - Bot Permissions: Send Messages, Send Messages in Threads, Manage Threads, Read Message History, Create Public Threads
- [X] ~~生成 URL でBot を招待: dev 用 → `Giddy Dev` サーバー / prod 用 → 本番サーバー~~ [2026-02-19]
- [X] ~~**Interactions Endpoint URL は Phase 5 で設定**（Worker デプロイ後でないと PING 検証が通らない）~~ [2026-02-19]

| 値 | dev 用 | prod 用 |
|---|---|---|
| `DISCORD_APPLICATION_ID` | 取得済み（Phase 4 で Doppler に登録） | 取得済み（Phase 4 で Doppler に登録） |
| `DISCORD_PUBLIC_KEY` | 取得済み（Phase 4 で Doppler に登録） | 取得済み（Phase 4 で Doppler に登録） |
| `DISCORD_BOT_TOKEN` | 取得済み（Phase 4 で Doppler に登録） | 取得済み（Phase 4 で Doppler に登録） |

### 4. Cloudflare API Token 発行

- [X] ~~Cloudflare Dashboard → My Profile → API Tokens → **Create Token**~~ [2026-02-19]
- [X] ~~テンプレート: **Edit Cloudflare Workers**~~ [2026-02-19]
- [X] ~~権限追加: D1 (Edit), Account Settings (Read)~~ [2026-02-19]
- [X] ~~Account ID をメモ（Dashboard トップ右サイドバー）~~ [2026-02-19]

| 値 | |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 取得済み（Phase 4 で Doppler に登録） |
| `CLOUDFLARE_ACCOUNT_ID` | 取得済み（Phase 4 で Doppler に登録） |

### 5. Anthropic API Key

- [ ] [Anthropic Console](https://console.anthropic.com/) → API Keys → **Create Key**

| 値 | |
|---|---|
| `ANTHROPIC_API_KEY` | 取得済み（Phase 4 で Doppler に登録） |

---

> **ここで Claude に渡す情報:** 上記の全テーブルの値。Claude が Phase 2-1（D1 作成）+ Phase 3（コード実装）を実行する。

---

## Phase 2-1: D1 データベース作成（Claude タスク）

人間から Cloudflare API Token と Account ID を受け取り次第実行。

- [X] ~~`wrangler d1 create giddy-dev`~~ [2026-02-19]
- [X] ~~`wrangler d1 create giddy`~~ [2026-02-19]
- [X] ~~出力された `database_id` を `wrangler.toml` に記入~~ [2026-02-19]

---

## Phase 3: リポジトリ初期化（Claude タスク）

### 完了済み

- [x] Workers + TypeScript プロジェクト scaffold（pnpm, wrangler, TypeScript）
- [x] Biome, Vitest, commitlint, CI/CD ワークフロー
- [x] `Env` 型定義
- [x] `wrangler.toml` 基本構成（database_id はプレースホルダー）

### 3-A. 依存パッケージ追加

```bash
pnpm add discord-hono octokit @anthropic-ai/sdk drizzle-orm
pnpm add -D drizzle-kit
```

### 3-B. Drizzle 設定 + スキーマ定義

- [ ] `drizzle.config.ts` 作成
- [ ] `src/infrastructure/db/schema.ts` 作成 — 4 テーブル定義:
  - `issue_map`（issue ↔ Discord Forum Post マッピング）
  - `comment_map`（GitHub comment ↔ Discord message マッピング）
  - `summary_log`（要約履歴）
  - `event_log`（冪等性保証 + 監査）
- [ ] `drizzle-kit generate` でマイグレーションファイル生成

### 3-C. ディレクトリ構成の骨格作成

```text
src/
├── index.ts                          # 更新: Composition root
├── application/
│   └── ports/
│       ├── discord-service.ts        # Discord API ポート
│       ├── github-service.ts         # GitHub API ポート
│       ├── ai-service.ts             # AI 要約ポート
│       └── repository.ts             # データ永続化ポート
├── infrastructure/
│   ├── discord/
│   │   ├── app.ts                    # discord-hono 最小セットアップ
│   │   └── discord-rest.ts           # (Phase 8 で実装)
│   ├── github/
│   │   ├── webhook-handler.ts        # 署名検証 + 最小ルーティング
│   │   └── github-client.ts          # (Phase 8 で実装)
│   ├── ai/
│   │   └── claude-client.ts          # (Phase 8 で実装)
│   ├── db/
│   │   ├── schema.ts                 # Drizzle スキーマ
│   │   └── d1-repository.ts          # (Phase 8 で実装)
│   └── shared/
│       └── markdown.ts               # (Phase 8 で実装)
└── types/
    └── env.ts                        # 更新: Doppler に合わせた修正
```

### 3-D. 最小 Worker 更新

`src/index.ts` を更新:

- `GET /health` → `{"status":"ok"}`
- `POST /interactions` → discord-hono の PING 検証対応
- `POST /webhooks/github` → 署名検証 + 200 返却（ハンドラは stub）
- その他 → 404

**完了条件:**

- `pnpm lint` が通る
- `pnpm typecheck` が通る
- `pnpm test` が通る（最小限のテスト）
- Discord PING 検証に応答できる状態

### 3-E. Slash Command 登録スクリプト

- [ ] `scripts/register-commands.ts` 作成
  - `/summarize`, `/comment`, `/create-issue` の 3 コマンド定義
  - guild コマンドとして登録（開発中は即時反映）

---

## Phase 4: シークレット管理（人間タスク）

Phase 3 完了後に実施。

### 6. Doppler セットアップ

- [X] ~~[Doppler Dashboard](https://dashboard.doppler.com/) → **Create Project** → `giddy`~~ [2026-02-19]
- [X] ~~`dev` / `prod` 環境を作成~~ [2026-02-19]
- [X] ~~各環境に Phase 1-2 で収集した値を登録:~~ [2026-02-19]

**シークレット:**

| 変数名 | dev 環境 | prod 環境 |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | dev 用の値 | prod 用の値 |
| `GITHUB_APP_PRIVATE_KEY` | dev 用（Base64） | prod 用（Base64） |
| `DISCORD_BOT_TOKEN` | dev 用 | prod 用 |
| `DISCORD_PUBLIC_KEY` | dev 用 | prod 用 |
| `ANTHROPIC_API_KEY` | 共通 | 共通 |

**環境固有の公開設定:**

| 変数名 | dev 環境 | prod 環境 |
|---|---|---|
| `GITHUB_APP_ID` | dev 用 | prod 用 |
| `DISCORD_APPLICATION_ID` | dev 用 | prod 用 |
| `GITHUB_REPO` | テスト用リポジトリ（`owner/repo`） | 本番リポジトリ |
| `DISCORD_GUILD_ID` | テスト用サーバー | 本番サーバー |
| `DISCORD_FORUM_CHANNEL_ID` | テスト用 Forum Channel | 本番 Forum Channel |

### 7. Doppler の利用方法

Doppler は 3 つの環境で異なる役割を持つ:

| 環境 | 方法 | 備考 |
|---|---|---|
| ローカル開発 | `doppler run -- wrangler dev` | `.dev.vars` 不要。シークレットをファイルに残さない |
| CF 開発（`giddy-dev`） | `doppler run -- wrangler secret bulk --env dev` | Doppler → CF Workers に一括反映 |
| CF 本番（`giddy`） | `doppler run -- wrangler secret bulk --env production` | 同上 |

#### CF Workers へのシークレット反映（人間タスク）

- [ ] Doppler CLI をインストール: `brew install dopplerhq/cli/doppler`
- [ ] `doppler login` で認証
- [ ] `doppler setup` でプロジェクト `giddy` を選択
- [ ] dev 環境のシークレットを反映:
  ```bash
  doppler run --config dev -- wrangler secret bulk --env dev
  ```
- [ ] production 環境のシークレットを反映:
  ```bash
  doppler run --config prd -- wrangler secret bulk --env production
  ```
- [ ] ローカル開発の動作確認:
  ```bash
  doppler run --config dev -- wrangler dev
  ```

> **注意:** Doppler でシークレットを変更した場合は、CF Workers への反映コマンドを再実行する必要がある（自動 Sync ではない）。

---

## Phase 5: デプロイ貫通確認（人間 + Claude）

### Claude タスク

- [ ] `wrangler deploy --env dev` → dev Worker URL を確認
- [ ] `wrangler deploy --env production` → production Worker URL を確認
- [ ] 各環境で `curl <url>/health` → `{"status":"ok"}` を確認

### 人間タスク

### 8. Discord Interactions Endpoint URL 設定

- [X] ~~Discord Developer Portal → dev 用 Application → General Information~~ [2026-02-20]
- [X] ~~Interactions Endpoint URL: `https://giddy-dev.<account>.workers.dev/interactions`~~ [2026-02-20]
- [X] ~~**Save Changes** → PING 検証が通ることを確認~~ [2026-02-20]
- [X] ~~同様に prod 用にも設定~~ [2026-02-20]

### 9. GitHub App Webhook URL 更新

- [X] ~~GitHub → Settings → Developer settings → `Giddy Dev` → Edit~~ [2026-02-20]
- [X] ~~Webhook URL: `https://giddy-dev.<account>.workers.dev/webhooks/github`~~ [2026-02-20]
- [X] ~~同様に prod 用にも設定~~ [2026-02-20]

### 10. Slash Command 登録

- [X] ~~Claude に登録スクリプト実行を依頼（dev 環境の guild コマンド）~~ [2026-02-20]
- [X] ~~Discord でコマンドが表示されることを確認~~ [2026-02-20]

---

## Phase 6-7: CI/CD + リリースフロー（Claude タスク）

### Phase 6: CI/CD 調整

既存の `.github/workflows/ci.yml` は lint + test + security + deploy の構成が完了済み。

- [ ] `wrangler.toml` の `database_id` が実際の値に更新されていることを確認
- [X] ~~GitHub Actions Secrets に `CLOUDFLARE_API_TOKEN` を設定（人間タスク）~~ [2026-02-20]

### Phase 7: リリースフロー通し

- [ ] feature ブランチ作成 → 軽微な変更（README 等）
- [ ] PR 作成 → CI 通過確認
- [ ] main マージ → production 自動デプロイ確認
- [ ] production `/health` で動作確認

**Phase 1-7 完了 = 環境構築完了。以降は機能実装。**

---

## Phase 8: 機能実装

Phase 1-7 で確立した環境・パイプラインの上に、feature ブランチ → PR → main マージのフローで機能を載せていく。

### Step 1: GitHub → Discord 片方向同期（最小フロー）

**目標:** Issue を GitHub で作ると Discord Forum Post が自動で作られる。

| タスク | ファイル | 内容 |
|--------|----------|------|
| ポート定義 | `application/ports/discord-service.ts` | `createForumPost()` |
| ポート定義 | `application/ports/repository.ts` | `createIssueMap()`, `findIssueMapByGithubIssueId()` |
| ユースケース | `application/sync-issue.ts` | `issues.opened` → Forum Post 作成 + DB 記録 |
| Discord 実装 | `infrastructure/discord/discord-rest.ts` | Discord REST API クライアント |
| DB 実装 | `infrastructure/db/d1-repository.ts` | issue_map の CRUD |
| Webhook ルーティング | `infrastructure/github/webhook-handler.ts` | `issues.opened` のハンドリング |
| テスト | `application/sync-issue.test.ts` | ポートをモックしたユニットテスト |

**完了条件:** テスト用リポジトリで Issue を作成 → テスト用 Discord に Forum Post が出現。

### Step 2: GitHub → Discord 拡張

| タスク | トリガー | 内容 |
|--------|----------|------|
| `issues.edited` | Webhook | Forum Post のタイトル・本文を更新 |
| `issues.closed` | Webhook | スレッド archive + 通知メッセージ |
| `issues.reopened` | Webhook | スレッド unarchive + 通知メッセージ |
| `issue_comment.created` | Webhook | スレッド内にメッセージ投稿 |
| `issue_comment.edited` | Webhook | メッセージ編集 |
| `issue_comment.deleted` | Webhook | メッセージ削除 |
| Markdown 変換 | 共通 | `infrastructure/shared/markdown.ts` — GitHub → Discord 変換 |

各イベントにユースケース + テストを作成。

### Step 3: Discord → GitHub

| タスク | トリガー | 内容 |
|--------|----------|------|
| `/comment` | Slash Command | テキストを GitHub issue コメントとして投稿 |
| `/create-issue` | Slash Command | Discord Post から GitHub Issue を新規作成 + 紐付け |
| `/summarize` | Slash Command | AI 要約 → GitHub issue コメント投稿 |

ポート: `github-service.ts`（Issue 作成、コメント投稿）、`ai-service.ts`（要約生成）
実装: `github-client.ts`（Octokit）、`claude-client.ts`（Anthropic SDK）

### Step 4: 整合性

| タスク | 内容 |
|--------|------|
| ループガード | `infrastructure/shared/loop-guard.ts` — Bot 自身のアクション無視 |
| 冪等性 | `event_log` への記録 + `idempotency_key` UNIQUE 制約 |
| 自動アーカイブ対応 | Webhook 受信時にスレッドがアーカイブ済みなら unarchive してから操作 |
| エラーハンドリング | Slash Command → ephemeral エラーメッセージ、Webhook → ログ記録 |

---

## 作業の進め方

1. **人間が Phase 1-2 の外部サービスを作成**し、収集した値を Claude に渡す
2. **Claude が Phase 2-1 + Phase 3** を実行（D1 作成 + コード実装）
3. **人間が Phase 4** を実行（Doppler セットアップ + Secret Sync）
4. **Claude が Phase 5 のデプロイ**を実行し、Worker URL を人間に伝える
5. **人間が Phase 5 の URL 設定**を実行（Discord Endpoint + GitHub Webhook URL）
6. **Claude が Phase 6-7** を実行（CI/CD 確認 + リリースフロー通し）
7. **Claude が Phase 8** を Step 1 → 2 → 3 → 4 の順で機能実装（各 Step を feature ブランチ → PR で進行）
