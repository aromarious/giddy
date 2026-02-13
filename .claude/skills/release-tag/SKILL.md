---
name: release-tag
description: バージョンタグを作成してリリースを公開する
disable-model-invocation: false
allowed-tools: Bash
argument-hint: "[version]"
---

# バージョンタグを作成してリリースを公開する

フェーズの区切りでバージョンタグを作成し、GitHub Release を公開する。Cloudflare Workers はバージョンの概念がないため、タグは「この時点の機能セット」を示すマーカーとして使う。

## 前提条件

- main ブランチが最新の状態であること
- すべての変更がコミット済みであること
- バージョン番号が決定していること（例: `v0.1.0`, `v0.2.0`）

## 手順

### 1. 現在のバージョンを確認

```bash
git tag --sort=-version:refname | head -5
```

```bash
grep '"version":' package.json
```

### 2. ブランチとリモートの状態を確認

main ブランチにいることを確認し、リモートと同期していることを確認する。

```bash
git status
```

```bash
git log origin/main..HEAD --oneline
```

main が最新でない場合は警告してユーザーに確認する。

### 3. リリースノートの準備

前回のタグからの変更を確認し、リリースノートの内容を準備する。

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

- Conventional Commits の prefix からカテゴリ分けする（Features / Bug Fixes / Other）

### 4. バージョンタグを作成

**重要**: タグ名は `v` プレフィックス付きのセマンティックバージョン（例: `v0.1.0`）を使用すること。

```bash
git tag -a v[VERSION] -m "Release v[VERSION]"
```

### 5. タグをリモートにプッシュ

```bash
git push origin v[VERSION]
```

### 6. GitHub Release を作成

```bash
gh release create v[VERSION] --title "v[VERSION]" --generate-notes
```

### 7. リリースが作成されたことを確認

```bash
gh release view v[VERSION]
```

### 8. リリースノートを編集（必要に応じて）

自動生成されたリリースノートを編集する場合:

```bash
gh release edit v[VERSION] --notes "$(cat <<'EOF'
## What's Changed

### Features
- <feat commits>

### Bug Fixes
- <fix commits>

### Other
- <other commits>

**Full Changelog**: ...
EOF
)"
```

## トラブルシューティング

### タグを間違えて作成した場合

ローカルタグを削除:

```bash
git tag -d v[VERSION]
```

リモートタグを削除（注意: 既にリリースが作成されている場合は慎重に）:

```bash
git push origin :refs/tags/v[VERSION]
```

## 注意事項

- **タグの命名規則**: 必ず `v` プレフィックスを付けること（例: `v0.1.0`）
- **バージョン番号の整合性**: `package.json` のバージョンと一致させること
- **問題発生時**: Cloudflare Workers は `wrangler rollback` で即座にロールバック可能

## 完了報告

ユーザーに以下を報告する:

- 作成されたタグ名
- リリースの URL
- 次のステップ（必要に応じて）
