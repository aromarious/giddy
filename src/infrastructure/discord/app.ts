import { DiscordHono } from "discord-hono"
import type { Env } from "@/types/env"

interface AppEnv {
  Bindings: Env
}

const app = new DiscordHono<AppEnv>({
  discordEnv: (env) => ({
    TOKEN: env.DISCORD_BOT_TOKEN,
    PUBLIC_KEY: env.DISCORD_PUBLIC_KEY,
    APPLICATION_ID: env.DISCORD_APPLICATION_ID,
  }),
})

// Slash commands は Phase 8 で登録

export { app as discordApp }
