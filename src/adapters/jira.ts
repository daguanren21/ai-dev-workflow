import type { Requirement, SearchResult } from '../types/requirement.js'
import { BaseAdapter, type GetRequirementParams, type SearchRequirementsParams } from './base.js'
import { authFetch } from '../utils/http.js'
import { mapJiraStatusCategory, mapJiraPriority, mapJiraType } from '../utils/map-status.js'

interface JiraIssue {
  key: string
  fields: {
    summary: string
    description: unknown // ADF format
    status: { name: string; statusCategory: { key: string } }
    priority: { name: string }
    issuetype: { name: string }
    labels: string[]
    reporter: { displayName: string } | null
    assignee: { displayName: string } | null
    created: string
    updated: string
    duedate: string | null
    attachment?: Array<{
      id: string
      filename: string
      content: string
      mimeType: string
      size: number
    }>
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface JiraSearchResponse {
  issues: JiraIssue[]
  total: number
  startAt: number
  maxResults: number
}

/**
 * Convert Atlassian Document Format (ADF) to plain text.
 * Handles the nested content structure recursively.
 */
function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''

  const n = node as Record<string, unknown>

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text
  }

  if (Array.isArray(n.content)) {
    return n.content.map(adfToText).join('')
  }

  // Paragraph and heading nodes: add newline
  if (n.type === 'paragraph' || (typeof n.type === 'string' && n.type.startsWith('heading'))) {
    const text = Array.isArray(n.content) ? n.content.map(adfToText).join('') : ''
    return text + '\n'
  }

  // List items
  if (n.type === 'listItem') {
    const text = Array.isArray(n.content) ? n.content.map(adfToText).join('') : ''
    return `- ${text}`
  }

  return ''
}

function toRequirement(issue: JiraIssue): Requirement {
  const fields = issue.fields
  return {
    id: issue.key,
    source: 'jira',
    title: fields.summary,
    description: adfToText(fields.description),
    status: mapJiraStatusCategory(fields.status?.statusCategory?.key ?? 'undefined'),
    priority: mapJiraPriority(fields.priority?.name ?? 'medium'),
    type: mapJiraType(fields.issuetype?.name ?? 'task'),
    labels: fields.labels ?? [],
    reporter: fields.reporter?.displayName ?? '',
    assignee: fields.assignee?.displayName ?? null,
    createdAt: fields.created,
    updatedAt: fields.updated,
    dueDate: fields.duedate ?? null,
    attachments: (fields.attachment ?? []).map(a => ({
      id: a.id,
      name: a.filename,
      url: a.content,
      mimeType: a.mimeType,
      size: a.size,
    })),
    raw: issue as unknown as Record<string, unknown>,
  }
}

export class JiraAdapter extends BaseAdapter {
  async getRequirement(params: GetRequirementParams): Promise<Requirement> {
    const data = await authFetch<JiraIssue>(
      this.config,
      this.resolvedAuth,
      {
        path: `/rest/api/3/issue/${params.id}`,
        params: { expand: 'renderedFields' },
      },
    )
    return toRequirement(data)
  }

  async searchRequirements(params: SearchRequirementsParams): Promise<SearchResult> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const startAt = (page - 1) * pageSize

    const data = await authFetch<JiraSearchResponse>(
      this.config,
      this.resolvedAuth,
      {
        path: '/rest/api/3/search',
        params: {
          jql: `text ~ "${params.query}" ORDER BY updated DESC`,
          startAt: String(startAt),
          maxResults: String(pageSize),
        },
      },
    )

    return {
      items: (data.issues ?? []).map(toRequirement),
      total: data.total ?? 0,
      page,
      pageSize,
    }
  }
}
