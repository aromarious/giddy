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

  async createForumPost(
    params: CreateForumPostParams
  ): Promise<CreateForumPostResult> {
    const res = await fetch(
      `${DISCORD_API_BASE}/channels/${params.channelId}/threads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: params.title,
          message: { content: params.content },
        }),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Discord API error ${res.status}: ${text}`)
    }

    const data = (await res.json()) as {
      id: string
      last_message_id: string
    }
    return {
      threadId: data.id,
      messageId: data.last_message_id,
    }
  }

  editForumPost(
    _threadId: string,
    _title: string,
    _content: string
  ): Promise<void> {
    throw new Error("Not implemented")
  }

  postMessage(_threadId: string, _content: string): Promise<string> {
    throw new Error("Not implemented")
  }

  editMessage(
    _channelId: string,
    _messageId: string,
    _content: string
  ): Promise<void> {
    throw new Error("Not implemented")
  }

  deleteMessage(_channelId: string, _messageId: string): Promise<void> {
    throw new Error("Not implemented")
  }

  archiveThread(_threadId: string): Promise<void> {
    throw new Error("Not implemented")
  }

  unarchiveThread(_threadId: string): Promise<void> {
    throw new Error("Not implemented")
  }

  getMessages(
    _threadId: string
  ): Promise<{ id: string; content: string; author: string }[]> {
    throw new Error("Not implemented")
  }
}
