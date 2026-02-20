import { discordApp } from "@/infrastructure/discord/app"
import { handleGitHubWebhook } from "@/infrastructure/github/webhook-handler"
import type { Env } from "@/types/env"

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" })
    }

    if (request.method === "POST" && url.pathname === "/interactions") {
      return discordApp.fetch(request, env, ctx)
    }

    if (request.method === "POST" && url.pathname === "/webhooks/github") {
      return await handleGitHubWebhook(request, env)
    }

    return new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
