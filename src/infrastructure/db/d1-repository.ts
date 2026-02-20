import { and, eq } from "drizzle-orm"
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1"
import type {
  CommentMapRow,
  IssueMapRow,
  Repository,
  SummaryLogRow,
} from "@/application/ports/repository"
import { eventLog, issueMap } from "./schema"

export class D1Repository implements Repository {
  private readonly db: DrizzleD1Database

  constructor(d1: D1Database) {
    this.db = drizzle(d1)
  }

  async createIssueMap(params: {
    githubIssueId: number
    githubIssueNumber: number
    discordThreadId: string
    discordFirstMessageId: string | null
    repo: string
  }): Promise<IssueMapRow> {
    const [row] = await this.db.insert(issueMap).values(params).returning()
    return row
  }

  async findIssueMapByGithubIssueId(
    githubIssueId: number,
    repo: string
  ): Promise<IssueMapRow | undefined> {
    const rows = await this.db
      .select()
      .from(issueMap)
      .where(
        and(eq(issueMap.githubIssueId, githubIssueId), eq(issueMap.repo, repo))
      )
      .limit(1)
    return rows[0]
  }

  findIssueMapByDiscordThreadId(
    _threadId: string
  ): Promise<IssueMapRow | undefined> {
    throw new Error("Not implemented")
  }

  createCommentMap(_params: {
    githubCommentId: number
    discordMessageId: string
    issueMapId: number
  }): Promise<CommentMapRow> {
    throw new Error("Not implemented")
  }

  findCommentMapByGithubCommentId(
    _commentId: number
  ): Promise<CommentMapRow | undefined> {
    throw new Error("Not implemented")
  }

  findCommentMapByDiscordMessageId(
    _messageId: string
  ): Promise<CommentMapRow | undefined> {
    throw new Error("Not implemented")
  }

  createSummaryLog(_params: {
    issueMapId: number
    lastMessageId: string
    githubCommentId: number
    messageCount: number
  }): Promise<SummaryLogRow> {
    throw new Error("Not implemented")
  }

  async hasProcessedEvent(idempotencyKey: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(eventLog)
      .where(eq(eventLog.idempotencyKey, idempotencyKey))
      .limit(1)
    return rows.length > 0
  }

  async recordEvent(params: {
    idempotencyKey: string
    source: "github" | "discord_command"
    eventType: string
    status: "success" | "failed"
  }): Promise<void> {
    await this.db.insert(eventLog).values(params)
  }
}
