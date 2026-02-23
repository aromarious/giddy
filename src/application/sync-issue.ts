import type { DiscordService } from "@/application/ports/discord-service"
import type { Repository } from "@/application/ports/repository"
import { toDiscordMarkdown } from "../infrastructure/shared/markdown"

const TITLE_MAX_LENGTH = 100
const CONTENT_MAX_LENGTH = 3900

// --- Shared types ---

export interface SyncDeps {
  discord: DiscordService
  repository: Repository
}

// --- syncIssueOpened ---

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

export type SyncIssueOpenedDeps = SyncDeps

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

// --- createForumPostForIssue (shared) ---

export interface CreateForumPostForIssueParams {
  issueId: number
  issueNumber: number
  title: string
  body: string | null
  repo: string
  htmlUrl: string
  forumChannelId: string
}

export async function createForumPostForIssue(
  params: CreateForumPostForIssueParams,
  deps: SyncDeps
): Promise<{ threadId: string }> {
  const forumTitle = formatForumPostTitle(params.issueNumber, params.title)
  const forumContent = formatForumPostContent(params.body, params.htmlUrl)

  const { threadId, messageId } = await deps.discord.createForumPost({
    channelId: params.forumChannelId,
    title: forumTitle,
    content: forumContent,
  })

  await deps.repository.createIssueMap({
    githubIssueId: params.issueId,
    githubIssueNumber: params.issueNumber,
    discordThreadId: threadId,
    discordFirstMessageId: messageId,
    repo: params.repo,
  })

  return { threadId }
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

  // 3. Create Forum Post + Record issue map
  await createForumPostForIssue(params, deps)

  // 4. Record event log
  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issues.opened",
    status: "success",
  })
}

// --- syncIssueEdited ---

export interface SyncIssueEditedParams {
  deliveryId: string
  issueId: number
  issueNumber: number
  title: string
  body: string | null
  repo: string
  htmlUrl: string
  changes: {
    title?: { from: string }
    body?: { from: string }
  }
}

export async function syncIssueEdited(
  params: SyncIssueEditedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  const issueMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (!issueMap) {
    console.log(
      `No issue map found for issue ${params.issueId} in ${params.repo}, skipping edit`
    )
    return
  }

  // Unarchive if needed before editing
  await deps.discord.unarchiveThread(issueMap.discordThreadId).catch(() => {
    // Thread may not be archived — ignore error
  })

  const newTitle = params.changes.title
    ? formatForumPostTitle(params.issueNumber, params.title)
    : undefined
  const newContent = params.changes.body
    ? formatForumPostContent(params.body, params.htmlUrl)
    : undefined

  if (issueMap.discordFirstMessageId) {
    await deps.discord.editForumPost(
      issueMap.discordThreadId,
      issueMap.discordFirstMessageId,
      newTitle,
      newContent
    )
  } else if (newTitle) {
    // No first message ID — can only update title
    await deps.discord.editForumPost(
      issueMap.discordThreadId,
      "",
      newTitle,
      undefined
    )
  }

  await deps.repository.updateIssueMapSyncedAt(issueMap.id)

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issues.edited",
    status: "success",
  })
}

// --- syncIssueClosed ---

export interface SyncIssueClosedParams {
  deliveryId: string
  issueId: number
  repo: string
  htmlUrl: string
}

export async function syncIssueClosed(
  params: SyncIssueClosedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  const issueMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (!issueMap) {
    console.log(
      `No issue map found for issue ${params.issueId} in ${params.repo}, skipping close`
    )
    return
  }

  // Unarchive if needed before posting notification
  await deps.discord.unarchiveThread(issueMap.discordThreadId).catch(() => {
    // Thread may not be archived — ignore error
  })

  await deps.discord.postMessage(
    issueMap.discordThreadId,
    `\u{1F512} Issue was closed. [View on GitHub](${params.htmlUrl})`
  )

  await deps.discord.archiveThread(issueMap.discordThreadId)

  await deps.repository.updateIssueMapSyncedAt(issueMap.id)

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issues.closed",
    status: "success",
  })
}

// --- syncIssueReopened ---

export interface SyncIssueReopenedParams {
  deliveryId: string
  issueId: number
  repo: string
  htmlUrl: string
}

