import { describe, expect, it, vi } from "vitest"
import type { AiService } from "@/application/ports/ai-service"
import type { DiscordService } from "@/application/ports/discord-service"
import type { GitHubService } from "@/application/ports/github-service"
import type { Repository } from "@/application/ports/repository"
import {
  handleCommentCommand,
  handleCreateIssueCommand,
  handleSummarizeCommand,
} from "./slash-commands"

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
    createSummaryLog: vi.fn().mockResolvedValue({
      id: 1,
      issueMapId: 1,
      lastMessageId: "msg-3",
      githubCommentId: 300,
      messageCount: 2,
      summarizedAt: "2026-01-01",
    }),
    findLatestSummaryLog: vi.fn().mockResolvedValue(undefined),
    hasProcessedEvent: vi.fn().mockResolvedValue(false),
    recordEvent: vi.fn().mockResolvedValue(undefined),
  }

  const github: GitHubService = {
    createIssue: vi.fn().mockResolvedValue({
      issueId: 500,
      issueNumber: 99,
    }),
    createSubIssue: vi.fn().mockResolvedValue({
      issueId: 600,
      issueNumber: 101,
    }),
    createComment: vi.fn().mockResolvedValue({ commentId: 300 }),
  }

  const ai: AiService = {
    summarize: vi.fn().mockResolvedValue("Summary of the thread discussion."),
  }

  return { discord, repository, github, ai, botUserId: "bot-user-1" }
}

// --- /comment ---

describe("handleCommentCommand", () => {
  it("posts a comment to github when issue map exists", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )

    const result = await handleCommentCommand(
      {
        threadId: "thread-123",
        text: "Hello from Discord",
        repo: "owner/repo",
      },
      deps
    )

    expect(result).toEqual({ ok: true })
    expect(deps.github.createComment).toHaveBeenCalledWith({
      repo: "owner/repo",
      issueNumber: 42,
      body: "Hello from Discord",
    })
  })

  it("returns error when no issue map found", async () => {
    const deps = createMockDeps()

    const result = await handleCommentCommand(
      { threadId: "thread-999", text: "test", repo: "owner/repo" },
      deps
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("not linked")
    }
    expect(deps.github.createComment).not.toHaveBeenCalled()
  })
})

// --- /create-issue ---

describe("handleCreateIssueCommand", () => {
  it("creates a github issue and a forum post", async () => {
    const deps = createMockDeps()

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-new",
        title: "Bug report",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.issueNumber).toBe(99)
      expect(result.htmlUrl).toContain("owner/repo/issues/99")
    }
    expect(deps.github.createIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      title: "Bug report",
      body: "Created from Discord thread.",
    })
    // Forum post should be created via createForumPostForIssue
    expect(deps.discord.createForumPost).toHaveBeenCalledWith({
      channelId: "forum-ch",
      title: "#99 Bug report",
      content: "[View on GitHub](https://github.com/owner/repo/issues/99)",
    })
    expect(deps.repository.createIssueMap).toHaveBeenCalledWith({
      githubIssueId: 500,
      githubIssueNumber: 99,
      discordThreadId: "thread-123",
      discordFirstMessageId: "msg-456",
      repo: "owner/repo",
    })
  })

  it("creates a new issue even from an already-linked thread", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-123",
        title: "Another issue",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    expect(deps.github.createIssue).toHaveBeenCalled()
    expect(deps.discord.createForumPost).toHaveBeenCalled()
  })

  it("creates a sub-issue when linked thread + relation:sub", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-123",
        title: "Sub task",
        relation: "sub",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.issueNumber).toBe(101)
    }
    expect(deps.github.createSubIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      parentIssueNumber: 42,
      title: "Sub task",
      body: "Created from Discord thread.",
    })
    expect(deps.github.createIssue).not.toHaveBeenCalled()
  })

  it("adds Related to body when linked thread + relation:link", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-123",
        title: "Related issue",
        relation: "link",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    expect(deps.github.createIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      title: "Related issue",
      body: "Created from Discord thread.\n\nRelated to #42",
    })
    expect(deps.github.createSubIssue).not.toHaveBeenCalled()
  })

  it("creates normal issue without Related when linked thread + no relation", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-123",
        title: "Independent issue",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    expect(deps.github.createIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      title: "Independent issue",
      body: "Created from Discord thread.",
    })
    expect(deps.github.createSubIssue).not.toHaveBeenCalled()
  })

  it("ignores relation when thread is not linked", async () => {
    const deps = createMockDeps()

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-new",
        title: "New issue",
        relation: "sub",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    expect(deps.github.createIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      title: "New issue",
      body: "Created from Discord thread.",
    })
    expect(deps.github.createSubIssue).not.toHaveBeenCalled()
  })

  it("uses custom body when provided", async () => {
    const deps = createMockDeps()

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-new",
        title: "With body",
        body: "Detailed description here",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    expect(deps.github.createIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      title: "With body",
      body: "Detailed description here",
    })
  })

  it("appends Related to custom body when relation:link", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )

    const result = await handleCreateIssueCommand(
      {
        threadId: "thread-123",
        title: "Custom + link",
        body: "My custom body",
        relation: "link",
        forumChannelId: "forum-ch",
        repo: "owner/repo",
      },
      deps
    )

    expect(result.ok).toBe(true)
    expect(deps.github.createIssue).toHaveBeenCalledWith({
      repo: "owner/repo",
      title: "Custom + link",
      body: "My custom body\n\nRelated to #42",
    })
  })
})

