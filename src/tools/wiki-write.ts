import type { BaseAdapter } from '../adapters/base'
import type { WikiCreateRequest, WikiUpdateOperation, WikiUpdateRequest, WikiWriteBaseline } from '../types/wiki'
import crypto, { randomBytes } from 'node:crypto'
import { z } from 'zod/v4'
import { normalizeWikiPath, selectExactTableHeaders } from '../utils/wiki-content'

const APPROVAL_TTL_MS = 30 * 60 * 1000

const SourceSchema = z.string().trim().min(1).optional()
const PathSchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1),
]).describe('Wiki path. Exact self-reference segments such as "我的", "我", "me", or "my" resolve the authenticated user through ONES token info without exposing the display name.')

export const PrepareWikiCreateSchema = z
  .object({
    parentPageId: z.string().trim().min(1).optional(),
    parentPath: PathSchema.optional(),
    teamId: z.string().trim().min(1).optional(),
    spaceId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200),
    markdown: z.string(),
    source: SourceSchema,
  })
  .refine(value => Boolean(value.parentPageId || value.parentPath), 'parentPageId or parentPath is required')
  .refine(value => !(value.parentPageId && value.parentPath), 'Provide only one of parentPageId or parentPath')

const AppendBlocksSchema = z.object({
  type: z.literal('append_blocks'),
  markdown: z.string().trim().min(1),
})
const AppendTableRowSchema = z.object({
  type: z.literal('append_table_row'),
  tableHeaders: z.array(z.string().trim().min(1)).default([]),
  row: z.record(z.string(), z.string()),
})
const ReplaceTextSchema = z.object({
  type: z.literal('replace_text'),
  find: z.string().min(1),
  replace: z.string(),
})
const ReplaceDocumentSchema = z.object({
  type: z.literal('replace_document'),
  markdown: z.string().trim().min(1),
})

export const PrepareWikiUpdateSchema = z.object({
  pageId: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  path: PathSchema.optional(),
  teamId: z.string().trim().min(1).optional(),
  spaceId: z.string().trim().min(1).optional(),
  operation: z.discriminatedUnion('type', [AppendBlocksSchema, AppendTableRowSchema, ReplaceTextSchema, ReplaceDocumentSchema]),
  source: SourceSchema,
}).refine(value => [value.pageId, value.url, value.path].filter(Boolean).length === 1, 'Provide exactly one of pageId, url, or path')

export const ApplyWikiWriteSchema = z.object({
  approvalToken: z.string().trim().min(1),
  operationHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true).describe('Set true only after the user confirms the exact prepared create/edit operation immediately before submission.'),
  source: SourceSchema,
})

const WikiWriteBaselineSchema = z.object({
  pageId: z.string(),
  version: z.string().nullable(),
  contentHash: z.string(),
})

const WikiCreateRequestSchema = z.object({
  teamId: z.string(),
  spaceId: z.string(),
  parentPageId: z.string(),
  title: z.string(),
  markdown: z.string(),
  idempotencyKey: z.string(),
})

const WikiUpdateOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('append_blocks'), markdown: z.string() }),
  z.object({ type: z.literal('append_table_row'), tableHeaders: z.array(z.string()), row: z.record(z.string(), z.string()) }),
  z.object({ type: z.literal('replace_text'), find: z.string(), replace: z.string() }),
  z.object({ type: z.literal('replace_document'), markdown: z.string() }),
])

const WikiUpdateRequestSchema = z.object({
  teamId: z.string(),
  spaceId: z.string().nullable(),
  pageId: z.string(),
  baseline: WikiWriteBaselineSchema,
  operation: WikiUpdateOperationSchema,
  idempotencyKey: z.string(),
})

const WikiPreparedOutputFields = {
  targetBreadcrumb: z.array(z.string()),
  operationHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvalToken: z.string().length(48),
  expiresAt: z.string(),
}

