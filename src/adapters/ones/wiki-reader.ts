import type { Attachment } from '../../types/requirement'
import type { WikiPage, WikiPageChildrenParams, WikiPageLocator, WikiPageSearchParams, WikiPageSummary, WikiPathResolution, WikiPathResolveParams } from '../../types/wiki'
import type { WikiRenderContext } from './wiki-document'

import { createHash } from 'node:crypto'
import { WikiPathResolutionError } from '../../types/wiki'
import { attachmentNameFromPath, mimeTypeFromFileName, renderWikiContent } from './wiki-document'

interface OnesWikiContentResponse {
  content?: string
  token?: string
}

export interface OnesWikiPageDetailResponse {
  ref_uuid?: string
  uuid?: string
  title?: string
  name?: string
  page_title?: string
  parent_uuid?: string
  parent_page_uuid?: string
  space_uuid?: string
  version?: string | number
  updated_at?: string | number
  updated_time?: string | number
  update_time?: string | number
  path?: unknown
  breadcrumb?: unknown
  ancestors?: Array<{
    uuid?: string
    title?: string
    parent_uuid?: string
    space_uuid?: string
    updated_time?: string | number
  }>
  space_name?: string
  archived?: boolean
}

interface OnesLegacyWikiSearchResult {
  datas?: {
    page?: Array<{
      fields?: {
        page_uuid?: string
        uuid?: string
        title?: string
        space_uuid?: string
        space_name?: string
        updated_time?: string | number
        archived?: boolean
      }
    }>
  }
}

interface OnesOpenApiEnvelope<T> {
  data?: T
  result?: string
  errorCode?: string
}

interface OnesOpenApiWikiPage {
  id?: string
  title?: string
  spaceID?: string
  updatedTime?: number
  parentID?: string
  isArchived?: boolean
  content?: string
}

interface OnesOpenApiWikiTree {
  pages?: OnesOpenApiWikiPage[]
}

interface OnesOpenApiWikiSearchResult {
  pages?: Array<{
    fields?: OnesOpenApiWikiPage & {
      spaceName?: string
    }
  }>
}

export interface OnesWikiPageRoute {
  teamUuid: string
  spaceUuid: string | null
  wikiUuid: string
}

export interface RenderedWikiContent {
  content: string
  attachments: Attachment[]
}

export interface OnesWikiReaderSession {
  accessToken: string
  teamUuid: string
}

export interface OnesWikiReaderOptions {
  apiBase: string
  openApiToken?: string
  getSession: () => Promise<OnesWikiReaderSession>
}

class OnesWikiOpenApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    readonly reason: 'missing_credential' | 'http' = 'http',
  ) {
    super(message)
    this.name = 'OnesWikiOpenApiError'
  }
}

const MIN_TITLE_CANDIDATE_SIMILARITY = 0.65
const MIN_TITLE_MATCH_SIMILARITY = 0.75
const MIN_PARENT_MATCH_SIMILARITY = 0.35
const MIN_PATH_MATCH_SIMILARITY = 0.78
const PATH_MATCH_MARGIN = 0.08

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

function decodeIdentifier(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment)
    return /^[\w-]{1,128}$/.test(decoded) ? decoded : null
  }
  catch {
    return null
  }
}

export function isConfiguredOriginUrl(input: string, apiBase: string): boolean {
  try {
    return new URL(input).origin === new URL(apiBase).origin
  }
  catch {
    return true
  }
}

