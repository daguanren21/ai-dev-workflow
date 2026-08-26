export interface OnesTaskNode {
  key?: string
  uuid: string
  number: number
  name: string
  description?: string
  descriptionText?: string
  desc_rich?: string
  status: { uuid: string, name: string, category?: string }
  priority?: { value: string }
  issueType?: { uuid: string, name: string, detailType?: number }
  subIssueType?: { uuid: string, name: string, detailType?: number } | null
  assign?: { uuid: string, name: string } | null
  owner?: { uuid: string, name: string } | null
  project?: { uuid: string, name: string, identifier?: string }
  parent?: { uuid: string, number?: number, issueType?: { uuid: string, name: string } } | null
  relatedTasks?: OnesRelatedTask[]
  relatedWikiPages?: OnesWikiPage[]
  relatedWikiPagesCount?: number
  path?: string
}

export interface OnesProjectNode {
  key?: string
  uuid: string
  name: string
  identifier?: string
}

export interface OnesWikiPage {
  uuid: string
  title: string
  referenceType?: number
  subReferenceType?: string
  errorMessage?: string
}

export interface OnesRelatedTask {
  key?: string
  uuid: string
  number: number
  name: string
  description?: string
  descriptionText?: string
  desc_rich?: string
  issueType: { uuid: string, name: string, detailType?: number }
  subIssueType?: { uuid: string, name: string, detailType?: number } | null
  status: { uuid: string, name: string, category?: string }
  assign?: { uuid: string, name: string } | null
  project?: { uuid: string, name: string, identifier?: string }
}

export interface OnesRelatedActivity {
  uuid: string
  name: string
  projectUUID?: string
  project_uuid?: string
  relatedChild?: string
  related_child_uuid?: string
}

export interface OnesTaskRef {
  key: string
  uuid: string
}

export interface OnesSession {
  accessToken: string
  teamUuid: string
  orgUuid: string
  userUuid: string
  userName: string
  cookieHeader: string
  legacyAuthToken: string
  legacyUserId: string
  expiresAt: number
}
