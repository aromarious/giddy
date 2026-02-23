import {
  syncIssueClosed,
  syncIssueCommentCreated,
  syncIssueCommentDeleted,
  syncIssueCommentEdited,
  syncIssueEdited,
  syncIssueOpened,
  syncIssueReopened,
} from "@/application/sync-issue"
import { D1Repository } from "@/infrastructure/db/d1-repository"
import { DiscordRestService } from "@/infrastructure/discord/discord-rest"
import { isGitHubBotAction } from "@/infrastructure/shared/loop-guard"
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

interface WebhookPayload {
  action?: string
  sender?: { type?: string; id?: number }
  issue?: {
    id: number
    number: number
    title: string
    body: string | null
    html_url: string
  }
  comment?: {
    id: number
    body: string
    html_url: string
    user: { login: string }
  }
  changes?: {
    title?: { from: string }
    body?: { from: string }
  }
  repository?: { full_name: string }
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

  const payload = JSON.parse(body) as WebhookPayload

  // Loop guard: skip events triggered by the bot itself
  if (isGitHubBotAction(payload)) {
    console.log(`Skipping bot-triggered event: ${event}.${payload.action}`)
    return new Response("OK", { status: 200 })
  }

  try {
    const discord = new DiscordRestService(env.DISCORD_BOT_TOKEN)
    const repository = new D1Repository(env.DB)
    const deps = { discord, repository }

    if (event === "issues") {
      const issue = payload.issue
      const repo = payload.repository?.full_name
      if (!(issue && repo)) {
        return new Response("OK", { status: 200 })
      }

      switch (payload.action) {
        case "opened":
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
            deps
          )
          break
        case "edited":
          await syncIssueEdited(
            {
              deliveryId,
              issueId: issue.id,
              issueNumber: issue.number,
              title: issue.title,
              body: issue.body,
              repo,
              htmlUrl: issue.html_url,
              changes: payload.changes ?? {},
            },
            deps
          )
          break
        case "closed":
          await syncIssueClosed(
            {
              deliveryId,
              issueId: issue.id,
              repo,
              htmlUrl: issue.html_url,
            },
            deps
          )
          break
        case "reopened":
          await syncIssueReopened(
            {
              deliveryId,
              issueId: issue.id,
              repo,
              htmlUrl: issue.html_url,
            },
            deps
          )
          break
        default:
          break
      }
    }

    if (event === "issue_comment") {
      const issue = payload.issue
      const comment = payload.comment
      const repo = payload.repository?.full_name
      if (!(issue && comment && repo)) {
        return new Response("OK", { status: 200 })
      }

      switch (payload.action) {
        case "created":
          await syncIssueCommentCreated(
            {
              deliveryId,
              issueId: issue.id,
              repo,
              commentId: comment.id,
              commentBody: comment.body,
              commentUser: comment.user.login,
              htmlUrl: comment.html_url,
            },
            deps
          )
          break
        case "edited":
          await syncIssueCommentEdited(
            {
              deliveryId,
              issueId: issue.id,
              commentId: comment.id,
              commentBody: comment.body,
              commentUser: comment.user.login,
              repo,
              htmlUrl: comment.html_url,
            },
            deps
          )
          break
        case "deleted":
          await syncIssueCommentDeleted(
            {
              deliveryId,
              commentId: comment.id,
              issueId: issue.id,
              repo,
            },
            deps
          )
          break
        default:
          break
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error)
  }

  return new Response("OK", { status: 200 })
}
