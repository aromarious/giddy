import type {
  CreateForumPostParams,
  CreateForumPostResult,
  DiscordService,
} from "@/application/ports/discord-service"

const DISCORD_API_BASE = "https://discord.com/api/v10"

export class DiscordRestService implements DiscordService {
  private readonly botToken: string

  constructor(botToken: string) {
    this.botToken = botToken
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bot ${this.botToken}`,
      "Content-Type": "application/json",
    }
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    const res = await fetch(`${DISCORD_API_BASE}${path}`, {
      method,
      headers: this.headers(),
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Discord API error ${res.status}: ${text}`)
    }
    return res
  }

  async createForumPost(
    params: CreateForumPostParams
  ): Promise<CreateForumPostResult> {
    const res = await this.request(
      "POST",
      `/channels/${params.channelId}/threads`,
      {
        name: params.title,
        message: { content: params.content },
      }
    )
    const data = (await res.json()) as {
      id: string
      last_message_id: string
    }
    return {
      threadId: data.id,
      messageId: data.last_message_id,
    }
  }

  async editForumPost(
    threadId: string,
    messageId: string,
    title?: string,
    content?: string
  ): Promise<void> {
    if (title !== undefined) {
      await this.request("PATCH", `/channels/${threadId}`, { name: title })
    }
    if (content !== undefined) {
      await this.request(
        "PATCH",
        `/channels/${threadId}/messages/${messageId}`,
        { content }
      )
    }
  }

  async postMessage(threadId: string, content: string): Promise<string> {
    const res = await this.request("POST", `/channels/${threadId}/messages`, {
      content,
    })
    const data = (await res.json()) as { id: string }
    return data.id
  }

  async editMessage(
    channelId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    await this.request(
      "PATCH",
      `/channels/${channelId}/messages/${messageId}`,
      { content }
    )
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.request("DELETE", `/channels/${channelId}/messages/${messageId}`)
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.request("PATCH", `/channels/${threadId}`, { archived: true })
  }

  async unarchiveThread(threadId: string): Promise<void> {
    await this.request("PATCH", `/channels/${threadId}`, { archived: false })
  }

  async getMessages(
    threadId: string,
    after?: string,
    limit = 100
  ): Promise<
    { id: string; content: string; author: { id: string; bot?: boolean } }[]
  > {
    const params = new URLSearchParams({ limit: String(limit) })
    if (after) {
      params.set("after", after)
    }
    const res = await this.request(
      "GET",
      `/channels/${threadId}/messages?${params.toString()}`
    )
    return (await res.json()) as {
      id: string
      content: string
      author: { id: string; bot?: boolean }
    }[]
  }
}
