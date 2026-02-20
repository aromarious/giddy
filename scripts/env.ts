import type { Env } from "../src/types/env"

function requireEnv<K extends keyof Env>(key: K): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}

export const env = {
  DISCORD_APPLICATION_ID: requireEnv("DISCORD_APPLICATION_ID"),
  DISCORD_BOT_TOKEN: requireEnv("DISCORD_BOT_TOKEN"),
  DISCORD_GUILD_ID: requireEnv("DISCORD_GUILD_ID"),
} as const
