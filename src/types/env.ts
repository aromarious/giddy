export interface Env {
  // D1 バインディング
  DB: D1Database

  // 公開設定（wrangler.toml [vars] or Doppler）
  GITHUB_APP_ID: string
  DISCORD_APPLICATION_ID: string
  GITHUB_REPO: string
  DISCORD_GUILD_ID: string
  DISCORD_FORUM_CHANNEL_ID: string
  AI_MODEL: string

  // シークレット（Doppler → Cloudflare Workers Secret）
  GITHUB_WEBHOOK_SECRET: string
  GITHUB_APP_PRIVATE_KEY: string
  DISCORD_BOT_TOKEN: string
  DISCORD_PUBLIC_KEY: string
  ANTHROPIC_API_KEY: string
}
