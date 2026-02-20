import { Hono } from "hono"
import { discordApp } from "@/infrastructure/discord/app"
import { handleGitHubWebhook } from "@/infrastructure/github/webhook-handler"
import type { Env } from "@/types/env"

const app = new Hono<{ Bindings: Env }>()

app.get("/health", (c) => c.json({ status: "ok" }))

app.post("/interactions", (c) =>
  discordApp.fetch(c.req.raw, c.env, c.executionCtx)
)

app.post("/webhooks/github", (c) => handleGitHubWebhook(c.req.raw, c.env))

export default app
