import { DiscordHono } from "discord-hono"
import type { Env } from "@/types/env"
import {
  handleCommentCommand,
  handleCreateIssueCommand,
  handleSummarizeCommand,
} from "../../application/slash-commands"
import { ClaudeClient } from "../ai/claude-client"
import { D1Repository } from "../db/d1-repository"
import { GitHubClient } from "../github/github-client"
import { DiscordRestService } from "./discord-rest"

interface AppEnv {
  Bindings: Env
}

const GUILD_PUBLIC_THREAD = 11

function getOptionString(
  options:
    | { name: string; value?: string | number | boolean; type: number }[]
    | undefined,
  name: string
): string | undefined {
  const opt = options?.find((o) => o.name === name)
  return opt?.value != null ? String(opt.value) : undefined
}

function getForumThreadId(
  interaction: {
    channel_id?: string
    channel?: { type?: number; parent_id?: string }
  },
  forumChannelId: string
): string | undefined {
  const ch = interaction.channel
  if (ch?.type === GUILD_PUBLIC_THREAD && ch?.parent_id === forumChannelId) {
    return interaction.channel_id
  }
  return undefined
}

const app = new DiscordHono<AppEnv>({
  discordEnv: (env) => ({
    TOKEN: env.DISCORD_BOT_TOKEN,
    PUBLIC_KEY: env.DISCORD_PUBLIC_KEY,
    APPLICATION_ID: env.DISCORD_APPLICATION_ID,
  }),
})

app.command("comment", async (c) => {
  const env = c.env
  const channelId = getForumThreadId(
    c.interaction,
    env.DISCORD_FORUM_CHANNEL_ID
  )
  if (!channelId) {
    return c
      .flags("EPHEMERAL")
      .res("This command can only be used in a forum thread.")
  }

  const options = c.interaction.data.options as
    | { name: string; value?: string | number | boolean; type: number }[]
    | undefined
  const text = getOptionString(options, "text")
  if (!text) {
    return c.flags("EPHEMERAL").res("Please provide comment text.")
  }

  try {
    const deps = buildDeps(env)
    const result = await handleCommentCommand(
      { threadId: channelId, text, repo: env.GITHUB_REPO },
      deps
    )

    if (!result.ok) {
      return c.flags("EPHEMERAL").res(result.error)
    }

    return c.res("Comment posted to GitHub.")
  } catch (error) {
    console.error("Error in /comment:", error)
    return c
      .flags("EPHEMERAL")
      .res("An error occurred while posting the comment.")
  }
})

app.command("create-issue", async (c) => {
  const env = c.env
  const channelId = getForumThreadId(
    c.interaction,
    env.DISCORD_FORUM_CHANNEL_ID
  )
  if (!channelId) {
    return c
      .flags("EPHEMERAL")
      .res("This command can only be used in a forum thread.")
  }

  const options = c.interaction.data.options as
    | { name: string; value?: string | number | boolean; type: number }[]
    | undefined
  const title = getOptionString(options, "title")
  if (!title) {
    return c.flags("EPHEMERAL").res("Please provide an issue title.")
  }
  const body = getOptionString(options, "body")
  const relation = getOptionString(options, "relation") as
    | "sub"
    | "link"
    | undefined

  try {
    const deps = buildDeps(env)
    const result = await handleCreateIssueCommand(
      {
        threadId: channelId,
        title,
        body,
        relation,
        forumChannelId: env.DISCORD_FORUM_CHANNEL_ID,
        repo: env.GITHUB_REPO,
      },
      deps
    )

    if (!result.ok) {
      return c.flags("EPHEMERAL").res(result.error)
    }

    return c.res(
      `GitHub Issue [#${result.issueNumber}](${result.htmlUrl}) created.`
    )
  } catch (error) {
    console.error("Error in /create-issue:", error)
    return c
      .flags("EPHEMERAL")
      .res("An error occurred while creating the issue.")
  }
})

app.command("summarize", (c) => {
  const env = c.env
  const channelId = getForumThreadId(
    c.interaction,
    env.DISCORD_FORUM_CHANNEL_ID
  )
  if (!channelId) {
    return c
      .flags("EPHEMERAL")
      .res("This command can only be used in a forum thread.")
  }

  return c.resDefer(async (c) => {
    try {
      const deps = buildDeps(env)
      const result = await handleSummarizeCommand(
        { threadId: channelId, repo: env.GITHUB_REPO },
        deps
      )

      if (!result.ok) {
        await c.followup(result.error)
        return
      }

      await c.followup(
        `Summary posted to GitHub. Preview:\n\n${result.summary.slice(0, 500)}${result.summary.length > 500 ? "..." : ""}`
      )
    } catch (error) {
      console.error("Error in /summarize:", error)
      await c.followup("An error occurred while generating the summary.")
    }
  })
})

function buildDeps(env: Env) {
  return {
    discord: new DiscordRestService(env.DISCORD_BOT_TOKEN),
    repository: new D1Repository(env.DB),
    github: new GitHubClient(
      env.GITHUB_APP_ID,
      env.GITHUB_APP_PRIVATE_KEY,
      env.GITHUB_INSTALLATION_ID
    ),
    ai: new ClaudeClient(env.ANTHROPIC_API_KEY, env.AI_MODEL),
    botUserId: env.DISCORD_APPLICATION_ID,
  }
}

export { app as discordApp }
