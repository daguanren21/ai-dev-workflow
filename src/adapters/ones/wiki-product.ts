import type { WikiCreateRequest, WikiUpdateRequest, WikiWriteResult } from '../../types/wiki'

import { replaceOnesWikiDocument } from '../../utils/ones-wiki-collab'
import { applyWikiUpdateOperation, markdownToWikiDocument, parseWikiDocument } from './wiki-document'

interface OnesWikiEditorTokenResponse {
  token?: string
  data?: {
    token?: string
  }
}

interface OnesWikiDraftResponse {
  id?: string
  uuid?: string
  page_uuid?: string
  pageUuid?: string
  draft_uuid?: string
  draftUuid?: string
  ref_uuid?: string
  refUuid?: string
  title?: string
}

export interface OnesWikiProductSession {
  accessToken: string
  userUuid: string
  userName: string
}

export interface OnesWikiProductPageDetail {
  ref_uuid?: string
  title?: string
  name?: string
  page_title?: string
}

export interface OnesWikiProductWriterOptions {
  apiBase: string
  getSession: () => Promise<OnesWikiProductSession>
  fetchPageDetail: (pageId: string, teamId: string) => Promise<OnesWikiProductPageDetail>
  invalidateTree: (teamId: string, spaceId: string) => void
}

class OnesWikiProductApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'OnesWikiProductApiError'
  }
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }
  return null
}

function encodeIdentifier(value: string, label: string): string {
  if (!/^[\w-]{1,128}$/.test(value))
    throw new Error(`ONES: Invalid ${label}`)
  return encodeURIComponent(value)
}

export class OnesWikiProductWriter {
  constructor(private readonly options: OnesWikiProductWriterOptions) {}

