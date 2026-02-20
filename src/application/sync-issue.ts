import type { DiscordService } from "@/application/ports/discord-service"
import type { Repository } from "@/application/ports/repository"

const TITLE_MAX_LENGTH = 100
const CONTENT_MAX_LENGTH = 3900

export interface SyncIssueOpenedParams {
  deliveryId: string
  issueId: number
  issueNumber: number
  title: string
  body: string | null
  repo: string
  htmlUrl: string
  forumChannelId: string
}

export interface SyncIssueOpenedDeps {
  discord: DiscordService
  repository: Repository
}

export function formatForumPostTitle(
  issueNumber: number,
  title: string
): string {
  const prefix = `#${issueNumber} `
  const maxTitleChars = TITLE_MAX_LENGTH - prefix.length
  if (title.length > maxTitleChars) {
    return `${prefix}${title.slice(0, maxTitleChars - 1)}…`
  }
  return `${prefix}${title}`
}

export function formatForumPostContent(
  body: string | null,
  htmlUrl: string
): string {
  const link = `[View on GitHub](${htmlUrl})`

  if (!body) {
    return link
  }

  if (body.length > CONTENT_MAX_LENGTH) {
    const truncated = body.slice(0, CONTENT_MAX_LENGTH)
    return `${truncated}…\n\n${link}`
  }

  return `${body}\n\n${link}`
}

export async function syncIssueOpened(
  params: SyncIssueOpenedParams,
  deps: SyncIssueOpenedDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  // 1. Idempotency check
  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  // 2. Duplicate map check
  const existingMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (existingMap) {
    console.log(
      `Issue map already exists for issue ${params.issueId} in ${params.repo}`
    )
    return
  }

  // 3. Create Forum Post
  const forumTitle = formatForumPostTitle(params.issueNumber, params.title)
  const forumContent = formatForumPostContent(params.body, params.htmlUrl)

  const { threadId, messageId } = await deps.discord.createForumPost({
    channelId: params.forumChannelId,
    title: forumTitle,
    content: forumContent,
  })

  // 4. Record issue map
  await deps.repository.createIssueMap({
    githubIssueId: params.issueId,
    githubIssueNumber: params.issueNumber,
    discordThreadId: threadId,
    discordFirstMessageId: messageId,
    repo: params.repo,
  })

  // 5. Record event log
  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issues.opened",
    status: "success",
  })
}
