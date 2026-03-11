/**
 * Bundled source types. To add new sources, extend this union and implement BaseAdapter.
 * GitHub/Jira users: use their official MCP servers directly.
 */
export type SourceType = 'ones'

export type RequirementStatus = 'open' | 'in_progress' | 'done' | 'closed'

export type RequirementPriority = 'low' | 'medium' | 'high' | 'critical'

export type RequirementType = 'feature' | 'bug' | 'task' | 'story'

export interface Attachment {
  id: string
  name: string
  url: string
  mimeType: string
  size: number
}

export interface Requirement {
  id: string
  source: SourceType

  // Basic info
  title: string
  description: string
  status: RequirementStatus
  priority: RequirementPriority
  type: RequirementType
  labels: string[]

  // People
  reporter: string
  assignee: string | null

  // Time
  createdAt: string
  updatedAt: string
  dueDate: string | null

  // Attachments
  attachments: Attachment[]

  // Raw data from source
  raw: Record<string, unknown>
}

export interface SearchResult {
  items: Requirement[]
  total: number
  page: number
  pageSize: number
}

export interface RelatedIssue {
  key: string
  uuid: string
  name: string
  issueTypeName: string
  statusName: string
  statusCategory: string
  assignName: string | null
  assignUuid: string | null
  priorityValue: string | null
  projectName: string | null
}

export interface IssueDetail {
  key: string
  uuid: string
  name: string
  description: string
  descriptionRich: string
  descriptionText: string
  issueTypeName: string
  statusName: string
  statusCategory: string
  assignName: string | null
  ownerName: string | null
  solverName: string | null
  priorityValue: string | null
  severityLevel: string | null
  projectName: string | null
  deadline: string | null
  sprintName: string | null
  raw: Record<string, unknown>
}
