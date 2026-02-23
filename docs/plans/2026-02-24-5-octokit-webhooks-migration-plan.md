# `@octokit/webhooks` 移行 + `sub_issues` ハンドリング追加

## Context

`webhook-handler.ts` の手書き署名検証・ペイロード型・イベントディスパッチを `@octokit/webhooks` に移行。
同時に `sub_issues` イベントのハンドリングを追加。

## 変更サマリ

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `@octokit/webhooks` v14.2.0 追加 |
| `src/infrastructure/github/webhook-handler.ts` | `Webhooks` クラスで `.on()` パターンに全面書き換え |
| `src/application/sync-issue.ts` | `syncSubIssueAdded` / `syncSubIssueRemoved` 追加 |
| `src/application/sync-issue.test.ts` | sub_issues テスト 7 件追加 |

## 設計判断

### `@octokit/webhooks` の採用理由
- 署名検証: Web Crypto API ベース (CF Workers 互換)
- ペイロード型: `@octokit/openapi-webhooks-types` から自動生成 (`sub_issues` 含む)
- イベントディスパッチ: `.on("event.action", handler)` で型安全
- 認知的複雑度: メイン関数は検証 → ガード → 発火のみ

### `Webhooks` インスタンスのライフサイクル
リクエストごとに生成。Cloudflare Workers = stateless のため問題なし。

### ループガードの配置
`.receive()` の前に手動で実行。ライブラリのイベントパイプラインに組み込まない。

### `sub_issues` のレースコンディション対策
`syncSubIssueAdded` で親 / 子の `issue_map` が未作成の場合、`createForumPostForIssue` でフォールバック。
`syncSubIssueRemoved` ではフォールバック不要 (既存マップがなければ通知をスキップ)。

## 検証

```bash
pnpm typecheck  # OK
pnpm lint       # OK (biome schema version info のみ)
pnpm test       # 75 tests passed
```
