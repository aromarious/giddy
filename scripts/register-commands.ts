import { Command, Option, register } from "discord-hono"
import { env } from "./env"

const commands = [
  new Command(
    "summarize",
    "スレッドの会話を AI で要約し、GitHub Issue にコメントとして投稿します"
  ),
  new Command("comment", "GitHub Issue にコメントを投稿します").options(
    new Option("text", "コメント内容").required()
  ),
  new Command(
    "create-issue",
    "この Discord スレッドから GitHub Issue を新規作成します"
  ).options(new Option("title", "Issue タイトル").required()),
]

const result = await register(
  commands,
  env.DISCORD_APPLICATION_ID,
  env.DISCORD_BOT_TOKEN,
  env.DISCORD_GUILD_ID
)
console.log(result)
