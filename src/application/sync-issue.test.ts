import { describe, expect, it, vi } from "vitest"
import type { DiscordService } from "@/application/ports/discord-service"
import type { Repository } from "@/application/ports/repository"
import {
  formatForumPostContent,
  formatForumPostTitle,
  syncIssueOpened,
} from "./sync-issue"

const TRUNCATED_TITLE_PATTERN = /^#1 A+…$/

function createMockDeps() {
  const discord: DiscordService = {
    createForumPost: vi.fn().mockResolvedValue({
      threadId: "thread-123",
      messageId: "msg-456",
    }),
    editForumPost: vi.fn(),
    postMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    archiveThread: vi.fn(),
    unarchiveThread: vi.fn(),
    getMessages: vi.fn(),
  }

  const repository: Repository = {
    createIssueMap: vi.fn().mockResolvedValue({
      id: 1,
      githubIssueId: 100,
      githubIssueNumber: 42,
      discordThreadId: "thread-123",
      discordFirstMessageId: "msg-456",
      repo: "owner/repo",
      createdAt: "2026-01-01",
      syncedAt: "2026-01-01",
    }),
    findIssueMapByGithubIssueId: vi.fn().mockResolvedValue(undefined),
    findIssueMapByDiscordThreadId: vi.fn(),
    createCommentMap: vi.fn(),
    findCommentMapByGithubCommentId: vi.fn(),
    findCommentMapByDiscordMessageId: vi.fn(),
    createSummaryLog: vi.fn(),
    hasProcessedEvent: vi.fn().mockResolvedValue(false),
    recordEvent: vi.fn().mockResolvedValue(undefined),
  }

  return { discord, repository }
}

const baseParams = {
  deliveryId: "delivery-uuid-1",
  issueId: 100,
  issueNumber: 42,
  title: "Test Issue",
  body: "Issue body content",
  repo: "owner/repo",
  htmlUrl: "https://github.com/owner/repo/issues/42",
  forumChannelId: "channel-789",
}

describe("syncIssueOpened", () => {
  it("creates a forum post and records mapping on happy path", async () => {
    const deps = createMockDeps()

    await syncIssueOpened(baseParams, deps)

    expect(deps.repository.hasProcessedEvent).toHaveBeenCalledWith(
      "github:delivery-uuid-1"
    )
    expect(deps.repository.findIssueMapByGithubIssueId).toHaveBeenCalledWith(
      100,
      "owner/repo"
    )
    expect(deps.discord.createForumPost).toHaveBeenCalledWith({
      channelId: "channel-789",
      title: "#42 Test Issue",
      content:
        "Issue body content\n\n[View on GitHub](https://github.com/owner/repo/issues/42)",
    })
    expect(deps.repository.createIssueMap).toHaveBeenCalledWith({
      githubIssueId: 100,
      githubIssueNumber: 42,
      discordThreadId: "thread-123",
      discordFirstMessageId: "msg-456",
      repo: "owner/repo",
    })
    expect(deps.repository.recordEvent).toHaveBeenCalledWith({
      idempotencyKey: "github:delivery-uuid-1",
      source: "github",
      eventType: "issues.opened",
      status: "success",
    })
  })

  it("skips processing when event was already processed (idempotency)", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.hasProcessedEvent).mockResolvedValue(true)

    await syncIssueOpened(baseParams, deps)

    expect(deps.discord.createForumPost).not.toHaveBeenCalled()
    expect(deps.repository.createIssueMap).not.toHaveBeenCalled()
    expect(deps.repository.recordEvent).not.toHaveBeenCalled()
  })

  it("skips processing when issue map already exists (duplicate)", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue({
      id: 1,
      githubIssueId: 100,
      githubIssueNumber: 42,
      discordThreadId: "existing-thread",
      discordFirstMessageId: "existing-msg",
      repo: "owner/repo",
      createdAt: "2026-01-01",
      syncedAt: "2026-01-01",
    })

    await syncIssueOpened(baseParams, deps)

    expect(deps.discord.createForumPost).not.toHaveBeenCalled()
    expect(deps.repository.createIssueMap).not.toHaveBeenCalled()
    expect(deps.repository.recordEvent).not.toHaveBeenCalled()
  })

  it("throws when Discord API fails (no event_log recorded)", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.discord.createForumPost).mockRejectedValue(
      new Error("Discord API error 500: Internal Server Error")
    )

    await expect(syncIssueOpened(baseParams, deps)).rejects.toThrow(
      "Discord API error 500"
    )

    expect(deps.repository.createIssueMap).not.toHaveBeenCalled()
    expect(deps.repository.recordEvent).not.toHaveBeenCalled()
  })

  it("handles null body", async () => {
    const deps = createMockDeps()
    const params = { ...baseParams, body: null }

    await syncIssueOpened(params, deps)

    expect(deps.discord.createForumPost).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "[View on GitHub](https://github.com/owner/repo/issues/42)",
      })
    )
  })
})

describe("formatForumPostTitle", () => {
  it("formats title with issue number prefix", () => {
    expect(formatForumPostTitle(42, "Test Issue")).toBe("#42 Test Issue")
  })

  it("truncates long titles to 100 characters", () => {
    const longTitle = "A".repeat(200)
    const result = formatForumPostTitle(1, longTitle)
    expect(result.length).toBe(100)
    expect(result).toMatch(TRUNCATED_TITLE_PATTERN)
  })
})

describe("formatForumPostContent", () => {
  it("appends GitHub link to body", () => {
    const result = formatForumPostContent("Hello", "https://github.com/x")
    expect(result).toBe("Hello\n\n[View on GitHub](https://github.com/x)")
  })

  it("returns only link when body is null", () => {
    const result = formatForumPostContent(null, "https://github.com/x")
    expect(result).toBe("[View on GitHub](https://github.com/x)")
  })

  it("truncates body exceeding 3900 characters", () => {
    const longBody = "B".repeat(4000)
    const result = formatForumPostContent(longBody, "https://github.com/x")
    expect(result).toContain("B".repeat(3900))
    expect(result).toContain("…")
    expect(result).toContain("[View on GitHub](https://github.com/x)")
    expect(result).not.toContain("B".repeat(3901))
  })
})
