---
name: process-dependabot
description: Dependabot PR を確認・テスト・マージする
disable-model-invocation: false
allowed-tools: Bash
argument-hint: "[PR_NUMBER]"
---

# Dependabot の PR を処理する

GitHub Flow（main ブランチのみ）のため、Dependabot PR は main に直接マージする。

## 手順

### 1. Dependabot の PR 一覧を確認する

Dependabot が作成した PR を一覧表示する。

```bash
gh pr list --search "author:app/dependabot" --json number,title,headRefName,url
```

### 2. 処理対象の PR 番号を決定する

- 引数で PR 番号が指定されている場合はそれを使用する
- 指定されていない場合は、ユーザーに処理対象の PR 番号を確認する

### 3. PR の詳細を確認する

PR の変更内容を確認する。

```bash
gh pr view <PR_NUMBER> --json headRefName,commits,title,body
```

```bash
gh pr diff <PR_NUMBER>
```

### 4. ローカルで変更を取り込みテストする

Dependabot のブランチをチェックアウトしてテストを実行する。

```bash
gh pr checkout <PR_NUMBER>
```

```bash
npm ci && npm run lint && npm run test
```

- テストが失敗した場合は、ユーザーに報告し修正方法を提案する

### 5. CI の実行結果を確認する

```bash
gh pr checks <PR_NUMBER>
```

- すべてのチェックが `pass` になることを確認する
- 失敗した場合は、ユーザーに報告し修正方法を提案する

### 6. ユーザーにマージ確認を促す

**重要**: マージは自動的に行わず、ユーザーに確認を促すこと。

- CI が成功したことを報告
- 変更内容の概要を伝える
- マージコマンドを提示するが、ユーザーの承認を待つ

マージコマンド（参考）:

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

### 7. マージ後のローカル環境整理

```bash
git checkout main && git pull origin main
```

```bash
git fetch --prune
```

### 8. 完了をユーザーに報告する

- 処理が完了したことを報告
- 更新された依存関係の概要を伝える
- production への自動デプロイが走ることを伝える