// --- /summarize ---

describe("handleSummarizeCommand", () => {
  it("summarizes thread messages and posts to github", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )
    vi.mocked(deps.discord.getMessages).mockResolvedValue([
      { id: "msg-1", content: "First message", author: { id: "user-1" } },
      {
        id: "msg-2",
        content: "Bot reply",
        author: { id: "bot-user-1", bot: true },
      },
      { id: "msg-3", content: "Second message", author: { id: "user-2" } },
    ])

    const result = await handleSummarizeCommand(
      { threadId: "thread-123", repo: "owner/repo" },
      deps
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toBe("Summary of the thread discussion.")
      expect(result.commentId).toBe(300)
    }

    // Should filter out bot messages
    expect(deps.ai.summarize).toHaveBeenCalledWith(
      "First message\n---\nSecond message"
    )

    // Should post to GitHub
    expect(deps.github.createComment).toHaveBeenCalledWith({
      repo: "owner/repo",
      issueNumber: 42,
      body: "## Discord Thread Summary\n\nSummary of the thread discussion.",
    })

    // Should record summary log
    expect(deps.repository.createSummaryLog).toHaveBeenCalledWith({
      issueMapId: 1,
      lastMessageId: "msg-3",
      githubCommentId: 300,
      messageCount: 2,
    })
  })

  it("returns error when no issue map found", async () => {
    const deps = createMockDeps()

    const result = await handleSummarizeCommand(
      { threadId: "thread-999", repo: "owner/repo" },
      deps
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("not linked")
    }
  })

  it("returns error when no human messages found", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )
    vi.mocked(deps.discord.getMessages).mockResolvedValue([
      {
        id: "msg-1",
        content: "Bot only",
        author: { id: "bot-user-1", bot: true },
      },
    ])

    const result = await handleSummarizeCommand(
      { threadId: "thread-123", repo: "owner/repo" },
      deps
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("No new messages")
    }
  })

  it("resumes from last summary position", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.repository.findIssueMapByDiscordThreadId).mockResolvedValue(
      mockIssueMap
    )
    vi.mocked(deps.repository.findLatestSummaryLog).mockResolvedValue({
      id: 1,
      issueMapId: 1,
      lastMessageId: "msg-prev",
      githubCommentId: 200,
      messageCount: 5,
      summarizedAt: "2026-01-01",
    })
    vi.mocked(deps.discord.getMessages).mockResolvedValue([
      { id: "msg-new", content: "New message", author: { id: "user-1" } },
    ])

    await handleSummarizeCommand(
      { threadId: "thread-123", repo: "owner/repo" },
      deps
    )

    // Should pass the after parameter from last summary
    expect(deps.discord.getMessages).toHaveBeenCalledWith(
      "thread-123",
      "msg-prev",
      100
    )
  })
})
