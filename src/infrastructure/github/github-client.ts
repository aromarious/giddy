import type { GitHubService } from "@/application/ports/github-service"
import { createGitHubJwt } from "../shared/jwt"

const GITHUB_API_BASE = "https://api.github.com"

export class GitHubClient implements GitHubService {
  private readonly appId: string
  private readonly privateKey: string
  private readonly installationId: string

  constructor(appId: string, privateKey: string, installationId: string) {
    this.appId = appId
    this.privateKey = privateKey
    this.installationId = installationId
  }

  private async getInstallationToken(): Promise<string> {
    const jwt = await createGitHubJwt(this.appId, this.privateKey)
    const res = await fetch(
      `${GITHUB_API_BASE}/app/installations/${this.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Giddy",
        },
      }
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GitHub API error ${res.status}: ${text}`)
    }
    const data = (await res.json()) as { token: string }
    return data.token
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    const token = await this.getInstallationToken()
    const res = await fetch(`${GITHUB_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "Giddy",
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GitHub API error ${res.status}: ${text}`)
    }
    return res
  }

  async createIssue(params: {
    repo: string
    title: string
    body: string
  }): Promise<{ issueId: number; issueNumber: number }> {
    const [owner, repo] = params.repo.split("/")
    const res = await this.request("POST", `/repos/${owner}/${repo}/issues`, {
      title: params.title,
      body: params.body,
    })
    const data = (await res.json()) as { id: number; number: number }
    return { issueId: data.id, issueNumber: data.number }
  }

  async createSubIssue(params: {
    repo: string
    parentIssueNumber: number
    title: string
    body: string
  }): Promise<{ issueId: number; issueNumber: number }> {
    // 1. Create issue normally
    const { issueId, issueNumber } = await this.createIssue({
      repo: params.repo,
      title: params.title,
      body: params.body,
    })
    // 2. Link as sub-issue to parent
    const [owner, repo] = params.repo.split("/")
    await this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${params.parentIssueNumber}/sub_issues`,
      { sub_issue_id: issueId }
    )
    return { issueId, issueNumber }
  }

  async createComment(params: {
    repo: string
    issueNumber: number
    body: string
  }): Promise<{ commentId: number }> {
    const [owner, repo] = params.repo.split("/")
    const res = await this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${params.issueNumber}/comments`,
      { body: params.body }
    )
    const data = (await res.json()) as { id: number }
    return { commentId: data.id }
  }
}
