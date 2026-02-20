export interface CreateForumPostParams {
  channelId: string
  title: string
  content: string
}

export interface CreateForumPostResult {
  threadId: string
  messageId: string
}

export interface DiscordService {
  createForumPost(params: CreateForumPostParams): Promise<CreateForumPostResult>
  editForumPost(threadId: string, title: string, content: string): Promise<void>
  postMessage(threadId: string, content: string): Promise<string>
  editMessage(
    channelId: string,
    messageId: string,
    content: string
  ): Promise<void>
  deleteMessage(channelId: string, messageId: string): Promise<void>
  archiveThread(threadId: string): Promise<void>
  unarchiveThread(threadId: string): Promise<void>
  getMessages(
    threadId: string
  ): Promise<{ id: string; content: string; author: string }[]>
}
