export interface AiService {
  summarize(text: string): Promise<string>
}
