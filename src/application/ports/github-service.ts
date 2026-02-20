export interface GitHubService {
  createIssue(params: {
    repo: string
    title: string
    body: string
  }): Promise<{ issueId: number; issueNumber: number }>
  createComment(params: {
    repo: string
    issueNumber: number
    body: string
  }): Promise<{ commentId: number }>
}
