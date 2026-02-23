import { and, desc, eq, sql } from "drizzle-orm"
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1"
import type {
  CommentMapRow,
  IssueMapRow,
  Repository,
  SummaryLogRow,
} from "@/application/ports/repository"
import { commentMap, eventLog, issueMap, summaryLog } from "./schema"

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

  async findIssueMapByDiscordThreadId(
    threadId: string
  ): Promise<IssueMapRow | undefined> {
    const rows = await this.db
      .select()
      .from(issueMap)
      .where(eq(issueMap.discordThreadId, threadId))
      .limit(1)
    return rows[0]
  }

  async updateIssueMapSyncedAt(id: number): Promise<void> {
    await this.db
      .update(issueMap)
      .set({ syncedAt: sql`(datetime('now'))` })
      .where(eq(issueMap.id, id))
  }

  async createCommentMap(params: {
    githubCommentId: number
    discordMessageId: string
    issueMapId: number
  }): Promise<CommentMapRow> {
    const [row] = await this.db.insert(commentMap).values(params).returning()
    return row
  }

  async findCommentMapByGithubCommentId(
    commentId: number
  ): Promise<CommentMapRow | undefined> {
    const rows = await this.db
      .select()
      .from(commentMap)
      .where(eq(commentMap.githubCommentId, commentId))
      .limit(1)
    return rows[0]
  }

  async findCommentMapByDiscordMessageId(
    messageId: string
  ): Promise<CommentMapRow | undefined> {
    const rows = await this.db
      .select()
      .from(commentMap)
      .where(eq(commentMap.discordMessageId, messageId))
      .limit(1)
    return rows[0]
  }

  async deleteCommentMap(githubCommentId: number): Promise<void> {
    await this.db
      .delete(commentMap)
      .where(eq(commentMap.githubCommentId, githubCommentId))
  }

  async createSummaryLog(params: {
    issueMapId: number
    lastMessageId: string
    githubCommentId: number
    messageCount: number
  }): Promise<SummaryLogRow> {
    const [row] = await this.db.insert(summaryLog).values(params).returning()
    return row
  }

  async findLatestSummaryLog(
    issueMapId: number
  ): Promise<SummaryLogRow | undefined> {
    const rows = await this.db
      .select()
      .from(summaryLog)
      .where(eq(summaryLog.issueMapId, issueMapId))
      .orderBy(desc(summaryLog.summarizedAt))
      .limit(1)
    return rows[0]
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
