# CLAUDE.md

## Agent Guidelines

Always prefer simplicity over pathological correctness. YAGNI, KISS, DRY. No backward-compat shims or fallback paths unless they come free without adding cyclomatic complexity.

## Git Workflow

GitHub Flow を使用する。main への直接 push は禁止。

1. feature ブランチを切る
2. 作業(remote devでチェック) → コミット → push
3. PR を作成してレビュー
4. main にマージ

## 疎通確認

コードを修正した後は `GET /status` で DB・環境変数・Discord API・GitHub API の疎通を確認する。

```bash
# ローカル
doppler run --config dev -- bash scripts/dev-local.sh
curl http://localhost:8787/status

# dev 環境（デプロイ後）
curl https://giddy-dev.aromarious.workers.dev/status
```

全チェック OK なら 200、1 つでも NG なら 503 が返る。