export async function syncIssueReopened(
  params: SyncIssueReopenedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  const issueMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (!issueMap) {
    console.log(
      `No issue map found for issue ${params.issueId} in ${params.repo}, skipping reopen`
    )
    return
  }

  await deps.discord.unarchiveThread(issueMap.discordThreadId)

  await deps.discord.postMessage(
    issueMap.discordThreadId,
    `\u{1F513} Issue was reopened. [View on GitHub](${params.htmlUrl})`
  )

  await deps.repository.updateIssueMapSyncedAt(issueMap.id)

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issues.reopened",
    status: "success",
  })
}

// --- syncIssueCommentCreated ---

export interface SyncIssueCommentCreatedParams {
  deliveryId: string
  issueId: number
  repo: string
  commentId: number
  commentBody: string
  commentUser: string
  htmlUrl: string
}

export async function syncIssueCommentCreated(
  params: SyncIssueCommentCreatedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  const issueMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (!issueMap) {
    console.log(
      `No issue map found for issue ${params.issueId} in ${params.repo}, skipping comment`
    )
    return
  }

  // Unarchive if needed before posting
  await deps.discord.unarchiveThread(issueMap.discordThreadId).catch(() => {
    // Thread may not be archived — ignore error
  })

  const body = toDiscordMarkdown(
    params.commentBody,
    params.repo,
    params.htmlUrl
  )
  const content = `**${params.commentUser}** commented:\n${body}\n\n[View on GitHub](${params.htmlUrl})`

  const discordMessageId = await deps.discord.postMessage(
    issueMap.discordThreadId,
    content
  )

  await deps.repository.createCommentMap({
    githubCommentId: params.commentId,
    discordMessageId,
    issueMapId: issueMap.id,
  })

  await deps.repository.updateIssueMapSyncedAt(issueMap.id)

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issue_comment.created",
    status: "success",
  })
}

// --- syncIssueCommentEdited ---

export interface SyncIssueCommentEditedParams {
  deliveryId: string
  issueId: number
  commentId: number
  commentBody: string
  commentUser: string
  repo: string
  htmlUrl: string
}

export async function syncIssueCommentEdited(
  params: SyncIssueCommentEditedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  const commentMapRow = await deps.repository.findCommentMapByGithubCommentId(
    params.commentId
  )
  if (!commentMapRow) {
    console.log(
      `No comment map found for comment ${params.commentId}, skipping edit`
    )
    return
  }

  const issueMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (!issueMap) {
    console.log(
      `No issue map found for issue ${params.issueId} in ${params.repo}, skipping comment edit`
    )
    return
  }

  // Unarchive if needed
  await deps.discord.unarchiveThread(issueMap.discordThreadId).catch(() => {
    // Thread may not be archived — ignore error
  })

  const body = toDiscordMarkdown(
    params.commentBody,
    params.repo,
    params.htmlUrl
  )
  const content = `**${params.commentUser}** commented:\n${body}\n\n[View on GitHub](${params.htmlUrl})`

  await deps.discord.editMessage(
    issueMap.discordThreadId,
    commentMapRow.discordMessageId,
    content
  )

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issue_comment.edited",
    status: "success",
  })
}

// --- syncIssueCommentDeleted ---

export interface SyncIssueCommentDeletedParams {
  deliveryId: string
  commentId: number
  issueId: number
  repo: string
}