export function isOnesWikiUrlInput(input: string): boolean {
  return /\/wiki(?:\/|(?=[#?]|$))/.test(input)
}

export function parseOnesWikiPageRoute(input: string): OnesWikiPageRoute | null {
  if (!isOnesWikiUrlInput(input))
    return null
  const routeText = (() => {
    try {
      const parsed = new URL(input)
      return `${parsed.pathname}${parsed.hash}${parsed.search}`
    }
    catch {
      return input
    }
  })()
  const match = routeText.match(/\/team\/([^/?#]+)\/(?:space\/([^/?#]+)\/)?page\/([^/?#]+)/)
  if (!match?.[1] || !match[3])
    return null
  const teamUuid = decodeIdentifier(match[1])
  const spaceUuid = match[2] ? decodeIdentifier(match[2]) : null
  const wikiUuid = decodeIdentifier(match[3])
  if (!teamUuid || (match[2] && !spaceUuid) || !wikiUuid)
    return null
  return { teamUuid, spaceUuid, wikiUuid }
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number')
    return null
  const numeric = typeof value === 'number' ? value : Number(value)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizePathSegment(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

function segmentSimilarity(left: string, right: string): number {
  const leftChars = [...normalizePathSegment(left)]
  const rightChars = [...normalizePathSegment(right)]
  if (!leftChars.length || !rightChars.length)
    return 0
  if (leftChars.length === rightChars.length && leftChars.every((character, index) => character === rightChars[index]))
    return 1
  let previous = new Uint16Array(rightChars.length + 1)
  let current = new Uint16Array(rightChars.length + 1)
  for (let index = 0; index <= rightChars.length; index += 1)
    previous[index] = index
  for (let leftIndex = 1; leftIndex <= leftChars.length; leftIndex += 1) {
    current[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= rightChars.length; rightIndex += 1) {
      const substitutionCost = leftChars[leftIndex - 1] === rightChars[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }
    const swap = previous
    previous = current
    current = swap
  }
  return 1 - previous[rightChars.length] / Math.max(leftChars.length, rightChars.length)
}

export class OnesWikiReader {
  private readonly treeCache = new Map<string, { expiresAt: number, pages: OnesOpenApiWikiPage[] }>()

  constructor(private readonly options: OnesWikiReaderOptions) {}

  invalidateTree(teamId: string, spaceId: string): void {
    this.treeCache.delete(`${teamId}:${spaceId}`)
  }

  private async openApi<T>(apiPath: string): Promise<T> {
    if (!apiPath.startsWith('/wiki/'))
      throw new Error('ONES: Invalid Wiki Open API path')
    if (!this.options.openApiToken) {
      throw new OnesWikiOpenApiError(
        null,
        'ONES Wiki Open API credential is not configured. Set source.openApiAuth.tokenEnv to a Personal API Key with read scopes.',
        'missing_credential',
      )
    }
    const headers = new Headers()
    headers.set('Authorization', `Bearer ${this.options.openApiToken}`)
    const response = await fetch(`${this.options.apiBase}/openapi/v2${apiPath}`, { headers })
    if (!response.ok)
      throw new OnesWikiOpenApiError(response.status, `ONES Wiki Open API request failed with status ${response.status}`)
    const payload = await response.json() as OnesOpenApiEnvelope<T> | T
    if (payload && typeof payload === 'object' && 'result' in payload) {
      const envelope = payload as OnesOpenApiEnvelope<T>
      if (envelope.result === 'FAIL')
        throw new Error(`ONES Wiki Open API failed: ${envelope.errorCode ?? 'Unknown'}`)
      if (envelope.data !== undefined)
        return envelope.data
    }
    return payload as T
  }

  async fetchPageDetail(wikiUuid: string, teamUuid?: string, strict = false): Promise<OnesWikiPageDetailResponse> {
    const session = await this.options.getSession()
    const encodedTeamUuid = encodeIdentifier(teamUuid ?? session.teamUuid, 'team UUID')
    const encodedWikiUuid = encodeIdentifier(wikiUuid, 'wiki UUID')
    const response = await fetch(`${this.options.apiBase}/wiki/api/wiki/team/${encodedTeamUuid}/page/${encodedWikiUuid}/detail`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (!response.ok && strict)
      throw new Error(`ONES Wiki page detail error: ${response.status}`)
    return response.ok ? response.json() as Promise<OnesWikiPageDetailResponse> : {}
  }

  private buildImageUrl(session: OnesWikiReaderSession, refUuid: string, source: string, token: string, teamUuid?: string): string {
    const encodedRefUuid = encodeIdentifier(refUuid, 'wiki reference UUID')
    const sourceParts = source.split('/')
    if (sourceParts.some(part => !part || part === '.' || part === '..' || part.includes('\\')))
      throw new Error('ONES: Invalid wiki attachment path')
    const encodedSource = sourceParts.map(part => encodeURIComponent(part)).join('/')
    const encodedTeamUuid = encodeIdentifier(teamUuid ?? session.teamUuid, 'team UUID')
    return `${this.options.apiBase}/wiki/api/wiki/editor/${encodedTeamUuid}/${encodedRefUuid}/resources/${encodedSource}?token=${encodeURIComponent(token)}`
  }

  async fetchContent(wikiUuid: string, teamUuid?: string): Promise<RenderedWikiContent> {
    const session = await this.options.getSession()
    const wikiTeamUuid = teamUuid ?? session.teamUuid
    const encodedTeamUuid = encodeIdentifier(wikiTeamUuid, 'team UUID')
    const encodedWikiUuid = encodeIdentifier(wikiUuid, 'wiki UUID')
    const response = await fetch(`${this.options.apiBase}/wiki/api/wiki/team/${encodedTeamUuid}/online_page/${encodedWikiUuid}/content`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (!response.ok)
      return { content: '', attachments: [] }
    const data = await response.json() as OnesWikiContentResponse
    const context: WikiRenderContext = { imageSources: [] }
    const content = renderWikiContent(typeof data.content === 'string' ? data.content : '', context)
    const token = typeof data.token === 'string' ? data.token : ''
    if (!context.imageSources.length || !token)
      return { content, attachments: [] }
    const detail = await this.fetchPageDetail(wikiUuid, wikiTeamUuid)
    const refUuid = typeof detail.ref_uuid === 'string' ? detail.ref_uuid : ''
    if (!refUuid)
      return { content, attachments: [] }
    const attachments = context.imageSources.map((source, index) => ({
      id: `${wikiUuid}-image-${index + 1}`,
      name: attachmentNameFromPath(source),
      url: this.buildImageUrl(session, refUuid, source, token, wikiTeamUuid),
      mimeType: mimeTypeFromFileName(source),
      size: 0,
    }))
    return { content, attachments }
  }

  private async searchLegacy(params: WikiPageSearchParams, teamId: string): Promise<WikiPageSummary[]> {
    const session = await this.options.getSession()
    const query = new URLSearchParams({
      q: params.query.trim(),
      types: 'page',
      start: '0',
      limit: String(Math.min(Math.max(params.limit ?? 20, 1), 200)),
      query_param: 'title',
      include_archived: 'false',
    })
    if (params.spaceId)
      query.set('space_uuids', params.spaceId)
    const response = await fetch(`${this.options.apiBase}/wiki/api/wiki/team/${encodeIdentifier(teamId, 'team UUID')}/search?${query}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (!response.ok)
      throw new Error(`ONES Wiki search error: ${response.status}`)
    const payload = await response.json() as OnesLegacyWikiSearchResult
    return (payload.datas?.page ?? []).flatMap((item) => {
      const fields = item.fields
      const pageId = firstNonEmptyString(fields?.page_uuid, fields?.uuid)
      const title = firstNonEmptyString(fields?.title)
      if (!fields || !pageId || !title || fields.archived)
        return []
      const spaceName = firstNonEmptyString(fields.space_name)
      return [{
        pageId,
        teamId,
        spaceId: firstNonEmptyString(fields.space_uuid),
        title,
        parentPageId: null,
        breadcrumb: spaceName ? [spaceName, title] : [title],
        version: fields.updated_time === undefined ? null : String(fields.updated_time),
        updatedAt: normalizeTimestamp(fields.updated_time),
      }]
    })
  }

  private detailBreadcrumb(detail: OnesWikiPageDetailResponse): string[] {
    const breadcrumb = [...(detail.ancestors ?? [])].reverse().map(ancestor => firstNonEmptyString(ancestor.title)).filter((title): title is string => title !== null)
    const title = firstNonEmptyString(detail.title, detail.name, detail.page_title)
    if (title && breadcrumb.at(-1) !== title)
      breadcrumb.push(title)
    const spaceName = firstNonEmptyString(detail.space_name)
    if (spaceName && breadcrumb[0] !== spaceName)
      breadcrumb.unshift(spaceName)
    return breadcrumb
  }

  private async fetchPage(pageId: string, teamId: string): Promise<OnesOpenApiWikiPage> {
    return this.openApi<OnesOpenApiWikiPage>(`/wiki/pages/${encodeIdentifier(pageId, 'wiki UUID')}?${new URLSearchParams({ teamID: teamId })}`)
  }

  private async fetchTree(spaceId: string, teamId: string): Promise<OnesOpenApiWikiPage[]> {
    const key = `${teamId}:${spaceId}`
    const cached = this.treeCache.get(key)
    if (cached && cached.expiresAt > Date.now())
      return cached.pages
    const query = new URLSearchParams({ teamID: teamId, archived: 'false' })
    const data = await this.openApi<OnesOpenApiWikiTree>(`/wiki/spaces/${encodeIdentifier(spaceId, 'space UUID')}/pages?${query}`)
    const pages = Array.isArray(data.pages) ? data.pages : []
    this.treeCache.set(key, { expiresAt: Date.now() + 30_000, pages })
    return pages
  }

  private summary(page: OnesOpenApiWikiPage, teamId: string, breadcrumb: string[] = []): WikiPageSummary | null {
    const pageId = firstNonEmptyString(page.id)
    const title = firstNonEmptyString(page.title)
    return pageId && title
      ? {
          pageId,
          teamId,
          spaceId: firstNonEmptyString(page.spaceID),
          title,
          parentPageId: firstNonEmptyString(page.parentID),
          breadcrumb: breadcrumb.length ? breadcrumb : [title],
          version: page.updatedTime === undefined ? null : String(page.updatedTime),
          updatedAt: normalizeTimestamp(page.updatedTime),
        }
      : null
  }

  private treeBreadcrumb(pageId: string, pages: OnesOpenApiWikiPage[]): string[] {
    const byId = new Map(pages.flatMap(page => page.id ? [[page.id, page] as const] : []))
    const breadcrumb: string[] = []
    const visited = new Set<string>()
    let current = byId.get(pageId)
    while (current?.id && !visited.has(current.id)) {
      visited.add(current.id)
      const title = firstNonEmptyString(current.title)
      if (title)
        breadcrumb.unshift(title)
      current = current.parentID ? byId.get(current.parentID) : undefined
    }
    return breadcrumb
  }

  async getPage(params: WikiPageLocator): Promise<WikiPage> {
    const route = params.url ? parseOnesWikiPageRoute(params.url) : null
    if (params.url && !isConfiguredOriginUrl(params.url, this.options.apiBase))
      throw new Error('ONES: Wiki URL origin does not match the configured source')
    if (params.url && !route)
      throw new Error('ONES: Unsupported wiki page URL. Expected /wiki/#/team/{teamUuid}/space/{spaceUuid}/page/{wikiUuid}')
    const pageId = route?.wikiUuid ?? params.pageId?.trim()
    if (!pageId)
      throw new Error('ONES: pageId or url is required')
    const session = await this.options.getSession()
    const teamId = route?.teamUuid ?? params.teamId?.trim() ?? session.teamUuid
    const requestedSpaceId = route?.spaceUuid ?? params.spaceId?.trim() ?? null
    encodeIdentifier(pageId, 'wiki UUID')
    encodeIdentifier(teamId, 'team UUID')
    if (requestedSpaceId)
      encodeIdentifier(requestedSpaceId, 'space UUID')
    const [metadata, rendered] = await Promise.all([
      this.fetchPage(pageId, teamId).then(detail => ({ detail, legacyDetail: null as OnesWikiPageDetailResponse | null })).catch(async (error: unknown) => {
        if (!(error instanceof OnesWikiOpenApiError) || (error.status !== 401 && error.reason !== 'missing_credential'))
          throw error
        return { detail: null, legacyDetail: await this.fetchPageDetail(pageId, teamId, true) }
      }),
      this.fetchContent(pageId, teamId),
    ])
    const { detail, legacyDetail } = metadata
    const title = firstNonEmptyString(detail?.title, legacyDetail?.title, legacyDetail?.name, legacyDetail?.page_title) ?? `Wiki ${pageId}`
    const spaceId = firstNonEmptyString(detail?.spaceID, legacyDetail?.space_uuid) ?? requestedSpaceId
    const content = rendered.content || renderWikiContent(detail?.content ?? '')
    const breadcrumb = legacyDetail ? this.detailBreadcrumb(legacyDetail) : spaceId ? this.treeBreadcrumb(pageId, await this.fetchTree(spaceId, teamId)) : [title]
    if (!breadcrumb.length)
      breadcrumb.push(title)
    const updatedTime = detail?.updatedTime ?? legacyDetail?.updated_time ?? legacyDetail?.update_time
    return {
      pageId,
      teamId,
      spaceId,
      title,
      parentPageId: firstNonEmptyString(detail?.parentID, legacyDetail?.parent_uuid, legacyDetail?.parent_page_uuid),
      breadcrumb,
      version: updatedTime === undefined ? null : String(updatedTime),
      updatedAt: normalizeTimestamp(updatedTime),
      content,
      attachments: rendered.attachments,
      contentHash: createHash('sha256').update(detail?.content ?? content).digest('hex'),
    }
  }

  async search(params: WikiPageSearchParams): Promise<WikiPageSummary[]> {
    const session = await this.options.getSession()
    const teamId = params.teamId?.trim() ?? session.teamUuid
    const query = new URLSearchParams({ teamID: teamId, keyword: params.query.trim(), limit: String(Math.min(Math.max(params.limit ?? 20, 1), 100)), includeArchived: 'false' })
    if (params.spaceId)
      query.set('spaceIDs', params.spaceId)
    try {
      const data = await this.openApi<OnesOpenApiWikiSearchResult>(`/wiki/search/pages?${query}`)
      return (data.pages ?? []).flatMap((item) => {
        const summary = item.fields ? this.summary(item.fields, teamId) : null
        if (!summary)
          return []
        const spaceName = firstNonEmptyString(item.fields?.spaceName)
        return [{ ...summary, breadcrumb: spaceName ? [spaceName, summary.title] : [summary.title] }]
      })
    }
    catch (error) {
      if (!(error instanceof OnesWikiOpenApiError) || (error.status !== 401 && error.reason !== 'missing_credential'))
        throw error
      return this.searchLegacy(params, teamId)
    }
  }

  async listChildren(params: WikiPageChildrenParams): Promise<WikiPageSummary[]> {
    const session = await this.options.getSession()
    const teamId = params.teamId?.trim() ?? session.teamUuid
    let spaceId = params.spaceId?.trim()
    if (!spaceId)
      spaceId = firstNonEmptyString((await this.fetchPage(params.pageId, teamId)).spaceID) ?? undefined
    if (!spaceId)
      throw new Error('ONES: Wiki space ID could not be verified')
    const pages = await this.fetchTree(spaceId, teamId)
    return pages.flatMap((page) => {
      if (page.parentID !== params.pageId)
        return []
      const summary = this.summary(page, teamId, this.treeBreadcrumb(page.id ?? '', pages))
      return summary ? [summary] : []
    })
  }

  private pathMatches(requestedPath: string[], breadcrumb: string[], spaceName: string | null): boolean {
    const requested = spaceName && requestedPath[0] === spaceName ? requestedPath.slice(1) : requestedPath
    const actual = spaceName && breadcrumb[0] === spaceName ? breadcrumb.slice(1) : breadcrumb
    if (requested.length > actual.length)
      return false
    const suffix = actual.slice(-requested.length)
    return requested.every((segment, index) => index === requested.length - 1 ? suffix[index] === segment || suffix[index]?.startsWith(segment) : suffix[index] === segment)
  }

  private fuzzyScore(requestedPath: string[], breadcrumb: string[], spaceName: string | null): number | null {
    const omitSpace = Boolean(spaceName && requestedPath[0] === spaceName && breadcrumb[0] === spaceName)
    const requested = omitSpace ? requestedPath.slice(1) : requestedPath
    const actual = omitSpace ? breadcrumb.slice(1) : breadcrumb
    if (!requested.length || requested.length > actual.length)
      return null
    const suffix = actual.slice(-requested.length)
    let titleScore = 0
    let parentTotal = 0
    for (let index = 0; index < requested.length; index += 1) {
      const similarity = segmentSimilarity(requested[index], suffix[index])
      if (index === requested.length - 1)
        titleScore = similarity
      else if (similarity < MIN_PARENT_MATCH_SIMILARITY)
        return null
      else
        parentTotal += similarity
    }
    if (titleScore < MIN_TITLE_MATCH_SIMILARITY)
      return null
    const parentScore = requested.length === 1 ? 1 : parentTotal / (requested.length - 1)
    const score = requested.length === 1 ? titleScore : titleScore * 0.8 + parentScore * 0.2
    return score >= MIN_PATH_MATCH_SIMILARITY ? score : null
  }

  async resolvePath(params: WikiPathResolveParams): Promise<WikiPathResolution> {
    const path = params.path.map(segment => segment.trim()).filter(Boolean)
    if (!path.length)
      throw new Error('ONES: Wiki path is empty')
    const candidates = await this.search({ query: path.at(-1)!, teamId: params.teamId, spaceId: params.spaceId, limit: 200 })
    const requestedTitle = path.at(-1)!
    const titleCandidates = candidates.filter(page => page.title === requestedTitle || page.title.startsWith(requestedTitle) || segmentSimilarity(requestedTitle, page.title) >= MIN_TITLE_CANDIDATE_SIMILARITY)
    const inspected: WikiPageSummary[] = []
    const matches: WikiPageSummary[] = []
    const fuzzy: Array<{ page: WikiPageSummary, score: number }> = []
    for (const candidate of titleCandidates) {
      let detail: OnesWikiPageDetailResponse | null = null
      let breadcrumb: string[] = []
      let spaceId = candidate.spaceId
      let spaceName = candidate.breadcrumb.length > 1 ? candidate.breadcrumb[0] : null
      try {
        detail = await this.fetchPageDetail(candidate.pageId, candidate.teamId, true)
        spaceId = firstNonEmptyString(detail.space_uuid, spaceId)
        spaceName = firstNonEmptyString(detail.space_name, spaceName)
        breadcrumb = this.detailBreadcrumb(detail)
      }
      catch {
        if (!spaceId)
          continue
        try {
          breadcrumb = this.treeBreadcrumb(candidate.pageId, await this.fetchTree(spaceId, candidate.teamId))
        }
        catch {
          continue
        }
      }
      if (!spaceId)
        continue
      const page = { ...candidate, spaceId, title: firstNonEmptyString(detail?.title, candidate.title) ?? candidate.title, breadcrumb }
      inspected.push(page)
      if (this.pathMatches(path, breadcrumb, spaceName)) {
        matches.push(page)
      }
      else {
        const score = this.fuzzyScore(path, breadcrumb, spaceName)
        if (score !== null)
          fuzzy.push({ page, score })
      }
    }
    if (matches.length > 1)
      throw new WikiPathResolutionError('ambiguous', path, matches)
    let match = matches[0]
    if (!match && fuzzy.length) {
      fuzzy.sort((left, right) => right.score - left.score)
      const competing = fuzzy.filter(candidate => fuzzy[0].score - candidate.score < PATH_MATCH_MARGIN)
      if (competing.length > 1)
        throw new WikiPathResolutionError('ambiguous', path, competing.map(candidate => candidate.page))
      match = fuzzy[0].page
    }
    if (!match) {
      const inspectedIds = new Set(inspected.map(page => page.pageId))
      throw new WikiPathResolutionError('not_found', path, [...inspected, ...candidates.filter(page => !inspectedIds.has(page.pageId))])
    }
    if (!match.spaceId)
      throw new Error('ONES: Wiki space ID could not be verified')
    return { teamId: match.teamId, spaceId: match.spaceId, pageId: match.pageId, title: match.title, breadcrumb: match.breadcrumb }
  }
}
