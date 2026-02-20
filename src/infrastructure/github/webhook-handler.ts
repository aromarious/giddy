import { syncIssueOpened } from "@/application/sync-issue"
import { D1Repository } from "@/infrastructure/db/d1-repository"
import { DiscordRestService } from "@/infrastructure/discord/discord-rest"
import type { Env } from "@/types/env"

async function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) {
    return false
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  const expected = `sha256=${Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`

  return signature === expected
}

export async function handleGitHubWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  const valid = await verifySignature(
    body,
    signature,
    env.GITHUB_WEBHOOK_SECRET
  )
  if (!valid) {
    return new Response("Invalid signature", { status: 401 })
  }

  const event = request.headers.get("x-github-event")
  const deliveryId = request.headers.get("x-github-delivery")

  if (!(event && deliveryId)) {
    return new Response("Missing event headers", { status: 400 })
  }

  const payload = JSON.parse(body) as {
    action?: string
    issue?: {
      id: number
      number: number
      title: string
      body: string | null
      html_url: string
    }
    repository?: { full_name: string }
  }

  try {
    if (event === "issues" && payload.action === "opened") {
      const issue = payload.issue
      const repo = payload.repository?.full_name
      if (!(issue && repo)) {
        return new Response("OK", { status: 200 })
      }

      const discord = new DiscordRestService(env.DISCORD_BOT_TOKEN)
      const repository = new D1Repository(env.DB)

      await syncIssueOpened(
        {
          deliveryId,
          issueId: issue.id,
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body,
          repo,
          htmlUrl: issue.html_url,
          forumChannelId: env.DISCORD_FORUM_CHANNEL_ID,
        },
        { discord, repository }
      )
    }
  } catch (error) {
    console.error("Webhook processing error:", error)
  }

  return new Response("OK", { status: 200 })
}
