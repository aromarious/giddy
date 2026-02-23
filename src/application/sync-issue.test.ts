import { describe, expect, it, vi } from "vitest"
import type { DiscordService } from "@/application/ports/discord-service"
import type { Repository } from "@/application/ports/repository"
import {
  formatForumPostContent,
  formatForumPostTitle,
  syncIssueClosed,
  syncIssueCommentCreated,
  syncIssueCommentDeleted,
  syncIssueCommentEdited,
  syncIssueEdited,
  syncIssueOpened,
  syncIssueReopened,
} from "./sync-issue"

const TRUNCATED_TITLE_PATTERN = /^#1 A+…$/

const mockIssueMap = {
  id: 1,
  githubIssueId: 100,
  githubIssueNumber: 42,
  discordThreadId: "thread-123",
  discordFirstMessageId: "msg-456",
  repo: "owner/repo",
  createdAt: "2026-01-01",
  syncedAt: "2026-01-01",
}

function createMockDeps() {
  const discord: DiscordService = {
    createForumPost: vi.fn().mockResolvedValue({
      threadId: "thread-123",
      messageId: "msg-456",
    }),
    editForumPost: vi.fn().mockResolvedValue(undefined),
    postMessage: vi.fn().mockResolvedValue("discord-msg-789"),
    editMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    archiveThread: vi.fn().mockResolvedValue(undefined),
    unarchiveThread: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
  }

  const repository: Repository = {
    createIssueMap: vi.fn().mockResolvedValue(mockIssueMap),
    findIssueMapByGithubIssueId: vi.fn().mockResolvedValue(undefined),
    findIssueMapByDiscordThreadId: vi.fn().mockResolvedValue(undefined),
    updateIssueMapSyncedAt: vi.fn().mockResolvedValue(undefined),
    createCommentMap: vi.fn().mockResolvedValue({
      id: 1,
      githubCommentId: 200,
      discordMessageId: "discord-msg-789",
      issueMapId: 1,
    }),
    findCommentMapByGithubCommentId: vi.fn().mockResolvedValue(undefined),
    findCommentMapByDiscordMessageId: vi.fn().mockResolvedValue(undefined),
    deleteCommentMap: vi.fn().mockResolvedValue(undefined),
    createSummaryLog: vi.fn(),
    findLatestSummaryLog: vi.fn(),
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

// =============================================================
// syncIssueOpened
// =============================================================

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
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

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

// =============================================================
// syncIssueEdited
// =============================================================

describe("syncIssueEdited", () => {
  it("updates title and content when both changed", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueEdited(
      {
        deliveryId: "d-edit-1",
        issueId: 100,
        issueNumber: 42,
        title: "Updated Title",
        body: "Updated body",
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42",
        changes: {
          title: { from: "Old Title" },
          body: { from: "Old body" },
        },
      },
      deps
    )

    expect(deps.discord.editForumPost).toHaveBeenCalledWith(
      "thread-123",
      "msg-456",
      "#42 Updated Title",
      "Updated body\n\n[View on GitHub](https://github.com/owner/repo/issues/42)"
    )
    expect(deps.repository.updateIssueMapSyncedAt).toHaveBeenCalledWith(1)
    expect(deps.repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "issues.edited" })
    )
  })

  it("updates only title when body unchanged", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueEdited(
      {
        deliveryId: "d-edit-2",
        issueId: 100,
        issueNumber: 42,
        title: "New Title",
        body: "Same body",
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42",
        changes: { title: { from: "Old Title" } },
      },
      deps
    )

    expect(deps.discord.editForumPost).toHaveBeenCalledWith(
      "thread-123",
      "msg-456",
      "#42 New Title",
      undefined
    )
  })

  it("skips when no issue map exists", async () => {
    const deps = createMockDeps()

    await syncIssueEdited(
      {
        deliveryId: "d-edit-3",
        issueId: 999,
        issueNumber: 99,
        title: "X",
        body: "X",
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/99",
        changes: { title: { from: "Y" } },
      },
      deps
    )

    expect(deps.discord.editForumPost).not.toHaveBeenCalled()
    expect(deps.repository.recordEvent).not.toHaveBeenCalled()
  })

  it("skips when already processed (idempotency)", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.hasProcessedEvent).mockResolvedValue(true)

    await syncIssueEdited(
      {
        deliveryId: "d-edit-4",
        issueId: 100,
        issueNumber: 42,
        title: "T",
        body: "B",
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42",
        changes: { title: { from: "Old" } },
      },
      deps
    )

    expect(deps.discord.editForumPost).not.toHaveBeenCalled()
  })
})

