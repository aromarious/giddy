import Anthropic from "@anthropic-ai/sdk"
import type { AiService } from "@/application/ports/ai-service"

export class ClaudeClient implements AiService {
  private readonly client: Anthropic
  private readonly model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async summarize(text: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system:
        "You are a concise technical summarizer. Given a Discord thread discussion about a GitHub issue, produce a summary in GitHub-flavored Markdown. Include:\n- Key decisions made\n- Open questions or unresolved items\n- Action items if any\nKeep the summary concise and factual. Write in the same language as the thread.",
      messages: [{ role: "user", content: text }],
    })
    const textBlock = response.content.find((block) => block.type === "text")
    return textBlock?.text ?? ""
  }
}
