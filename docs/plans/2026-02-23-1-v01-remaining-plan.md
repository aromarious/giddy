# v0.1 残り実装計画（Step 2〜4）

## Context

v0.1 の Phase 8 Step 1（`issues.opened` → Discord Forum Post 作成）は完了済み。残りの Step 2〜4 を実装して v0.1 完了条件を満たす。

**完了条件（実装計画書より）:**
- Issue の編集・クローズ・リオープン・コメントが Discord に同期される
- Discord から `/comment`, `/create-issue`, `/summarize` が実行できる
- エコーループ防止と冪等性が確保されている

## ブランチ戦略

`feat/v01-remaining` ブランチを切って作業。完了後に main へマージ。

## 実装順序

Step 2 → 3 → 4 の順。各ステップは独立したコミット単位で進める。ただし Step 4（ループガード）の一部は Step 2・3 実装時に織り込む。

---

## Step 2: GitHub → Discord 拡張

### 2-1. インフラ層の実装

**`src/infrastructure/discord/discord-rest.ts`** — スタブを実装:
- `editForumPost(threadId, title?, content?)` — PATCH `/channels/{threadId}` (name) + PATCH `/channels/{threadId}/messages/{messageId}` (content)
- `postMessage(threadId, content)` — POST `/channels/{threadId}/messages`
- `editMessage(channelId, messageId, content)` — PATCH `/channels/{channelId}/messages/{messageId}`
- `deleteMessage(channelId, messageId)` — DELETE `/channels/{channelId}/messages/{messageId}`
- `archiveThread(threadId)` — PATCH `/channels/{threadId}` `{ archived: true }`
- `unarchiveThread(threadId)` — PATCH `/channels/{threadId}` `{ archived: false }`

**`src/infrastructure/db/d1-repository.ts`** — スタブを実装:
- `findIssueMapByDiscordThreadId(threadId)`
- `createCommentMap(params)`
- `findCommentMapByGithubCommentId(commentId)`
- `deleteCommentMap(githubCommentId)`
- `updateIssueMapSyncedAt(id)`

### 2-2. Markdown 変換

**`src/infrastructure/shared/markdown.ts`** — `toDiscordMarkdown(githubMd, repo)` を実装:

変換順序（コードブロック保護 → HTML処理 → MD変換 → エスケープ → 切り詰め → コード復元）:
1. コードブロック・インラインコードをプレースホルダーで保護
2. `<details><summary>` → 太字展開、HTMLタグ除去、`<br>` → `\n`
3. `__text__` → `**text**`、`![alt](url)` → `[🖼 alt](url)`、`####`〜`######` → `**Title**`
4. タスクリスト `- [ ]`/`- [x]` → `☐`/`☑`
5. GitHub Alerts `> [!NOTE]` → `> **📝 Note**` 等
6. テーブル → コードブロック（CJK幅考慮）
7. 脚注処理（参照除去、定義を引用変換）
8. `@username` → `` `@username` ``、`#123` → `[#123](url)`
9. 2000文字超を切り詰め + `... **[Read more on GitHub](url)**`
10. コードブロック復元

### 2-3. ユースケース追加

**`src/application/sync-issue.ts`** に関数を追加（既存の `syncIssueOpened` パターンに従う）:

- `syncIssueEdited(deps, params)` — `changes` フィールドに応じてタイトル/本文を更新
- `syncIssueClosed(deps, params)` — 通知メッセージ投稿 → archive
- `syncIssueReopened(deps, params)` — unarchive → 通知メッセージ投稿
- `syncIssueCommentCreated(deps, params)` — スレッド内メッセージ投稿 + comment_map 記録
- `syncIssueCommentEdited(deps, params)` — comment_map 検索 → メッセージ編集
- `syncIssueCommentDeleted(deps, params)` — comment_map 検索 → メッセージ削除 + comment_map 削除

各関数は既存の冪等性パターン（`hasProcessedEvent` → 処理 → `recordEvent`）を踏襲。

### 2-4. Webhook ハンドラ拡張

**`src/infrastructure/github/webhook-handler.ts`** — ルーティング追加:
- `issues` イベント: `edited`, `closed`, `reopened` アクション
- `issue_comment` イベント: `created`, `edited`, `deleted` アクション
- ループガード: `sender.type === "Bot"` または App ID 一致なら早期 return

### 2-5. テスト

**`src/application/sync-issue.test.ts`** に各ユースケースのテストを追加:
- 各関数のハッピーパス
- 冪等性チェック
- マッピング未存在時のスキップ（comment edited/deleted）
- Markdown 変換の個別テスト（`markdown.test.ts` を新規作成）

