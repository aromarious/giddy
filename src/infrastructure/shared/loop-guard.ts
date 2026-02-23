/**
 * Check if a GitHub webhook event was triggered by the bot's own GitHub App.
 * Used to prevent echo loops (bot action → webhook → bot action → ...).
 */
export function isGitHubBotAction(
  payload: {
    sender?: { type?: string; id?: number }
    installation?: { id?: number }
  },
  appUserId?: number
): boolean {
  const sender = payload.sender
  if (!sender) {
    return false
  }
  // GitHub App bot accounts have type "Bot"
  if (sender.type === "Bot") {
    return true
  }
  // Additional check: if we know the App's user ID, match directly
  if (appUserId && sender.id === appUserId) {
    return true
  }
  return false
}

/**
 * Check if a Discord message was sent by the bot itself.
 * Used to filter bot messages from /summarize context.
 */
export function isBotMessage(
  message: { author: { id: string; bot?: boolean } },
  botUserId: string
): boolean {
  return message.author.bot === true || message.author.id === botUserId
}
