# リリースオペレーション

## 前提

- CI/CD は `ci.yml` 一本で管理（lint → test → security → deploy の順）
- デプロイは **タグ push** で発火する（`v*` タグに反応）
- `push.followTags` が postinstall で設定済みなので、`git push` でタグも一緒に送られる

## 手順

### 1. main ブランチが最新であることを確認

```bash
git checkout main
git pull
```

### 2. CI が通っていることを確認

GitHub Actions の ci.yml が green であることを確認する。

確認先: https://github.com/aromarious/giddy-app/actions/workflows/ci.yml

### 3. バージョンを上げる

```bash
npm version patch   # バグ修正・小さな変更
npm version minor   # 機能追加（v0.1.0 → v0.2.0 等）
```

これにより以下が一発で実行される:

1. `package.json` の `version` フィールドが更新される
2. `v0.x.x` のコミットが作成される
3. `v0.x.x` の git tag が作成される

### 4. push

```bash
git push
```

`push.followTags` が有効なので、コミットとタグが両方 push される。

## 何が起きるか

```
git push（コミット + タグ）
  │
  └─→ ci.yml 発火（v* タグトリガー）
        ├─ lint + typecheck
        ├─ test
        ├─ gitleaks（security）
        └─ deploy（上記すべて通過後）
              ├─ Doppler で Workers secrets を同期
              ├─ D1 マイグレーション適用
              ├─ wrangler deploy（Cloudflare Workers にデプロイ）
              └─ Discord コマンド登録
```

## 結果確認

| 何を確認するか | 確認先 |
|---|---|
| CI + デプロイが成功したか | https://github.com/aromarious/giddy-app/actions/workflows/ci.yml |
| Workers が動いているか | Cloudflare Dashboard → Workers & Pages → giddy |
| バージョンタグが作られたか | https://github.com/aromarious/giddy-app/tags |
| 動作確認（手動） | Discord のテストチャンネルで Issue を作成し、Forum Post が同期されることを確認 |

## ロールバック

デプロイ後に問題が見つかった場合:

```bash
# 直前のバージョンに戻す（Wrangler のロールバック）
npx wrangler rollback --env production
```

または前のバージョンのコードを再デプロイ:

```bash
git checkout v0.x.x   # 戻したいバージョン
npx wrangler deploy --env production
git checkout main
```

## 注意事項

- **D1 マイグレーションはロールバックされない。** スキーマ変更を含むリリースは特に慎重に。ロールバックが必要な場合は逆方向のマイグレーションを手動で書いて適用する。
- 0.x の間は semver の厳密なルール（feat=minor, fix=patch）に縛られない。区切りの良いところで `patch` か `minor` かを判断すればよい。
