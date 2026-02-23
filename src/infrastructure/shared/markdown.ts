const DISCORD_MAX_LENGTH = 2000

// Placeholder sentinels using Unicode Private Use Area to avoid regex lint warnings
const PH_START = "\uE000"
const PH_END = "\uE001"

const GITHUB_ALERT_MAP: Record<string, string> = {
  NOTE: "\u{1F4DD} Note",
  TIP: "\u{1F4A1} Tip",
  IMPORTANT: "\u{2757} Important",
  WARNING: "\u{26A0}\u{FE0F} Warning",
  CAUTION: "\u{1F6D1} Caution",
}

/**
 * Convert GitHub-flavored Markdown to Discord-compatible Markdown.
 */
export function toDiscordMarkdown(
  githubMd: string | null,
  repo: string,
  htmlUrl?: string
): string {
  if (!githubMd) {
    return ""
  }

  let text = githubMd

  // 1. Protect code blocks and inline code with placeholders
  const codeBlocks: string[] = []
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `${PH_START}CODEBLOCK${codeBlocks.length - 1}${PH_END}`
  })
  const inlineCodes: string[] = []
  text = text.replace(/`[^`\n]+`/g, (match) => {
    inlineCodes.push(match)
    return `${PH_START}INLINE${inlineCodes.length - 1}${PH_END}`
  })

  // 2. HTML processing
  // <details><summary>Title</summary>Content</details> → **Title**\nContent
  text = text.replace(
    /<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
    (_match, summary: string, content: string) =>
      `**${summary.trim()}**\n${content.trim()}`
  )
  // <br> → newline
  text = text.replace(/<br\s*\/?>/gi, "\n")
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "")

  // 3. Markdown syntax adjustments
  // __text__ → **text** (underscore bold → asterisk bold)
  text = text.replace(/__([^_]+)__/g, "**$1**")
  // ![alt](url) → [🖼 alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "[\u{1F5BC} $1]($2)")
  // #### to ###### headings → bold
  text = text.replace(/^#{4,6}\s+(.+)$/gm, "**$1**")

  // 4. Task lists
  text = text.replace(/^(\s*)- \[ \]/gm, "$1\u2610")
  text = text.replace(/^(\s*)- \[x\]/gm, "$1\u2611")

  // 5. GitHub Alerts
  text = text.replace(
    /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gm,
    (_match, type: string) => {
      const label = GITHUB_ALERT_MAP[type] ?? type
      return `> **${label}**`
    }
  )

  // 6. Tables → code blocks (simple approach)
  text = text.replace(
    /^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,
    (_match, header: string, _separator: string, body: string) => {
      const rows = [header, ...body.trim().split("\n")]
      return `\`\`\`\n${rows.join("\n")}\n\`\`\``
    }
  )

  // 7. Footnotes
  // Remove footnote references [^1]
  text = text.replace(/\[\^(\d+)\]/g, "")
  // Convert footnote definitions to blockquotes
  text = text.replace(
    /^\[\^(\d+)\]:\s*(.+)$/gm,
    (_match, num: string, content: string) => `> [${num}] ${content}`
  )

  // 8. GitHub references
  // @username → `@username` (prevent Discord mention)
  text = text.replace(
    /(?<![`\w])@([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})/g,
    "`@$1`"
  )
  // #123 → [#123](url) (issue/PR reference)
  text = text.replace(
    /(?<![`\w])#(\d+)/g,
    `[#$1](https://github.com/${repo}/issues/$1)`
  )

  // 9. Truncate if over Discord limit
  if (text.length > DISCORD_MAX_LENGTH) {
    const readMore = htmlUrl
      ? `... **[Read more on GitHub](${htmlUrl})**`
      : "..."
    const maxContent = DISCORD_MAX_LENGTH - readMore.length
    text = text.slice(0, maxContent) + readMore
  }

  // 10. Restore code blocks and inline code
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`${PH_START}CODEBLOCK${i}${PH_END}`, codeBlocks[i])
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    text = text.replace(`${PH_START}INLINE${i}${PH_END}`, inlineCodes[i])
  }

  return text
}
