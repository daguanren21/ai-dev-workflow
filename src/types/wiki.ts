import type { Attachment } from './requirement'

export interface WikiPageLocator {
  pageId?: string
  url?: string
  teamId?: string
  spaceId?: string
}

export interface WikiPageSummary {
  pageId: string
  teamId: string
  spaceId: string | null
  title: string
  parentPageId: string | null
  breadcrumb: string[]
  version: string | null
  updatedAt: string | null
}

export type WikiPathResolutionFailureReason = 'not_found' | 'ambiguous'

export class WikiPathResolutionError extends Error {
  constructor(
    readonly reason: WikiPathResolutionFailureReason,
    readonly requestedPath: string[],
    readonly candidates: WikiPageSummary[],
  ) {
    super(`Wiki path ${reason === 'ambiguous' ? 'is ambiguous' : 'was not found'}: ${requestedPath.join(' / ')}`)
    this.name = 'WikiPathResolutionError'
  }
}

export interface WikiPage extends WikiPageSummary {
  content: string
  attachments: Attachment[]
  contentHash: string
}

export interface WikiPageSearchParams {
  query: string
  teamId?: string
  spaceId?: string
  limit?: number
}

export interface WikiPageChildrenParams {
  pageId: string
  teamId?: string
  spaceId?: string
}

export interface WikiPathResolution {
  teamId: string
  spaceId: string
  pageId: string
  title: string
  breadcrumb: string[]
}

export interface WikiPathResolveParams {
  path: string[]
  teamId?: string
  spaceId?: string
}

export type WikiUpdateOperation
  = | { type: 'append_blocks', markdown: string }
    | { type: 'append_table_row', tableHeaders: string[], row: Record<string, string> }
    | { type: 'replace_text', find: string, replace: string }

export interface WikiWriteBaseline {
  pageId: string
  version: string | null
  contentHash: string
}

export interface WikiCreateRequest {
  teamId: string
  spaceId: string
  parentPageId: string
  title: string
  markdown: string
  idempotencyKey: string
}

export interface WikiUpdateRequest {
  teamId: string
  spaceId: string | null
  pageId: string
  baseline: WikiWriteBaseline
  operation: WikiUpdateOperation
  idempotencyKey: string
}

export interface WikiWriteResult {
  pageId: string
  title: string
  version: string | null
  url: string | null
}