export async function syncIssueCommentDeleted(
  params: SyncIssueCommentDeletedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`

  const alreadyProcessed =
    await deps.repository.hasProcessedEvent(idempotencyKey)
  if (alreadyProcessed) {
    console.log(`Skipping already processed event: ${idempotencyKey}`)
    return
  }

  const commentMapRow = await deps.repository.findCommentMapByGithubCommentId(
    params.commentId
  )
  if (!commentMapRow) {
    console.log(
      `No comment map found for comment ${params.commentId}, skipping delete`
    )
    return
  }

  // Find the issue map to get the thread ID for deletion
  const issueMap = await deps.repository.findIssueMapByGithubIssueId(
    params.issueId,
    params.repo
  )
  if (issueMap) {
    await deps.discord.deleteMessage(
      issueMap.discordThreadId,
      commentMapRow.discordMessageId
    )
  }

  await deps.repository.deleteCommentMap(params.commentId)

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "issue_comment.deleted",
    status: "success",
  })
}

// --- syncSubIssueAdded ---

export interface SyncSubIssueAddedParams {
  deliveryId: string
  parentIssueId: number
  parentIssueNumber: number
  parentIssueTitle: string
  parentIssueBody: string | null
  parentIssueHtmlUrl: string
  subIssueId: number
  subIssueNumber: number
  subIssueTitle: string
  subIssueBody: string | null
  subIssueHtmlUrl: string
  repo: string
  guildId: string
  forumChannelId: string
}

export async function syncSubIssueAdded(
  params: SyncSubIssueAddedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`
  if (await deps.repository.hasProcessedEvent(idempotencyKey)) {
    return
  }

  // Ensure parent issue has a forum post (race condition fallback)
  let parentMap = await deps.repository.findIssueMapByGithubIssueId(
    params.parentIssueId,
    params.repo
  )
  if (!parentMap) {
    await createForumPostForIssue(
      {
        issueId: params.parentIssueId,
        issueNumber: params.parentIssueNumber,
        title: params.parentIssueTitle,
        body: params.parentIssueBody,
        repo: params.repo,
        htmlUrl: params.parentIssueHtmlUrl,
        forumChannelId: params.forumChannelId,
      },
      deps
    )
    parentMap = await deps.repository.findIssueMapByGithubIssueId(
      params.parentIssueId,
      params.repo
    )
  }

  // Ensure sub-issue has a forum post (race condition fallback)
  let subMap = await deps.repository.findIssueMapByGithubIssueId(
    params.subIssueId,
    params.repo
  )
  if (!subMap) {
    await createForumPostForIssue(
      {
        issueId: params.subIssueId,
        issueNumber: params.subIssueNumber,
        title: params.subIssueTitle,
        body: params.subIssueBody,
        repo: params.repo,
        htmlUrl: params.subIssueHtmlUrl,
        forumChannelId: params.forumChannelId,
      },
      deps
    )
    subMap = await deps.repository.findIssueMapByGithubIssueId(
      params.subIssueId,
      params.repo
    )
  }

  if (parentMap && subMap) {
    const parentUrl = `https://discord.com/channels/${params.guildId}/${parentMap.discordThreadId}`
    const subUrl = `https://discord.com/channels/${params.guildId}/${subMap.discordThreadId}`

    await deps.discord.postMessage(
      subMap.discordThreadId,
      `\u{1F4CC} Parent: [#${params.parentIssueNumber}](${parentUrl})`
    )
    await deps.discord.postMessage(
      parentMap.discordThreadId,
      `\u{1F4CE} Sub-issue added: [#${params.subIssueNumber}](${subUrl})`
    )
  }

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "sub_issues.sub_issue_added",
    status: "success",
  })
}

// --- syncSubIssueRemoved ---

export interface SyncSubIssueRemovedParams {
  deliveryId: string
  parentIssueId: number
  parentIssueNumber: number
  subIssueId: number
  subIssueNumber: number
  repo: string
  guildId: string
}

export async function syncSubIssueRemoved(
  params: SyncSubIssueRemovedParams,
  deps: SyncDeps
): Promise<void> {
  const idempotencyKey = `github:${params.deliveryId}`
  if (await deps.repository.hasProcessedEvent(idempotencyKey)) {
    return
  }

  const parentMap = await deps.repository.findIssueMapByGithubIssueId(
    params.parentIssueId,
    params.repo
  )
  const subMap = await deps.repository.findIssueMapByGithubIssueId(
    params.subIssueId,
    params.repo
  )

  if (parentMap && subMap) {
    const parentUrl = `https://discord.com/channels/${params.guildId}/${parentMap.discordThreadId}`
    const subUrl = `https://discord.com/channels/${params.guildId}/${subMap.discordThreadId}`

    await deps.discord.postMessage(
      subMap.discordThreadId,
      `\u{274C} Removed from parent: [#${params.parentIssueNumber}](${parentUrl})`
    )
    await deps.discord.postMessage(
      parentMap.discordThreadId,
      `\u{274C} Sub-issue removed: [#${params.subIssueNumber}](${subUrl})`
    )
  }

  await deps.repository.recordEvent({
    idempotencyKey,
    source: "github",
    eventType: "sub_issues.sub_issue_removed",
    status: "success",
  })
}
