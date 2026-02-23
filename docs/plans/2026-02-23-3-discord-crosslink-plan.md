# Discord フォーラム投稿間のクロスリンク

## Context

`/create-issue` で `relation:sub` や `relation:link` を使ったとき、GitHub 側は関連付けされるが Discord 側のフォーラム投稿間に何のリンクもない。双方向にリンクを貼って辿りやすくする。

## 修正対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/application/slash-commands.ts` | `guildId` を params に追加、クロスリンクメッセージ投稿ロジック |
| `src/infrastructure/discord/app.ts` | `guildId` を渡す |
| `src/application/slash-commands.test.ts` | クロスリンクのテスト追加 |

## 実装

### 1. `CreateIssueCommandParams` に `guildId` 追加

**`src/application/slash-commands.ts`**:

```typescript
export interface CreateIssueCommandParams {
  threadId: string
  title: string
  body?: string
  relation?: "sub" | "link"
  guildId: string        // 追加
  forumChannelId: string
  repo: string
}
```

### 2. `handleCreateIssueCommand` にクロスリンク投稿を追加

`createForumPostForIssue` の後に、`existing` があり `relation` が `"sub"` or `"link"` の場合：

```
1. newThreadUrl = https://discord.com/channels/{guildId}/{newThreadId}
2. existingThreadUrl = https://discord.com/channels/{guildId}/{existing.discordThreadId}

relation === "sub":
  - 新スレッドに投稿: "📌 Parent: [#42](existingThreadUrl)"
  - 親スレッドに投稿: "📎 Sub-issue created: [#101](newThreadUrl)"

relation === "link":
  - 新スレッドに投稿: "🔗 Related: [#42](existingThreadUrl)"
  - 既存スレッドに投稿: "🔗 Related issue created: [#101](newThreadUrl)"
```

既存の `deps.discord.postMessage(threadId, content)` をそのまま使う。

### 3. Discord ハンドラで `guildId` を渡す

**`src/infrastructure/discord/app.ts`**:

```typescript
handleCreateIssueCommand(
  {
    threadId: channelId,
    title,
    body,
    relation,
    guildId: env.DISCORD_GUILD_ID,
    forumChannelId: env.DISCORD_FORUM_CHANNEL_ID,
    repo: env.GITHUB_REPO,
  },
  deps
)
```

### 4. テスト追加

**`src/application/slash-commands.test.ts`**:

- 既存テストに `guildId: "guild-1"` を追加（全 create-issue テスト）
- `relation:sub` → 親スレッドと新スレッドの両方に `postMessage` が呼ばれる
- `relation:link` → 既存スレッドと新スレッドの両方に `postMessage` が呼ばれる
- relation なし → `postMessage` が呼ばれない

## 検証

1. `pnpm typecheck && pnpm lint && pnpm test` — 全パス
2. dev デプロイ後:
   - `relation:sub` → 親スレッドに「Sub-issue created: #XX」、新スレッドに「Parent: #YY」
   - `relation:link` → 既存スレッドに「Related issue created: #XX」、新スレッドに「Related: #YY」
