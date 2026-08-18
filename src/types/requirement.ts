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

export type PendingWorkItemKind = 'requirement' | 'task'

export interface PendingWorkItem {
  uuid: string
  displayId: string
  kind: PendingWorkItemKind
  title: string
  statusName: string
  statusCategory: 'to_do' | 'in_progress'
  assigneeName: string | null
  projectName: string | null
  parentUuid: string | null
  parentDisplayId: string | null
  actualHours: number | null
  remainingHours: number | null
  estimatedHours: number | null
  planStartDate: string | null
  planEndDate: string | null
  partial: boolean
  warnings: string[]
}

export interface PendingWorkItemsResult {
  items: PendingWorkItem[]
  total: number
  partialCount: number
  fetchedAt: string
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

export interface TestCaseStep {
  uuid: string
  index: number
  desc: string
  result: string
}

export interface TestCase {
  uuid: string
  id: string
  name: string
  priority: string
  type: string
  assignName: string | null
  condition: string
  desc: string
  steps: TestCaseStep[]
  modulePath: string
}

export interface TestCaseResult {
  taskNumber: number
  taskName: string
  moduleName: string
  moduleUuid: string
  totalCount: number
  cases: TestCase[]
}

export interface AddManhourResult {
  key: string
  taskUuid: string
  hours: number
  description: string
  date: string | null
}

export interface UpdateTaskPlanDatesResult {
  taskUuid: string
  planStartDate: string | null
  planEndDate: string | null
}

export interface RequirementDecompositionTask {
  uuid: string
  displayId: string
  name: string
  detail: string
  statusName: string
  statusCategory: string
  pending: boolean
  assigneeName: string | null
  assigneeUuid: string | null
  planStartDate: string | null
  planEndDate: string | null
}

export interface RequirementDecompositionBaseline {
  requirementVersion: string | null
  requirementUpdatedAt: string | null
  requirementHash: string
  relatedTasksHash: string
}

export interface RequirementDecompositionRelation {
  verified: boolean
  uuid: string | null
  name: string | null
}

export interface RequirementDecompositionContext {
  decompositionRelation: RequirementDecompositionRelation
  requirement: {
    workItemKind: 'requirement'
    uuid: string
    displayId: string
    name: string
    detail: string
    issueTypeName: string
    statusName: string
    statusCategory: string
    projectUuid: string | null
    projectName: string | null
    assigneeUuid: string | null
    assigneeName: string | null
  }
  tasks: RequirementDecompositionTask[]
  pendingTasks: RequirementDecompositionTask[]
  baseline: RequirementDecompositionBaseline
}

/**
 * A proposed create operation. Existing task updates deliberately use a
 * different future contract so a create approval can never authorize edits.
 */
export interface RequirementTaskCreateOperation {
  operation: 'create'
  title: string
  shortContent: string
  detail: string
  assigneeUuid?: string
  priorityUuid?: string
  complexityUuid?: string
  splitTypeUuid?: string
  productUuid?: string
  moduleUuid?: string
  estimatedHours?: number
  planStartDate?: string
  planEndDate?: string
}

export interface RequirementDecompositionPlan {
  requirement: RequirementDecompositionContext['requirement']
  decompositionRelation: RequirementDecompositionRelation
  operations: RequirementTaskCreateOperation[]
  baseline: RequirementDecompositionBaseline
  planHash: string
  approvalToken: string
  expiresAt: string
}

export interface CreatedRequirementTask {
  uuid: string
  displayId: string
  title: string
}

export interface ApplyRequirementDecompositionResult {
  requirementUuid: string
  planHash: string
  createdTasks: CreatedRequirementTask[]
}
