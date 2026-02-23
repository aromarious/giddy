import { Webhooks } from "@octokit/webhooks"
import {
  syncIssueClosed,
  syncIssueCommentCreated,
  syncIssueCommentDeleted,
  syncIssueCommentEdited,
  syncIssueEdited,
  syncIssueOpened,
  syncIssueReopened,
  syncSubIssueAdded,
  syncSubIssueRemoved,
} from "@/application/sync-issue"
import { D1Repository } from "@/infrastructure/db/d1-repository"
import { DiscordRestService } from "@/infrastructure/discord/discord-rest"
import { isGitHubBotAction } from "@/infrastructure/shared/loop-guard"
import type { Env } from "@/types/env"

export async function handleGitHubWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get("x-hub-signature-256") ?? ""
  const event = request.headers.get("x-github-event")
  const deliveryId = request.headers.get("x-github-delivery")

  if (!(event && deliveryId)) {
    return new Response("Missing event headers", { status: 400 })
  }

  const webhooks = new Webhooks({ secret: env.GITHUB_WEBHOOK_SECRET })

  try {
    await webhooks.verify(body, signature)
  } catch {
    return new Response("Invalid signature", { status: 401 })
  }

  const payload = JSON.parse(body)

  if (isGitHubBotAction(payload)) {
    console.log(`Skipping bot-triggered event: ${event}.${payload.action}`)
    return new Response("OK", { status: 200 })
  }

  const discord = new DiscordRestService(env.DISCORD_BOT_TOKEN)
  const repository = new D1Repository(env.DB)
  const deps = { discord, repository }

  // --- issues ---

  webhooks.on("issues.opened", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueOpened(
      {
        deliveryId,
        issueId: payload.issue.id,
        issueNumber: payload.issue.number,
        title: payload.issue.title,
        body: payload.issue.body,
        repo,
        htmlUrl: payload.issue.html_url,
        forumChannelId: env.DISCORD_FORUM_CHANNEL_ID,
      },
      deps
    )
  })

  webhooks.on("issues.edited", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueEdited(
      {
        deliveryId,
        issueId: payload.issue.id,
        issueNumber: payload.issue.number,
        title: payload.issue.title,
        body: payload.issue.body,
        repo,
        htmlUrl: payload.issue.html_url,
        changes: payload.changes ?? {},
      },
      deps
    )
  })

  webhooks.on("issues.closed", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueClosed(
      {
        deliveryId,
        issueId: payload.issue.id,
        repo,
        htmlUrl: payload.issue.html_url,
      },
      deps
    )
  })

  webhooks.on("issues.reopened", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueReopened(
      {
        deliveryId,
        issueId: payload.issue.id,
        repo,
        htmlUrl: payload.issue.html_url,
      },
      deps
    )
  })

  // --- issue_comment ---

  webhooks.on("issue_comment.created", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueCommentCreated(
      {
        deliveryId,
        issueId: payload.issue.id,
        repo,
        commentId: payload.comment.id,
        commentBody: payload.comment.body,
        commentUser: payload.comment.user?.login ?? "unknown",
        htmlUrl: payload.comment.html_url,
      },
      deps
    )
  })

  webhooks.on("issue_comment.edited", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueCommentEdited(
      {
        deliveryId,
        issueId: payload.issue.id,
        commentId: payload.comment.id,
        commentBody: payload.comment.body,
        commentUser: payload.comment.user?.login ?? "unknown",
        repo,
        htmlUrl: payload.comment.html_url,
      },
      deps
    )
  })

  webhooks.on("issue_comment.deleted", async ({ payload }) => {
    const repo = payload.repository.full_name
    await syncIssueCommentDeleted(
      {
        deliveryId,
        commentId: payload.comment.id,
        issueId: payload.issue.id,
        repo,
      },
      deps
    )
  })

  // --- sub_issues ---

  webhooks.on("sub_issues.sub_issue_added", async ({ payload }) => {
    const repo = payload.repository?.full_name
    if (!repo) {
      return
    }
    await syncSubIssueAdded(
      {
        deliveryId,
        parentIssueId: payload.parent_issue.id,
        parentIssueNumber: payload.parent_issue.number,
        parentIssueTitle: payload.parent_issue.title,
        parentIssueBody: payload.parent_issue.body ?? null,
        parentIssueHtmlUrl: payload.parent_issue.html_url,
        subIssueId: payload.sub_issue.id,
        subIssueNumber: payload.sub_issue.number,
        subIssueTitle: payload.sub_issue.title,
        subIssueBody: payload.sub_issue.body ?? null,
        subIssueHtmlUrl: payload.sub_issue.html_url,
        repo,
        guildId: env.DISCORD_GUILD_ID,
        forumChannelId: env.DISCORD_FORUM_CHANNEL_ID,
      },
      deps
    )
  })

  webhooks.on("sub_issues.sub_issue_removed", async ({ payload }) => {
    const repo = payload.repository?.full_name
    if (!repo) {
      return
    }
    await syncSubIssueRemoved(
      {
        deliveryId,
        parentIssueId: payload.parent_issue.id,
        parentIssueNumber: payload.parent_issue.number,
        subIssueId: payload.sub_issue.id,
        subIssueNumber: payload.sub_issue.number,
        repo,
        guildId: env.DISCORD_GUILD_ID,
      },
      deps
    )
  })

  // --- dispatch ---

  try {
    await webhooks.receive({
      id: deliveryId,
      // biome-ignore lint/suspicious/noExplicitAny: event name from GitHub header
      name: event as any,
      payload,
    })
  } catch (error) {
    console.error("Webhook processing error:", error)
  }

  return new Response("OK", { status: 200 })
}
