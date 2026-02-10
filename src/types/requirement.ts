export type SourceType = 'ones' | 'jira' | 'github' | 'gitlab'

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
