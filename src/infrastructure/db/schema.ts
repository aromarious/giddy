import { sql } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const issueMap = sqliteTable(
  "issue_map",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    githubIssueId: integer("github_issue_id").notNull(),
    githubIssueNumber: integer("github_issue_number").notNull(),
    discordThreadId: text("discord_thread_id").notNull(),
    discordFirstMessageId: text("discord_first_message_id"),
    repo: text("repo").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    syncedAt: text("synced_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("uq_issue_map_github").on(table.githubIssueId, table.repo),
    uniqueIndex("uq_issue_map_discord").on(table.discordThreadId),
  ]
)

export const commentMap = sqliteTable(
  "comment_map",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    githubCommentId: integer("github_comment_id").notNull(),
    discordMessageId: text("discord_message_id").notNull(),
    issueMapId: integer("issue_map_id")
      .notNull()
      .references(() => issueMap.id),
  },
  (table) => [
    uniqueIndex("uq_comment_map_github").on(table.githubCommentId),
    uniqueIndex("uq_comment_map_discord").on(table.discordMessageId),
    index("idx_comment_map_issue_map_id").on(table.issueMapId),
  ]
)

export const summaryLog = sqliteTable(
  "summary_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    issueMapId: integer("issue_map_id")
      .notNull()
      .references(() => issueMap.id),
    lastMessageId: text("last_message_id").notNull(),
    githubCommentId: integer("github_comment_id").notNull(),
    messageCount: integer("message_count").notNull(),
    summarizedAt: text("summarized_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_summary_log_issue_map_id").on(
      table.issueMapId,
      table.summarizedAt
    ),
  ]
)

export const eventLog = sqliteTable("event_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  source: text("source", { enum: ["github", "discord_command"] }).notNull(),
  eventType: text("event_type").notNull(),
  processedAt: text("processed_at").notNull().default(sql`(datetime('now'))`),
  status: text("status", { enum: ["success", "failed"] }).notNull(),
})