  private async request<T>(teamId: string, apiPath: string, init: RequestInit = {}): Promise<T> {
    if (!apiPath.startsWith('/') || apiPath.includes('..'))
      throw new Error('ONES: Invalid Wiki product API path')
    const session = await this.options.getSession()
    const encodedTeamId = encodeIdentifier(teamId, 'team UUID')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${session.accessToken}`)
    if (typeof init.body === 'string' && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json;charset=UTF-8')
    const response = await fetch(`${this.options.apiBase}/wiki/api/wiki/team/${encodedTeamId}${apiPath}`, {
      ...init,
      headers,
    })
    if (!response.ok)
      throw new OnesWikiProductApiError(response.status, `ONES Wiki product API request failed with status ${response.status}`)
    if (response.status === 204)
      return {} as T
    return response.json() as Promise<T>
  }

  private async fetchEditorToken(teamId: string, resourceId: string, preferDraft = false): Promise<string> {
    const encodedResourceId = encodeIdentifier(resourceId, 'wiki editor resource UUID')
    const resourceTypes = preferDraft ? ['online_draft', 'online_page'] : ['online_page', 'online_draft']
    for (const resourceType of resourceTypes) {
      try {
        const response = await this.request<OnesWikiEditorTokenResponse>(
          teamId,
          `/${resourceType}/${encodedResourceId}/token?action=edit`,
        )
        const token = firstNonEmptyString(response.token, response.data?.token)
        if (!token)
          throw new Error('ONES Wiki editor token response did not include a token')
        return token
      }
      catch (error) {
        if (!(error instanceof OnesWikiProductApiError) || error.status !== 404)
          throw error
      }
    }
    throw new Error('ONES Wiki editor token endpoint was not found')
  }

  private async replaceDocument(
    teamId: string,
    resourceId: string,
    documentId: string,
    update: (snapshot: Record<string, unknown>) => Record<string, unknown>,
    preferDraft = false,
  ): Promise<{ version: number }> {
    const session = await this.options.getSession()
    const editorToken = await this.fetchEditorToken(teamId, resourceId, preferDraft)
    const result = await replaceOnesWikiDocument({
      baseUrl: this.options.apiBase,
      teamId,
      documentId,
      accessToken: session.accessToken,
      editorToken,
      userId: session.userUuid,
      displayName: session.userName,
    }, update)
    return { version: result.version }
  }

  async create(params: WikiCreateRequest): Promise<WikiWriteResult> {
    const created = await this.request<OnesWikiDraftResponse>(params.teamId, '/online_pages/add', {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey },
      body: JSON.stringify({
        parent_uuid: encodeIdentifier(params.parentPageId, 'parent Wiki UUID'),
        title: params.title,
        space_uuid: encodeIdentifier(params.spaceId, 'Wiki space UUID'),
      }),
    })
    const resourceId = firstNonEmptyString(
      created.draft_uuid,
      created.draftUuid,
      created.page_uuid,
      created.pageUuid,
      created.uuid,
      created.id,
    )
    const documentId = firstNonEmptyString(created.ref_uuid, created.refUuid, resourceId)
    if (!resourceId || !documentId)
      throw new Error('ONES Wiki draft create response did not include a document ID')

    const desired = markdownToWikiDocument(params.markdown)
    const write = await this.replaceDocument(params.teamId, resourceId, documentId, (snapshot) => {
      const next = structuredClone(snapshot)
      next.blocks = desired.blocks
      for (const [key, value] of Object.entries(desired)) {
        if (key !== 'blocks' && key !== 'comments' && key !== 'meta')
          next[key] = value
      }
      if (!next.comments || typeof next.comments !== 'object')
        next.comments = {}
      if (!next.meta || typeof next.meta !== 'object')
        next.meta = {}
      return next
    }, true)

    const encodedResourceId = encodeIdentifier(resourceId, 'Wiki draft UUID')
    let published: OnesWikiDraftResponse
    try {
      published = await this.request<OnesWikiDraftResponse>(params.teamId, `/online_page/${encodedResourceId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ title: params.title }),
      })
    }
    catch (error) {
      if (!(error instanceof OnesWikiProductApiError) || error.status !== 404)
        throw error
      published = await this.request<OnesWikiDraftResponse>(params.teamId, `/online_draft/${encodedResourceId}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          title: params.title,
          parent_uuid: params.parentPageId,
          space_uuid: params.spaceId,
        }),
      })
    }

    const pageId = firstNonEmptyString(
      published.page_uuid,
      published.pageUuid,
      published.uuid,
      published.id,
      resourceId,
    )!
    this.options.invalidateTree(params.teamId, params.spaceId)
    return {
      pageId,
      title: firstNonEmptyString(published.title, created.title) ?? params.title,
      version: String(write.version),
      url: `${this.options.apiBase}/wiki/#/team/${encodeURIComponent(params.teamId)}/space/${encodeURIComponent(params.spaceId)}/page/${encodeURIComponent(pageId)}`,
    }
  }

  async update(params: WikiUpdateRequest): Promise<WikiWriteResult> {
    const detail = await this.options.fetchPageDetail(params.pageId, params.teamId)
    const documentId = firstNonEmptyString(detail.ref_uuid)
    if (!documentId)
      throw new Error('ONES Wiki page detail did not include a collaborative document ID')
    const write = await this.replaceDocument(params.teamId, params.pageId, documentId, (snapshot) => {
      return parseWikiDocument(applyWikiUpdateOperation(JSON.stringify(snapshot), params.operation))
    })
    if (params.spaceId)
      this.options.invalidateTree(params.teamId, params.spaceId)
    return {
      pageId: params.pageId,
      title: firstNonEmptyString(detail.title, detail.name, detail.page_title) ?? `Wiki ${params.pageId}`,
      version: String(write.version),
      url: params.spaceId
        ? `${this.options.apiBase}/wiki/#/team/${encodeURIComponent(params.teamId)}/space/${encodeURIComponent(params.spaceId)}/page/${encodeURIComponent(params.pageId)}`
        : null,
    }
  }
}
