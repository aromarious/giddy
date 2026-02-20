import type {
  commentMap,
  issueMap,
  summaryLog,
} from "@/infrastructure/db/schema"

export type IssueMapRow = typeof issueMap.$inferSelect
export type CommentMapRow = typeof commentMap.$inferSelect
export type SummaryLogRow = typeof summaryLog.$inferSelect

export interface Repository {
  // issue_map
  createIssueMap(params: {
    githubIssueId: number
    githubIssueNumber: number
    discordThreadId: string
    discordFirstMessageId: string | null
    repo: string
  }): Promise<IssueMapRow>
  findIssueMapByGithubIssueId(
    githubIssueId: number,
    repo: string
  ): Promise<IssueMapRow | undefined>
  findIssueMapByDiscordThreadId(
    threadId: string
  ): Promise<IssueMapRow | undefined>

  // comment_map
  createCommentMap(params: {
    githubCommentId: number
    discordMessageId: string
    issueMapId: number
  }): Promise<CommentMapRow>
  findCommentMapByGithubCommentId(
    commentId: number
  ): Promise<CommentMapRow | undefined>
  findCommentMapByDiscordMessageId(
    messageId: string
  ): Promise<CommentMapRow | undefined>

  // summary_log
  createSummaryLog(params: {
    issueMapId: number
    lastMessageId: string
    githubCommentId: number
    messageCount: number
  }): Promise<SummaryLogRow>

  // event_log (idempotency)
  hasProcessedEvent(idempotencyKey: string): Promise<boolean>
  recordEvent(params: {
    idempotencyKey: string
    source: "github" | "discord_command"
    eventType: string
    status: "success" | "failed"
  }): Promise<void>
}