---

## Step 3: Discord → GitHub（Slash Commands）

### 3-1. GitHub クライアント実装

**`src/infrastructure/github/github-client.ts`**:
- JWT 生成（`/status` の `createGitHubJwt` を共通化して再利用）
- Installation Access Token 取得
- `createIssue(repo, title, body, labels?)` — POST `/repos/{owner}/{repo}/issues`
- `createComment(repo, issueNumber, body)` — POST `/repos/{owner}/{repo}/issues/{number}/comments`

### 3-2. AI クライアント実装

**`src/infrastructure/ai/claude-client.ts`**:
- Anthropic SDK (`@anthropic-ai/sdk`) を使用
- `summarize(messages, metadata)` — Claude Haiku でスレッド要約を生成
- システムプロンプト: 決定事項・残課題の抽出、GitHub Markdown 形式で出力

### 3-3. Discord REST 追加メソッド

**`src/infrastructure/discord/discord-rest.ts`**:
- `getMessages(threadId, after?, limit?)` — GET `/channels/{threadId}/messages` （ページング対応）

### 3-4. Repository 追加メソッド

**`src/infrastructure/db/d1-repository.ts`**:
- `createSummaryLog(params)`
- `findLatestSummaryLog(issueMapId)` — 前回要約位置の取得

### 3-5. Slash Command ハンドラ

**`src/infrastructure/discord/app.ts`** に command ハンドラを登録:

```typescript
app.command("comment", handler)
app.command("create-issue", handler)
app.command("summarize", handler)
```

各コマンドの共通バリデーション:
- Forum Post スレッド内でのみ実行可（それ以外 → ephemeral エラー）
- `/comment`, `/summarize`: issue_map 紐付け必須
- `/create-issue`: 紐付けが既にある場合 → エラー

**`/comment`**: テキストを GitHub issue コメントとして投稿。即座に `c.res()` で返す。
**`/create-issue`**: Forum Post タイトルまたは指定タイトルで GitHub Issue 作成 + issue_map 登録。
**`/summarize`**: `c.resDefer()` で即応答 → メッセージ取得 → AI 要約 → GitHub コメント投稿 → `c.followup()`
- プライバシー同意フローは v0.1 では省略（単一テナント・自分用のため）。v0.2 で実装。

### 3-6. JWT 共通化

`src/infrastructure/status.ts` の `createGitHubJwt` と `base64url` を `src/infrastructure/shared/jwt.ts` に切り出し、`status.ts` と `github-client.ts` の両方から使う。

### 3-7. テスト

- `/comment`, `/create-issue` のユースケーステスト
- `/summarize` のメッセージ取得・フィルタリング・AI 呼び出し・結果投稿のテスト

---

## Step 4: 整合性

### 4-1. ループガード

**`src/infrastructure/shared/loop-guard.ts`**:
- `isGitHubBotAction(payload, appId)` — webhook の sender が Bot 自身かを判定
- `isBotMessage(message, botUserId)` — Discord メッセージが Bot 自身かを判定（`/summarize` のフィルタ用）

Step 2 の webhook ハンドラで `isGitHubBotAction` を呼び出し、Bot 起因のイベントをスキップ。

### 4-2. 自動アーカイブ対応

Step 2 で実装するすべてのスレッド操作（メッセージ投稿・編集等）の前に、スレッドがアーカイブ済みかチェック → 必要なら `unarchiveThread` してから操作。

### 4-3. エラーハンドリング

- Webhook: エラーをキャッチしてログ出力、常に 200 返却（既存パターン踏襲）
- Slash Command: エラー時は ephemeral メッセージで通知

---

## 実装の進め方

1. `feat/v01-remaining` ブランチを作成
2. Step 2 を実装 → コミット → テスト通過確認
3. Step 3 を実装 → コミット → テスト通過確認
4. Step 4（ループガード仕上げ）→ コミット
5. dev 環境にデプロイ → `/status` + 手動テスト（Issue 作成、コメント、クローズ等）
6. main にマージ → production デプロイ

## 検証方法

1. `pnpm typecheck && pnpm lint && pnpm test` — 全パス
2. dev デプロイ後、テスト用リポジトリで:
   - Issue 作成 → Discord Forum Post 出現
   - Issue 編集 → Discord 更新
   - Issue コメント → Discord メッセージ
   - Issue クローズ → Discord archive + 通知
   - Discord `/comment` → GitHub コメント出現
   - Discord `/create-issue` → GitHub Issue 作成
   - Discord `/summarize` → GitHub に要約コメント
3. Bot 自身のコメントが再同期されないこと（ループガード確認）
