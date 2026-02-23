# GitHub `sub_issues` Webhook → Discord クロスリンク

## Context

GitHub 側で sub-issue を追加/削除したとき、`issues.opened` で Discord フォーラム投稿は作られるが、親子関係のクロスリンクは貼られない。`sub_issues` webhook イベントをハンドルして、Discord フォーラム投稿間に双方向リンクを自動投稿する。

先行実装（`/create-issue relation:sub`）ではスラッシュコマンド内でクロスリンクを投稿済み。今回は GitHub 側からの操作に対応する。

## GitHub `sub_issues` Webhook Payload

OpenAPI スキーマ（`github/rest-api-description`）から確認済み:

- **イベント名**: `sub_issues`（`x-github-event` ヘッダ）
- **アクション**: `sub_issue_added`, `sub_issue_removed`, `parent_issue_added`, `parent_issue_removed`
- 単一リポジトリでは `sub_issue_added` と `parent_issue_added` が同時に発火する → **`sub_issue_added` のみ**ハンドルすれば十分

**Payload フィールド**:
```typescript
{
  action: "sub_issue_added" | "sub_issue_removed"
  parent_issue_id: number
  parent_issue: { id, number, title, body, html_url, ... }
  sub_issue_id: number
  sub_issue: { id, number, title, body, html_url, ... }
  sub_issue_repo: { full_name, ... }
  repository: { full_name, ... }  // parent issue's repo
  sender: { ... }
}
```

## 修正対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/application/sync-issue.ts` | `syncSubIssueAdded` / `syncSubIssueRemoved` 関数 |
| `src/infrastructure/github/webhook-handler.ts` | `sub_issues` イベントのディスパッチ + payload 型拡張 + リファクタ |
| `src/application/sync-issue.test.ts` | テスト追加 |

## 実装

### 1. `sync-issue.ts` に `syncSubIssueAdded` / `syncSubIssueRemoved` を追加

既存の `syncIssueClosed` などと同じパターン:

- 冪等性チェック（`hasProcessedEvent`）
- 親・子両方の `issue_map` を `findIssueMapByGithubIssueId` で取得
- 両方存在する場合のみ、双方のスレッドに `postMessage` でクロスリンク投稿
- `recordEvent` でイベント記録

メッセージ形式:
- `syncSubIssueAdded`: 子スレッドに「📌 Parent: [#YY](url)」、親スレッドに「📎 Sub-issue added: [#XX](url)」
- `syncSubIssueRemoved`: 子スレッドに「📌 Removed from parent: [#YY](url)」、親スレッドに「📎 Sub-issue removed: [#XX](url)」

### 2. `webhook-handler.ts` の変更

- `WebhookPayload` に `sub_issue` / `parent_issue` フィールド追加
- 認知的複雑度低減のため、イベント処理を3関数に分離:
  - `handleIssuesEvent` — 既存の `issues` イベント処理
  - `handleSubIssuesEvent` — 新規 `sub_issues` イベント処理
  - `handleIssueCommentEvent` — 既存の `issue_comment` イベント処理
- `sub_issue_added` / `sub_issue_removed` のみディスパッチ（`parent_issue_*` は重複回避のためスキップ）

### 3. テスト追加

`syncSubIssueAdded` / `syncSubIssueRemoved` 各テスト:

- 両方の issue_map が存在 → 双方のスレッドに `postMessage` 2回
- 親の issue_map のみ存在 → `postMessage` なし
- 子の issue_map のみ存在 → `postMessage` なし
- どちらも存在しない → `postMessage` なし
- 冪等性: 同じ `deliveryId` で2回目はスキップ

## 注意事項

- GitHub App の webhook 設定で `sub_issues` イベントの購読が必要（GitHub Settings → Webhooks → Events）
- `parent_issue_added` / `parent_issue_removed` は無視（単一リポジトリでは `sub_issue_added/removed` と重複）

## 検証

1. `pnpm typecheck && pnpm lint && pnpm test` — 全パス（79テスト）
2. GitHub App の webhook 設定で `Sub issues` を購読に追加
3. dev デプロイ後:
   - GitHub UI で sub-issue を追加 → 親スレッドに「Sub-issue added: #XX」、子スレッドに「Parent: #YY」
   - GitHub UI で sub-issue を削除 → 親スレッドに「Sub-issue removed: #XX」、子スレッドに「Removed from parent: #YY」
