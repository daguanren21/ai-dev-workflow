import type { WikiCreateRequest, WikiDeleteRequest, WikiDeleteResult, WikiUpdateRequest, WikiWriteResult } from '../../types/wiki'

import { replaceOnesWikiDocument } from '../../utils/ones-wiki-collab'
import { applyWikiUpdateOperation, markdownToWikiDocument, markdownToWikiHtml, parseWikiDocument } from './wiki-document'

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
  content?: string
  updated_time?: string | number
  version?: string | number
  from_version?: string | number
}

export interface OnesWikiProductSession {
  accessToken: string
  userUuid: string
  userName: string
  cookieHeader: string
  legacyAuthToken: string
  legacyUserId: string
}

export interface OnesWikiProductPageDetail {
  ref_uuid?: string
  ref_type?: number
  draft_uuid?: string
  draftUuid?: string
  draft_ref_uuid?: string
  draftRefUuid?: string
  online_draft_uuid?: string
  onlineDraftUuid?: string
  online_draft_ref_uuid?: string
  onlineDraftRefUuid?: string
  draft?: { uuid?: string, ref_uuid?: string }
  online_draft?: { uuid?: string, ref_uuid?: string }
  title?: string
  name?: string
  page_title?: string
  version?: string | number
}

export interface OnesWikiProductWriterOptions {
  apiBase: string
  getSession: () => Promise<OnesWikiProductSession>
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
    headers.set('Ones-Auth-Token', session.legacyAuthToken)
    headers.set('Ones-User-Id', session.legacyUserId)
    headers.set('Referer', this.options.apiBase)
    if (session.cookieHeader)
      headers.set('Cookie', session.cookieHeader)
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
    editorTokenOverride?: string,
  ): Promise<{ version: number }> {
    const session = await this.options.getSession()
    const editorToken = editorTokenOverride ?? await this.fetchEditorToken(teamId, resourceId, preferDraft)
    const result = await replaceOnesWikiDocument({
      baseUrl: this.options.apiBase,
      teamId,
      documentId,
      accessToken: session.accessToken,
      editorToken,
      userId: session.userUuid,
      cookieHeader: session.cookieHeader,
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
    const encodedPageId = encodeIdentifier(params.pageId, 'Wiki page UUID')
    const encodedSpaceId = params.spaceId ? encodeIdentifier(params.spaceId, 'Wiki space UUID') : null
    let detail = await this.request<OnesWikiProductPageDetail>(
      params.teamId,
      `/page/${encodedPageId}?action=edit`,
    )
    const title = firstNonEmptyString(detail.title, detail.name, detail.page_title) ?? `Wiki ${params.pageId}`
    if (detail.ref_type === 6 && detail.ref_uuid) {
      const editorToken = await this.fetchEditorToken(params.teamId, params.pageId)
      const write = await this.replaceDocument(params.teamId, params.pageId, detail.ref_uuid, (snapshot) => {
        return parseWikiDocument(applyWikiUpdateOperation(JSON.stringify(snapshot), params.operation))
      }, false, editorToken)
      const published = await this.request<OnesWikiDraftResponse>(
        params.teamId,
        `/online_page/${encodedPageId}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
      )
      if (params.spaceId)
        this.options.invalidateTree(params.teamId, params.spaceId)
      return {
        pageId: params.pageId,
        title,
        version: String(published.version ?? published.updated_time ?? write.version),
        url: params.spaceId
          ? `${this.options.apiBase}/wiki/#/team/${encodeURIComponent(params.teamId)}/space/${encodeURIComponent(params.spaceId)}/page/${encodeURIComponent(params.pageId)}`
          : null,
      }
    }
    let draftId = firstNonEmptyString(
      detail.online_draft_uuid,
      detail.onlineDraftUuid,
      detail.online_draft?.uuid,
      detail.draft_uuid,
      detail.draftUuid,
      detail.draft?.uuid,
    )
    let documentId = firstNonEmptyString(
      detail.online_draft_ref_uuid,
      detail.onlineDraftRefUuid,
      detail.online_draft?.ref_uuid,
      detail.draft_ref_uuid,
      detail.draftRefUuid,
      detail.draft?.ref_uuid,
      detail.ref_uuid,
    )
    if (!draftId) {
      if (!encodedSpaceId)
        throw new Error('ONES Wiki page space is required to create an edit draft')
      try {
        const createdDraft = await this.request<OnesWikiDraftResponse>(
          params.teamId,
          `/space/${encodedSpaceId}/drafts/add`,
          {
            method: 'POST',
            body: JSON.stringify({
              page_uuid: params.pageId,
              status: 2,
              title,
            }),
          },
        )
        draftId = firstNonEmptyString(createdDraft.draft_uuid, createdDraft.draftUuid, createdDraft.uuid, createdDraft.id)
        documentId = firstNonEmptyString(createdDraft.ref_uuid, createdDraft.refUuid, documentId)
      }
      catch (error) {
        const refreshedDetail = await this.request<OnesWikiProductPageDetail>(
          params.teamId,
          `/space/${encodedSpaceId}/page/${encodedPageId}`,
        )
        draftId = firstNonEmptyString(refreshedDetail.draft_uuid, refreshedDetail.draftUuid)
        if (!draftId)
          throw error
        detail = refreshedDetail
        documentId = firstNonEmptyString(refreshedDetail.draft_ref_uuid, refreshedDetail.draftRefUuid, refreshedDetail.ref_uuid, documentId)
      }
    }
    if (!draftId || !encodedSpaceId)
      throw new Error('ONES Wiki edit draft did not include the required resource and space IDs')
    const encodedDraftId = encodeIdentifier(draftId, 'Wiki draft UUID')
    const draftDetail = await this.request<OnesWikiDraftResponse>(
      params.teamId,
      `/space/${encodedSpaceId}/draft/${encodedDraftId}`,
    )
    documentId = firstNonEmptyString(draftDetail.ref_uuid, draftDetail.refUuid, documentId)
    if (!documentId)
      throw new Error('ONES Wiki edit draft did not include a collaborative document ID')
    if (typeof draftDetail.content === 'string') {
      let content: string
      if (params.operation.type === 'replace_document') {
        content = markdownToWikiHtml(params.operation.markdown)
      }
      else if (params.operation.type === 'append_blocks') {
        content = `${draftDetail.content}\n${markdownToWikiHtml(params.operation.markdown)}`
      }
      else if (params.operation.type === 'replace_text') {
        const occurrences = draftDetail.content.split(params.operation.find).length - 1
        if (occurrences !== 1)
          throw new Error(`ONES Wiki draft replace_text requires exactly one match; found ${occurrences}`)
        content = draftDetail.content.replace(params.operation.find, params.operation.replace)
      }
      else {
        throw new Error('ONES Wiki append_table_row is not supported for legacy page drafts')
      }
      const published = await this.request<OnesWikiDraftResponse>(
        params.teamId,
        `/space/${encodedSpaceId}/draft/${encodedDraftId}/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...draftDetail,
            content,
            title,
            page_uuid: params.pageId,
            space_uuid: params.spaceId,
            from_version: detail.version ?? draftDetail.from_version,
            is_published: true,
            is_forced: true,
          }),
        },
      )
      this.options.invalidateTree(params.teamId, params.spaceId!)
      const publishedVersion = published.version ?? published.updated_time ?? draftDetail.version ?? draftDetail.updated_time
      return {
        pageId: params.pageId,
        title,
        version: publishedVersion === undefined ? null : String(publishedVersion),
        url: `${this.options.apiBase}/wiki/#/team/${encodeURIComponent(params.teamId)}/space/${encodeURIComponent(params.spaceId!)}/page/${encodeURIComponent(params.pageId)}`,
      }
    }

    const write = await this.replaceDocument(params.teamId, draftId, documentId, (snapshot) => {
      return parseWikiDocument(applyWikiUpdateOperation(JSON.stringify(snapshot), params.operation))
    }, true)

    const refreshedDraft = await this.request<OnesWikiDraftResponse>(
      params.teamId,
      `/space/${encodedSpaceId}/draft/${encodedDraftId}`,
    )
    await this.request<OnesWikiDraftResponse>(
      params.teamId,
      `/space/${encodedSpaceId}/draft/${encodedDraftId}/update`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...refreshedDraft,
          title,
          page_uuid: params.pageId,
          space_uuid: params.spaceId,
          from_version: detail.version ?? refreshedDraft.from_version,
          is_published: true,
          is_forced: true,
        }),
      },
    )

    if (params.spaceId)
      this.options.invalidateTree(params.teamId, params.spaceId)
    return {
      pageId: params.pageId,
      title,
      version: String(write.version),
      url: params.spaceId
        ? `${this.options.apiBase}/wiki/#/team/${encodeURIComponent(params.teamId)}/space/${encodeURIComponent(params.spaceId)}/page/${encodeURIComponent(params.pageId)}`
        : null,
    }
  }

  async delete(params: WikiDeleteRequest): Promise<WikiDeleteResult> {
    const encodedSpaceId = encodeIdentifier(params.spaceId, 'Wiki space UUID')
    const encodedPageId = encodeIdentifier(params.pageId, 'Wiki page UUID')
    await this.request(params.teamId, `/space/${encodedSpaceId}/page/${encodedPageId}/delete`, {
      method: 'POST',
    })
    this.options.invalidateTree(params.teamId, params.spaceId)
    return { pageId: params.pageId, deleted: true }
  }
}