// =============================================================
// syncIssueClosed
// =============================================================

describe("syncIssueClosed", () => {
  it("posts notification and archives thread", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueClosed(
      {
        deliveryId: "d-close-1",
        issueId: 100,
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42",
      },
      deps
    )

    expect(deps.discord.postMessage).toHaveBeenCalledWith(
      "thread-123",
      expect.stringContaining("Issue was closed")
    )
    expect(deps.discord.archiveThread).toHaveBeenCalledWith("thread-123")
    expect(deps.repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "issues.closed" })
    )
  })

  it("skips when no issue map exists", async () => {
    const deps = createMockDeps()

    await syncIssueClosed(
      {
        deliveryId: "d-close-2",
        issueId: 999,
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/999",
      },
      deps
    )

    expect(deps.discord.postMessage).not.toHaveBeenCalled()
    expect(deps.discord.archiveThread).not.toHaveBeenCalled()
  })

  it("skips when already processed (idempotency)", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.hasProcessedEvent).mockResolvedValue(true)

    await syncIssueClosed(
      {
        deliveryId: "d-close-3",
        issueId: 100,
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42",
      },
      deps
    )

    expect(deps.discord.postMessage).not.toHaveBeenCalled()
  })
})

// =============================================================
// syncIssueReopened
// =============================================================

describe("syncIssueReopened", () => {
  it("unarchives thread and posts notification", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueReopened(
      {
        deliveryId: "d-reopen-1",
        issueId: 100,
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42",
      },
      deps
    )

    expect(deps.discord.unarchiveThread).toHaveBeenCalledWith("thread-123")
    expect(deps.discord.postMessage).toHaveBeenCalledWith(
      "thread-123",
      expect.stringContaining("Issue was reopened")
    )
    expect(deps.repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "issues.reopened" })
    )
  })

  it("skips when no issue map exists", async () => {
    const deps = createMockDeps()

    await syncIssueReopened(
      {
        deliveryId: "d-reopen-2",
        issueId: 999,
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/999",
      },
      deps
    )

    expect(deps.discord.unarchiveThread).not.toHaveBeenCalled()
  })
})

// =============================================================
// syncIssueCommentCreated
// =============================================================

describe("syncIssueCommentCreated", () => {
  it("posts message to Discord and records comment map", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueCommentCreated(
      {
        deliveryId: "d-comment-1",
        issueId: 100,
        repo: "owner/repo",
        commentId: 200,
        commentBody: "Hello world",
        commentUser: "octocat",
        htmlUrl: "https://github.com/owner/repo/issues/42#issuecomment-200",
      },
      deps
    )

    expect(deps.discord.postMessage).toHaveBeenCalledWith(
      "thread-123",
      expect.stringContaining("**octocat** commented:")
    )
    expect(deps.repository.createCommentMap).toHaveBeenCalledWith({
      githubCommentId: 200,
      discordMessageId: "discord-msg-789",
      issueMapId: 1,
    })
    expect(deps.repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "issue_comment.created" })
    )
  })

  it("skips when no issue map exists", async () => {
    const deps = createMockDeps()

    await syncIssueCommentCreated(
      {
        deliveryId: "d-comment-2",
        issueId: 999,
        repo: "owner/repo",
        commentId: 201,
        commentBody: "Test",
        commentUser: "user",
        htmlUrl: "https://github.com/owner/repo/issues/999#issuecomment-201",
      },
      deps
    )

    expect(deps.discord.postMessage).not.toHaveBeenCalled()
    expect(deps.repository.createCommentMap).not.toHaveBeenCalled()
  })

  it("skips when already processed (idempotency)", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.hasProcessedEvent).mockResolvedValue(true)

    await syncIssueCommentCreated(
      {
        deliveryId: "d-comment-3",
        issueId: 100,
        repo: "owner/repo",
        commentId: 202,
        commentBody: "Test",
        commentUser: "user",
        htmlUrl: "https://github.com/owner/repo/issues/42#issuecomment-202",
      },
      deps
    )

    expect(deps.discord.postMessage).not.toHaveBeenCalled()
  })
})