export const PrepareWikiCreateOutputSchema = z.object({
  kind: z.literal('create'),
  ...WikiPreparedOutputFields,
  request: WikiCreateRequestSchema,
  parentBaseline: WikiWriteBaselineSchema,
})

export const PrepareWikiUpdateOutputSchema = z.object({
  kind: z.literal('update'),
  ...WikiPreparedOutputFields,
  request: WikiUpdateRequestSchema,
})

export const WikiWriteResultOutputSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  version: z.string().nullable(),
  url: z.string().nullable(),
})

type PrepareWikiCreateInput = z.infer<typeof PrepareWikiCreateSchema>
type PrepareWikiUpdateInput = z.infer<typeof PrepareWikiUpdateSchema>
type ApplyWikiWriteInput = z.infer<typeof ApplyWikiWriteSchema>

type WikiApprovalRecord
  = | {
    kind: 'create'
    source: string
    parentBaseline: WikiWriteBaseline
    request: WikiCreateRequest
    operationHash: string
    expiresAt: number
  }
  | {
    kind: 'update'
    source: string
    baseline: WikiWriteBaseline
    request: WikiUpdateRequest
    operationHash: string
    expiresAt: number
  }

type WikiApprovalDraft
  = | Omit<Extract<WikiApprovalRecord, { kind: 'create' }>, 'expiresAt'>
    | Omit<Extract<WikiApprovalRecord, { kind: 'update' }>, 'expiresAt'>

export class WikiWriteApprovalStore {
  private readonly approvals = new Map<string, WikiApprovalRecord>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options: { now?: () => number, ttlMs?: number } = {}) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? APPROVAL_TTL_MS
  }

  create(record: WikiApprovalDraft): { token: string, expiresAt: number } {
    const now = this.now()
    for (const [token, current] of this.approvals) {
      const sameTarget = current.source === record.source
        && (current.kind === 'create' && record.kind === 'create'
          ? current.request.parentPageId === record.request.parentPageId && current.request.title === record.request.title
          : current.kind === 'update' && record.kind === 'update'
            ? current.request.pageId === record.request.pageId
            : false)
      if (current.expiresAt <= now || sameTarget)
        this.approvals.delete(token)
    }
    const token = randomBytes(24).toString('hex')
    const expiresAt = now + this.ttlMs
    this.approvals.set(token, { ...record, expiresAt } as WikiApprovalRecord)
    return { token, expiresAt }
  }

  take(token: string): WikiApprovalRecord | null {
    const record = this.approvals.get(token)
    if (!record)
      return null
    this.approvals.delete(token)
    return record.expiresAt <= this.now() ? null : record
  }
}

function resolveAdapter(
  source: string | undefined,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
): { sourceType: string, adapter: BaseAdapter } {
  const sourceType = source ?? defaultSource
  if (!sourceType)
    throw new Error('No source specified and no default source configured')
  const adapter = adapters.get(sourceType)
  if (!adapter)
    throw new Error(`Source "${sourceType}" is not configured`)
  return { sourceType, adapter }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(stableValue)
  if (!value || typeof value !== 'object')
    return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  )
}

