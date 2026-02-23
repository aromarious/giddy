import { Hono } from "hono"
import { discordApp } from "@/infrastructure/discord/app"
import { handleGitHubWebhook } from "@/infrastructure/github/webhook-handler"
import { checkStatus } from "@/infrastructure/status"
import type { Env } from "@/types/env"

const app = new Hono<{ Bindings: Env }>()

app.get("/health", (c) => c.json({ status: "ok" }))

app.get("/status", async (c) => {
  const result = await checkStatus(c.env)
  const allOk = Object.values(result.checks).every((ch) => ch.ok)
  return c.json(result, allOk ? 200 : 503)
})

app.post("/interactions", (c) =>
  discordApp.fetch(c.req.raw, c.env, c.executionCtx)
)

app.post("/webhooks/github", (c) => handleGitHubWebhook(c.req.raw, c.env))

export default app