// =============================================================
// syncIssueCommentEdited
// =============================================================

describe("syncIssueCommentEdited", () => {
  it("edits Discord message when comment map exists", async () => {
    const deps = createMockDeps()
    vi.mocked(
      deps.repository.findCommentMapByGithubCommentId
    ).mockResolvedValue({
      id: 1,
      githubCommentId: 200,
      discordMessageId: "discord-msg-789",
      issueMapId: 1,
    })
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueCommentEdited(
      {
        deliveryId: "d-cedit-1",
        issueId: 100,
        commentId: 200,
        commentBody: "Updated comment",
        commentUser: "octocat",
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42#issuecomment-200",
      },
      deps
    )

    expect(deps.discord.editMessage).toHaveBeenCalledWith(
      "thread-123",
      "discord-msg-789",
      expect.stringContaining("Updated comment")
    )
    expect(deps.repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "issue_comment.edited" })
    )
  })

  it("skips when comment map not found", async () => {
    const deps = createMockDeps()

    await syncIssueCommentEdited(
      {
        deliveryId: "d-cedit-2",
        issueId: 100,
        commentId: 999,
        commentBody: "X",
        commentUser: "user",
        repo: "owner/repo",
        htmlUrl: "https://github.com/owner/repo/issues/42#issuecomment-999",
      },
      deps
    )

    expect(deps.discord.editMessage).not.toHaveBeenCalled()
    expect(deps.repository.recordEvent).not.toHaveBeenCalled()
  })
})

// =============================================================
// syncIssueCommentDeleted
// =============================================================

describe("syncIssueCommentDeleted", () => {
  it("deletes Discord message and comment map", async () => {
    const deps = createMockDeps()
    vi.mocked(
      deps.repository.findCommentMapByGithubCommentId
    ).mockResolvedValue({
      id: 1,
      githubCommentId: 200,
      discordMessageId: "discord-msg-789",
      issueMapId: 1,
    })
    vi.mocked(deps.repository.findIssueMapByGithubIssueId).mockResolvedValue(
      mockIssueMap
    )

    await syncIssueCommentDeleted(
      {
        deliveryId: "d-cdel-1",
        commentId: 200,
        issueId: 100,
        repo: "owner/repo",
      },
      deps
    )

    expect(deps.discord.deleteMessage).toHaveBeenCalledWith(
      "thread-123",
      "discord-msg-789"
    )
    expect(deps.repository.deleteCommentMap).toHaveBeenCalledWith(200)
    expect(deps.repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "issue_comment.deleted" })
    )
  })

  it("skips when comment map not found", async () => {
    const deps = createMockDeps()

    await syncIssueCommentDeleted(
      {
        deliveryId: "d-cdel-2",
        commentId: 999,
        issueId: 100,
        repo: "owner/repo",
      },
      deps
    )

    expect(deps.discord.deleteMessage).not.toHaveBeenCalled()
    expect(deps.repository.deleteCommentMap).not.toHaveBeenCalled()
  })
})

// =============================================================
// Format helpers
// =============================================================

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
