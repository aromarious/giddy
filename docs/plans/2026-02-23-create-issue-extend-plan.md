# `/create-issue` 拡張: body・サブイシュー対応

## Context

v0.1 の基本機能（Step 2〜4）は実装・デプロイ済み。手動テスト中に以下の改善要望が出た：

1. `/create-issue` で **body テキスト**を入力できるようにしたい
2. 既存 Issue の**サブイシュー**として作成できるようにしたい（REST API）
3. 関連 Issue のリンクは body テキストの `Related to #X` で対応（GitHub API に汎用的な "linked/related" ミューテーションが存在しないため）

**API 調査結果:**
- `addSubIssue` GraphQL mutation / REST `POST .../sub_issues` → サブイシュー作成可
- `addBlockedBy` GraphQL mutation → ブロック関係のみ
- 汎用「関連 Issue」API → **存在しない**（[GitHub Community Discussion #4928](https://github.com/orgs/community/discussions/4928)）

## 修正対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/application/ports/github-service.ts` | `createSubIssue` メソッド追加 |
| `src/infrastructure/github/github-client.ts` | `createSubIssue` REST 実装 |
| `src/application/slash-commands.ts` | `CreateIssueCommandParams` に `body?`, `parentIssueNumber?` 追加、ロジック修正 |
| `src/infrastructure/discord/app.ts` | `body`, `parent` オプション読み取り追加 |
| `src/application/slash-commands.test.ts` | 新テストケース追加 |

## UX フロー

**スレッドが Issue に紐づいていない場合:**
- `/create-issue title:バグ報告` → 通常の新規 Issue 作成（relation 選択肢なし）
- `relation` オプションが指定されていても無視

**スレッドが Issue に紐づいている場合:**
- `/create-issue title:サブタスク relation:sub` → 既存 Issue のサブイシューとして作成
- `/create-issue title:関連 relation:link` → body に `Related to #X` を自動追加
- `/create-issue title:独立` → 何も関連付けしない（relation 省略）

## 実装手順

### 1. GitHubService ポートに `createSubIssue` を追加

**`src/application/ports/github-service.ts`**:

```typescript
createSubIssue(params: {
  repo: string
  parentIssueNumber: number
  title: string
  body: string
}): Promise<{ issueId: number; issueNumber: number }>
```

### 2. GitHubClient に `createSubIssue` を実装

**`src/infrastructure/github/github-client.ts`**:

REST API `POST /repos/{owner}/{repo}/issues/{parent_number}/sub_issues` を使用。
既存の `this.request()` ヘルパーを流用。

```typescript
async createSubIssue(params: {
  repo: string
  parentIssueNumber: number
  title: string
  body: string
}): Promise<{ issueId: number; issueNumber: number }> {
  const [owner, repo] = params.repo.split("/")
  const res = await this.request(
    "POST",
    `/repos/${owner}/${repo}/issues/${params.parentIssueNumber}/sub_issues`,
    { title: params.title, body: params.body }
  )
  const data = (await res.json()) as { id: number; number: number }
  return { issueId: data.id, issueNumber: data.number }
}
```

### 3. `CreateIssueCommandParams` を拡張

**`src/application/slash-commands.ts`**:

```typescript
export interface CreateIssueCommandParams {
  threadId: string
  title: string
  body?: string                          // 追加: ユーザー入力の body
  relation?: "sub" | "link"              // 追加: 既存 Issue との関係
  forumChannelId: string
  repo: string
}
```

**`handleCreateIssueCommand` のロジック:**

```
1. existing = findIssueMapByDiscordThreadId(threadId)
2. body を決定:
   - params.body があればベースとして使用
   - なければ "Created from Discord thread." をベース
   - existing あり && relation === "link" → ベースに "\n\nRelated to #X" を追加
3. Issue 作成:
   - existing あり && relation === "sub"
     → github.createSubIssue({ parentIssueNumber: existing.githubIssueNumber, ... })
   - それ以外
     → github.createIssue(...)
4. createForumPostForIssue(...) でフォーラム投稿 + issue_map 登録
5. 結果返却
```

### 4. Discord コマンドハンドラにオプション追加

**`src/infrastructure/discord/app.ts`** の `create-issue` ハンドラ:

```typescript
const body = getOptionString(options, "body")
const relation = getOptionString(options, "relation") as "sub" | "link" | undefined
```

`handleCreateIssueCommand` に `body`, `relation` を渡す。

### 5. テスト追加

**`src/application/slash-commands.test.ts`**:

- 既リンクスレッド + `relation:"sub"` → `createSubIssue` が呼ばれる
- 既リンクスレッド + `relation:"link"` → body に `Related to #X` が含まれる
- 既リンクスレッド + relation なし → 通常の `createIssue`、body に Related なし
- 未リンクスレッド + relation 指定 → relation は無視、通常の `createIssue`
- カスタム body 指定時にユーザーの body がベースとして使われる

### 6. Discord コマンド登録の更新

`scripts/register-commands.ts` の `create-issue` に 2 つのオプションを追加済み:
- `body` (STRING, optional): Issue の本文
- `relation` (STRING, optional, choices: `sub` / `link`): 既存 Issue との関係

登録実行:

```bash
doppler run --config dev -- npx tsx scripts/register-commands.ts
```

### 7. Discord コマンド登録の CI 自動化

`scripts/register-commands.ts` に変更があったとき、main push 時に自動で登録を実行する。

**方針:**
- GitHub Actions ワークフローを追加
- トリガー: `push` to `main`、パスフィルタ `scripts/register-commands.ts`
- Doppler CLI でシークレットを注入して `npx tsx scripts/register-commands.ts` を実行
- Doppler サービストークンを GitHub Secrets に `DOPPLER_TOKEN` として登録（手動）

**ファイル:**
- `.github/workflows/register-discord-commands.yml` を新規作成
- `package.json` に `register-commands` npm script を追加

**ワークフロー概要:**

```yaml
name: Register Discord Commands
on:
  push:
    branches: [main]
    paths: [scripts/register-commands.ts]
  workflow_dispatch: # 手動実行も可能

jobs:
  register:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: dopplerhq/cli-action@v3
      - run: doppler run -- pnpm register-commands
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

**前提（手動セットアップ）:**
- `aromarious/giddy-app` リポジトリの Settings > Secrets に `DOPPLER_TOKEN` を登録
  - Doppler Dashboard > Project > dev config > Service Tokens から生成

## 検証方法

1. `pnpm typecheck && pnpm lint && pnpm test` — 全パス
2. dev デプロイ後:
   - 未リンクスレッドから `/create-issue title:テスト` → 通常 Issue 作成 + フォーラム投稿
   - 既リンクスレッドから `/create-issue title:サブ relation:sub` → サブイシュー作成 + フォーラム投稿
   - 既リンクスレッドから `/create-issue title:関連 relation:link` → body に `Related to #X` + フォーラム投稿
   - `/create-issue title:テスト body:詳細な説明` → body 付き Issue 作成
