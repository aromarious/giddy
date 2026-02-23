import type { AiService } from "@/application/ports/ai-service"
import type { DiscordService } from "@/application/ports/discord-service"
import type { GitHubService } from "@/application/ports/github-service"
import type { Repository } from "@/application/ports/repository"
import { isBotMessage } from "../infrastructure/shared/loop-guard"
import { createForumPostForIssue } from "./sync-issue"

// --- Shared types ---

export interface SlashCommandDeps {
  discord: DiscordService
  repository: Repository
  github: GitHubService
  ai: AiService
  botUserId: string
}

// --- /comment ---

export interface CommentCommandParams {
  threadId: string
  text: string
  repo: string
}

export async function handleCommentCommand(
  params: CommentCommandParams,
  deps: SlashCommandDeps
): Promise<{ ok: true } | { ok: false; error: string }> {
  const issueMap = await deps.repository.findIssueMapByDiscordThreadId(
    params.threadId
  )
  if (!issueMap) {
    return {
      ok: false,
      error:
        "This thread is not linked to a GitHub Issue. Use `/create-issue` first.",
    }
  }

  await deps.github.createComment({
    repo: params.repo,
    issueNumber: issueMap.githubIssueNumber,
    body: params.text,
  })

  return { ok: true }
}

// --- /create-issue ---

export interface CreateIssueCommandParams {
  threadId: string
  title: string
  body?: string
  relation?: "sub" | "link"
  forumChannelId: string
  repo: string
}

export async function handleCreateIssueCommand(
  params: CreateIssueCommandParams,
  deps: SlashCommandDeps
): Promise<
  | { ok: true; issueNumber: number; htmlUrl: string }
  | { ok: false; error: string }
> {
  const existing = await deps.repository.findIssueMapByDiscordThreadId(
    params.threadId
  )

  // Build body
  let body = params.body ?? "Created from Discord thread."
  if (existing && params.relation === "link") {
    body += `\n\nRelated to #${existing.githubIssueNumber}`
  }

  // Create issue (sub-issue or normal)
  let issueId: number
  let issueNumber: number
  if (existing && params.relation === "sub") {
    const result = await deps.github.createSubIssue({
      repo: params.repo,
      parentIssueNumber: existing.githubIssueNumber,
      title: params.title,
      body,
    })
    issueId = result.issueId
    issueNumber = result.issueNumber
  } else {
    const result = await deps.github.createIssue({
      repo: params.repo,
      title: params.title,
      body,
    })
    issueId = result.issueId
    issueNumber = result.issueNumber
  }

  const htmlUrl = `https://github.com/${params.repo}/issues/${issueNumber}`

  await createForumPostForIssue(
    {
      issueId,
      issueNumber,
      title: params.title,
      body: null,
      repo: params.repo,
      htmlUrl,
      forumChannelId: params.forumChannelId,
    },
    deps
  )

  return { ok: true, issueNumber, htmlUrl }
}

// --- /summarize ---

export interface SummarizeCommandParams {
  threadId: string
  repo: string
}

export async function handleSummarizeCommand(
  params: SummarizeCommandParams,
  deps: SlashCommandDeps
): Promise<
  | { ok: true; summary: string; commentId: number }
  | { ok: false; error: string }
> {
  const issueMap = await deps.repository.findIssueMapByDiscordThreadId(
    params.threadId
  )
  if (!issueMap) {
    return {
      ok: false,
      error:
        "This thread is not linked to a GitHub Issue. Use `/create-issue` first.",
    }
  }

  // Find last summary position
  const lastSummary = await deps.repository.findLatestSummaryLog(issueMap.id)
  const afterMessageId = lastSummary?.lastMessageId

  // Fetch messages (paginated, up to 500)
  const allMessages: {
    id: string
    content: string
    author: { id: string; bot?: boolean }
  }[] = []
  let after = afterMessageId
  for (let page = 0; page < 5; page++) {
    const batch = await deps.discord.getMessages(params.threadId, after, 100)
    if (batch.length === 0) {
      break
    }
    allMessages.push(...batch)
    after = batch.at(-1)?.id
    if (batch.length < 100) {
      break
    }
  }

  // Filter out bot messages
  const humanMessages = allMessages.filter(
    (m) => !isBotMessage(m, deps.botUserId)
  )

  if (humanMessages.length === 0) {
    return { ok: false, error: "No new messages to summarize." }
  }

  // Build conversation text for AI
  const conversationText = humanMessages.map((m) => m.content).join("\n---\n")

  const summary = await deps.ai.summarize(conversationText)

  // Post summary as GitHub comment
  const { commentId } = await deps.github.createComment({
    repo: params.repo,
    issueNumber: issueMap.githubIssueNumber,
    body: `## Discord Thread Summary\n\n${summary}`,
  })

  // Record summary log
  const lastMessageId = allMessages.at(-1)?.id ?? ""
  await deps.repository.createSummaryLog({
    issueMapId: issueMap.id,
    lastMessageId,
    githubCommentId: commentId,
    messageCount: humanMessages.length,
  })

  return { ok: true, summary, commentId }
}
