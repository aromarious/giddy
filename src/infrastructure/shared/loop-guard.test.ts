import { describe, expect, it } from "vitest"
import { isBotMessage, isGitHubBotAction } from "./loop-guard"

describe("isGitHubBotAction", () => {
  it("returns true when sender type is Bot", () => {
    expect(isGitHubBotAction({ sender: { type: "Bot", id: 123 } })).toBe(true)
  })

  it("returns false when sender type is User", () => {
    expect(isGitHubBotAction({ sender: { type: "User", id: 456 } })).toBe(false)
  })

  it("returns false when no sender", () => {
    expect(isGitHubBotAction({})).toBe(false)
  })

  it("returns true when sender id matches appUserId", () => {
    expect(isGitHubBotAction({ sender: { type: "User", id: 789 } }, 789)).toBe(
      true
    )
  })

  it("returns false when sender id does not match appUserId", () => {
    expect(isGitHubBotAction({ sender: { type: "User", id: 789 } }, 999)).toBe(
      false
    )
  })
})

describe("isBotMessage", () => {
  it("returns true when author.bot is true", () => {
    expect(isBotMessage({ author: { id: "user-1", bot: true } }, "bot-1")).toBe(
      true
    )
  })

  it("returns true when author.id matches botUserId", () => {
    expect(isBotMessage({ author: { id: "bot-1" } }, "bot-1")).toBe(true)
  })

  it("returns false for normal user message", () => {
    expect(isBotMessage({ author: { id: "user-1" } }, "bot-1")).toBe(false)
  })

  it("returns false when bot flag is explicitly false", () => {
    expect(
      isBotMessage({ author: { id: "user-1", bot: false } }, "bot-1")
    ).toBe(false)
  })
})
