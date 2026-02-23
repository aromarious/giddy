import type { Env } from "@/types/env"
import { createGitHubJwt } from "./shared/jwt"

interface Check {
  ok: boolean
  detail?: string
}

interface StatusResult {
  checks: {
    db: Check
    dbTables: Check
    env: Check
    discord: Check
    github: Check
  }
  counts?: {
    issues: number
    comments: number
    events: number
  }
}

const REQUIRED_SECRETS: (keyof Env)[] = [
  "GITHUB_APP_ID",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "DISCORD_APPLICATION_ID",
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_GUILD_ID",
  "DISCORD_FORUM_CHANNEL_ID",
  "ANTHROPIC_API_KEY",
]

const EXPECTED_TABLES = ["issue_map", "comment_map", "summary_log", "event_log"]

export async function checkStatus(env: Env): Promise<StatusResult> {
  const [db, dbTables, counts] = await checkDb(env)
  const envCheck = checkEnv(env)
  const [discord, github] = await Promise.all([
    checkDiscord(env),
    checkGitHub(env),
  ])

  return {
    checks: { db, dbTables, env: envCheck, discord, github },
    ...(counts && { counts }),
  }
}

async function checkDb(
  env: Env
): Promise<[Check, Check, StatusResult["counts"] | undefined]> {
  try {
    await env.DB.prepare("SELECT 1").first()
  } catch (e) {
    return [
      { ok: false, detail: String(e) },
      { ok: false, detail: "skipped (db unreachable)" },
      undefined,
    ]
  }

  try {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '__drizzle%'"
    ).all<{ name: string }>()

    const found = tables.results.map((r) => r.name)
    const missing = EXPECTED_TABLES.filter((t) => !found.includes(t))
    const tablesCheck: Check =
      missing.length === 0
        ? { ok: true, detail: found.sort().join(", ") }
        : { ok: false, detail: `missing: ${missing.join(", ")}` }

    const counts = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) as c FROM issue_map"),
      env.DB.prepare("SELECT COUNT(*) as c FROM comment_map"),
      env.DB.prepare("SELECT COUNT(*) as c FROM event_log"),
    ])

    return [
      { ok: true },
      tablesCheck,
      {
        issues: (counts[0].results[0] as { c: number }).c,
        comments: (counts[1].results[0] as { c: number }).c,
        events: (counts[2].results[0] as { c: number }).c,
      },
    ]
  } catch (e) {
    return [{ ok: true }, { ok: false, detail: String(e) }, undefined]
  }
}

function checkEnv(env: Env): Check {
  const missing = REQUIRED_SECRETS.filter((key) => !env[key])
  if (missing.length === 0) {
    return { ok: true }
  }
  return { ok: false, detail: `missing: ${missing.join(", ")}` }
}

async function checkDiscord(env: Env): Promise<Check> {
  if (!env.DISCORD_BOT_TOKEN) {
    return { ok: false, detail: "DISCORD_BOT_TOKEN not set" }
  }
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    })
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` }
    }
    const data = (await res.json()) as { username: string }
    return { ok: true, detail: data.username }
  } catch (e) {
    return { ok: false, detail: String(e) }
  }
}

async function checkGitHub(env: Env): Promise<Check> {
  if (!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY)) {
    return {
      ok: false,
      detail: "GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY not set",
    }
  }
  try {
    const res = await fetch("https://api.github.com/app", {
      headers: {
        Authorization: `Bearer ${await createGitHubJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Giddy",
      },
    })
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` }
    }
    const data = (await res.json()) as { name: string }
    return { ok: true, detail: data.name }
  } catch (e) {
    return { ok: false, detail: String(e) }
  }
}
