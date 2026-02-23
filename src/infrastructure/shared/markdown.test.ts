import { describe, expect, it } from "vitest"
import { toDiscordMarkdown } from "./markdown"

const REPO = "owner/repo"

describe("toDiscordMarkdown", () => {
  it("returns empty string for null input", () => {
    expect(toDiscordMarkdown(null, REPO)).toBe("")
  })

  it("returns input as-is for plain text", () => {
    expect(toDiscordMarkdown("Hello world", REPO)).toBe("Hello world")
  })

  // Code block protection
  it("preserves code blocks during transformation", () => {
    const input = "```js\n@user #123\n```"
    const result = toDiscordMarkdown(input, REPO)
    // Code block content should NOT be transformed
    expect(result).toContain("@user #123")
    expect(result).not.toContain("`@user`")
  })

  it("preserves inline code during transformation", () => {
    const input = "Use `@user` and `#123` in code"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("`@user`")
    expect(result).toContain("`#123`")
  })

  // HTML processing
  it("converts <details><summary> to bold", () => {
    const input = "<details><summary>Click me</summary>Hidden content</details>"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("**Click me**")
    expect(result).toContain("Hidden content")
  })

  it("converts <br> to newline", () => {
    const input = "Line 1<br>Line 2<br/>Line 3"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toBe("Line 1\nLine 2\nLine 3")
  })

  it("strips HTML tags", () => {
    const input = "<div>Hello <b>World</b></div>"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toBe("Hello World")
  })

  // Markdown syntax
  it("converts __text__ to **text**", () => {
    const input = "__bold text__"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toBe("**bold text**")
  })

  it("converts images to links with emoji", () => {
    const input = "![screenshot](https://example.com/img.png)"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toBe("[\u{1F5BC} screenshot](https://example.com/img.png)")
  })

  it("converts h4-h6 to bold", () => {
    expect(toDiscordMarkdown("#### Heading 4", REPO)).toBe("**Heading 4**")
    expect(toDiscordMarkdown("##### Heading 5", REPO)).toBe("**Heading 5**")
    expect(toDiscordMarkdown("###### Heading 6", REPO)).toBe("**Heading 6**")
  })

  // Task lists
  it("converts task lists", () => {
    const input = "- [ ] unchecked\n- [x] checked"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("\u2610 unchecked")
    expect(result).toContain("\u2611 checked")
  })

  // GitHub Alerts
  it("converts GitHub alerts", () => {
    const input = "> [!NOTE]\n> This is a note"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("> **\u{1F4DD} Note**")
    expect(result).toContain("> This is a note")
  })

  it("converts all alert types", () => {
    for (const type of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
      const input = `> [!${type}]`
      const result = toDiscordMarkdown(input, REPO)
      expect(result).toContain("> **")
    }
  })

  // Tables
  it("converts tables to code blocks", () => {
    const input = "| A | B |\n|---|---|\n| 1 | 2 |"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("```")
    expect(result).toContain("| A | B |")
  })

  // GitHub references
  it("escapes @username to prevent Discord mention", () => {
    const input = "Thanks @octocat for the fix"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("`@octocat`")
  })

  it("converts #123 to issue link", () => {
    const input = "See #42 for details"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toContain("[#42](https://github.com/owner/repo/issues/42)")
  })

  // Truncation
  it("truncates long text with read more link", () => {
    const longText = "A".repeat(2500)
    const result = toDiscordMarkdown(
      longText,
      REPO,
      "https://github.com/owner/repo/issues/1"
    )
    expect(result.length).toBeLessThanOrEqual(2000)
    expect(result).toContain("**[Read more on GitHub]")
  })

  it("truncates without URL when no htmlUrl provided", () => {
    const longText = "A".repeat(2500)
    const result = toDiscordMarkdown(longText, REPO)
    expect(result.length).toBeLessThanOrEqual(2000)
    expect(result).toContain("...")
  })

  // Footnotes
  it("removes footnote references", () => {
    const input = "Text with footnote[^1] reference"
    const result = toDiscordMarkdown(input, REPO)
    expect(result).toBe("Text with footnote reference")
  })
})
