import type { Requirement, SearchResult } from '../types/requirement.js'
import { BaseAdapter, type GetRequirementParams, type SearchRequirementsParams } from './base.js'
import { authFetch } from '../utils/http.js'
import {
  mapGitHubState,
  mapGitHubLabelsToType,
  mapGitHubLabelsToPriority,
} from '../utils/map-status.js'

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: string
  labels: Array<{ name: string }>
  user: { login: string } | null
  assignee: { login: string } | null
  created_at: string
  updated_at: string
  pull_request?: unknown // present if this is a PR
  [key: string]: unknown
}

interface GitHubSearchResponse {
  total_count: number
  items: GitHubIssue[]
}

function getOwnerRepo(options?: Record<string, unknown>): { owner: string; repo: string } {
  const owner = options?.owner as string | undefined
  const repo = options?.repo as string | undefined
  if (!owner || !repo) {
    throw new Error('GitHub adapter requires "owner" and "repo" in source options')
  }
  return { owner, repo }
}

function toRequirement(issue: GitHubIssue, source: { owner: string; repo: string }): Requirement {
  const labelNames = issue.labels.map(l => l.name)
  return {
    id: `${source.owner}/${source.repo}#${issue.number}`,
    source: 'github',
    title: issue.title,
    description: issue.body ?? '',
    status: mapGitHubState(issue.state),
    priority: mapGitHubLabelsToPriority(labelNames),
    type: mapGitHubLabelsToType(labelNames),
    labels: labelNames,
    reporter: issue.user?.login ?? '',
    assignee: issue.assignee?.login ?? null,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    dueDate: null, // GitHub issues don't have due dates natively
    attachments: [], // GitHub issues use inline markdown images
    raw: issue as unknown as Record<string, unknown>,
  }
}

export class GitHubAdapter extends BaseAdapter {
  async getRequirement(params: GetRequirementParams): Promise<Requirement> {
    const { owner, repo } = getOwnerRepo(this.config.options)

    // Support both "owner/repo#123" format and plain number
    let issueNumber = params.id
    if (params.id.includes('#')) {
      issueNumber = params.id.split('#').pop()!
    }

    const data = await authFetch<GitHubIssue>(
      this.config,
      this.resolvedAuth,
      { path: `/repos/${owner}/${repo}/issues/${issueNumber}` },
    )

    if (data.pull_request) {
      throw new Error(`#${issueNumber} is a pull request, not an issue`)
    }

    return toRequirement(data, { owner, repo })
  }

  async searchRequirements(params: SearchRequirementsParams): Promise<SearchResult> {
    const { owner, repo } = getOwnerRepo(this.config.options)
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20

    const q = `${params.query} repo:${owner}/${repo} is:issue`

    const data = await authFetch<GitHubSearchResponse>(
      this.config,
      this.resolvedAuth,
      {
        path: '/search/issues',
        params: {
          q,
          page: String(page),
          per_page: String(pageSize),
          sort: 'updated',
          order: 'desc',
        },
      },
    )

    const issues = (data.items ?? []).filter(i => !i.pull_request)

    return {
      items: issues.map(i => toRequirement(i, { owner, repo })),
      total: data.total_count ?? 0,
      page,
      pageSize,
    }
  }
}