function hashOperation(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function baseline(page: { pageId: string, version: string | null, contentHash: string }): WikiWriteBaseline {
  return { pageId: page.pageId, version: page.version, contentHash: page.contentHash }
}

function sameBaseline(left: WikiWriteBaseline, right: WikiWriteBaseline): boolean {
  return left.pageId === right.pageId
    && left.version === right.version
    && left.contentHash === right.contentHash
}

async function resolvePageFromPath(
  adapter: BaseAdapter,
  path: string | string[],
  teamId?: string,
  spaceId?: string,
) {
  return adapter.resolveWikiPath({ path: normalizeWikiPath(path), teamId, spaceId })
}

function exactUpdateOperation(pageContent: string, operation: PrepareWikiUpdateInput['operation']): WikiUpdateOperation {
  if (operation.type === 'replace_text') {
    const occurrences = pageContent.split(operation.find).length - 1
    if (occurrences !== 1)
      throw new Error(`replace_text requires exactly one match; found ${occurrences}`)
    return operation
  }
  if (operation.type === 'append_table_row') {
    const tableHeaders = selectExactTableHeaders(pageContent, operation.tableHeaders)
    const unknown = Object.keys(operation.row).filter(key => !tableHeaders.includes(key))
    if (unknown.length)
      throw new Error(`Table row contains unknown columns: ${unknown.join(', ')}`)
    return {
      type: 'append_table_row',
      tableHeaders,
      row: Object.fromEntries(tableHeaders.map(header => [header, operation.row[header] ?? ''])),
    }
  }
  return operation
}

export async function handlePrepareWikiCreate(
  input: PrepareWikiCreateInput,
  adapters: Map<string, BaseAdapter>,
  approvals: WikiWriteApprovalStore,
  defaultSource?: string,
) {
  const { sourceType, adapter } = resolveAdapter(input.source, adapters, defaultSource)
  const resolved = input.parentPath
    ? await resolvePageFromPath(adapter, input.parentPath, input.teamId, input.spaceId)
    : null
  const parent = await adapter.getWikiPage({
    pageId: resolved?.pageId ?? input.parentPageId,
    teamId: resolved?.teamId ?? input.teamId,
    spaceId: resolved?.spaceId ?? input.spaceId,
  })
  const teamId = resolved?.teamId ?? parent.teamId
  const spaceId = resolved?.spaceId ?? parent.spaceId
  if (!spaceId)
    throw new Error('The target space could not be verified')
  const title = input.title.trim()
  const titleCandidates = await adapter.searchWikiPages({
    query: title,
    teamId,
    spaceId,
    limit: 50,
  })
  const exactTitlePages = await Promise.all(
    titleCandidates
      .filter(candidate => candidate.title === title)
      .map(candidate => adapter.getWikiPage({
        pageId: candidate.pageId,
        teamId: candidate.teamId,
        spaceId: candidate.spaceId ?? spaceId,
      })),
  )
  const siblingConflicts = exactTitlePages.filter(page => page.parentPageId === parent.pageId)
  if (siblingConflicts.length) {
    throw new Error(
      `Wiki title already exists under the selected parent (${siblingConflicts.map(page => page.pageId).join(', ')}). `
      + 'Ask the user to choose one action: edit the existing page, delete it and recreate, or create with a new title.',
    )
  }

  const requestWithoutKey = {
    teamId,
    spaceId,
    parentPageId: parent.pageId,
    title,
    markdown: input.markdown,
  }
  const operationHash = hashOperation({ kind: 'create', source: sourceType, ...requestWithoutKey, parentBaseline: baseline(parent) })
  const request: WikiCreateRequest = { ...requestWithoutKey, idempotencyKey: operationHash }
  const approval = approvals.create({
    kind: 'create',
    source: sourceType,
    parentBaseline: baseline(parent),
    request,
    operationHash,
  })
  const plan = {
    kind: 'create' as const,
    targetBreadcrumb: [...(resolved?.breadcrumb ?? parent.breadcrumb), input.title.trim()],
    request,
    parentBaseline: baseline(parent),
    operationHash,
    approvalToken: approval.token,
    expiresAt: new Date(approval.expiresAt).toISOString(),
  }
  return {
    content: [{
      type: 'text' as const,
      text: [
        `Prepared Wiki create at ${plan.targetBreadcrumb.join(' / ')}.`,
        'No write was performed. Ask the user to confirm this exact operation immediately before apply.',
        `operationHash: ${plan.operationHash}`,
        `approvalToken: ${plan.approvalToken}`,
        `expiresAt: ${plan.expiresAt}`,
      ].join('\n'),
    }],
    structuredContent: plan,
  }
}

export async function handlePrepareWikiUpdate(
  input: PrepareWikiUpdateInput,
  adapters: Map<string, BaseAdapter>,
  approvals: WikiWriteApprovalStore,
  defaultSource?: string,
) {
  const { sourceType, adapter } = resolveAdapter(input.source, adapters, defaultSource)
  const resolved = input.path
    ? await resolvePageFromPath(adapter, input.path, input.teamId, input.spaceId)
    : null
  const page = await adapter.getWikiPage({
    pageId: resolved?.pageId ?? input.pageId,
    url: input.url,
    teamId: resolved?.teamId ?? input.teamId,
    spaceId: resolved?.spaceId ?? input.spaceId,
  })
  const operation = exactUpdateOperation(page.content, input.operation)
  const pageBaseline = baseline(page)
  const requestWithoutKey = {
    teamId: page.teamId,
    spaceId: page.spaceId,
    pageId: page.pageId,
    baseline: pageBaseline,
    operation,
  }
  const operationHash = hashOperation({ kind: 'update', source: sourceType, ...requestWithoutKey })
  const request: WikiUpdateRequest = { ...requestWithoutKey, idempotencyKey: operationHash }
  const approval = approvals.create({
    kind: 'update',
    source: sourceType,
    baseline: pageBaseline,
    request,
    operationHash,
  })
  const plan = {
    kind: 'update' as const,
    targetBreadcrumb: resolved?.breadcrumb ?? page.breadcrumb,
    request,
    operationHash,
    approvalToken: approval.token,
    expiresAt: new Date(approval.expiresAt).toISOString(),
  }
  return {
    content: [{
      type: 'text' as const,
      text: [
        `Prepared Wiki update for ${plan.targetBreadcrumb.join(' / ') || page.title}.`,
        'No write was performed. Ask the user to confirm this exact operation immediately before apply.',
        `operationHash: ${plan.operationHash}`,
        `approvalToken: ${plan.approvalToken}`,
        `expiresAt: ${plan.expiresAt}`,
      ].join('\n'),
    }],
    structuredContent: plan,
  }
}

export async function handleApplyWikiWrite(
  input: ApplyWikiWriteInput,
  adapters: Map<string, BaseAdapter>,
  approvals: WikiWriteApprovalStore,
  options: { defaultSource?: string, writesEnabled: boolean, expectedKind?: 'create' | 'update' },
) {
  if (!options.writesEnabled)
    throw new Error('Wiki writes are disabled. Enable both ONES_WIKI_ENABLE_WRITES=true and source option wikiWrites=true.')

  const record = approvals.take(input.approvalToken)
  if (!record)
    throw new Error('Wiki approval token is invalid, expired, superseded, or already used')
  if (options.expectedKind && record.kind !== options.expectedKind)
    throw new Error(`This approval token is for a Wiki ${record.kind} operation`)
  if (record.operationHash !== input.operationHash)
    throw new Error('operationHash does not match the prepared Wiki operation')
  const requestedSource = input.source ?? options.defaultSource
  if (requestedSource !== record.source)
    throw new Error('The apply source does not match the prepared Wiki operation')
  const { adapter } = resolveAdapter(record.source, adapters, options.defaultSource)

  if (record.kind === 'create') {
    const currentParent = await adapter.getWikiPage({
      pageId: record.request.parentPageId,
      teamId: record.request.teamId,
      spaceId: record.request.spaceId,
    })
    if (!sameBaseline(record.parentBaseline, baseline(currentParent)))
      throw new Error('The parent Wiki page changed after prepare; prepare the create operation again')
    const result = await adapter.createWikiPage(record.request)
    return { content: [{ type: 'text' as const, text: `Created Wiki page ${result.title}.` }], structuredContent: result }
  }

  const current = await adapter.getWikiPage({
    pageId: record.request.pageId,
    teamId: record.request.teamId,
    spaceId: record.request.spaceId ?? undefined,
  })
  if (!sameBaseline(record.baseline, baseline(current)))
    throw new Error('The Wiki page changed after prepare; prepare the update again')
  const result = await adapter.updateWikiPage(record.request)
  return { content: [{ type: 'text' as const, text: `Updated Wiki page ${result.title}.` }], structuredContent: result }
}
