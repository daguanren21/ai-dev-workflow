import type { BaseAdapter } from '../adapters/base'
import type { ApplyRequirementDecompositionResult, RequirementDecompositionBaseline, RequirementDecompositionContext, RequirementDecompositionPlan, RequirementDecompositionRelation, RequirementTaskCreateOperation } from '../types/requirement'
import { randomBytes } from 'node:crypto'
import { z } from 'zod/v4'
import { sanitizeExternalInline, sanitizeExternalText, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content'
import { buildRequirementDecompositionPlanHash, isSameRequirementBaseline, sortRequirementTasks } from '../utils/requirement-decomposition'

const APPROVAL_TTL_MS = 30 * 60 * 1000
const MAX_CREATE_OPERATIONS = 10

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

const DateSchema = z.string().refine(isValidDate, 'Expected a valid YYYY-MM-DD date')

function unicodeLength(value: string): number {
  return Array.from(value).length
}

const ShortContentSchema = z.string()
  .trim()
  .min(1)
  .refine(value => unicodeLength(value) <= 20, 'shortContent must not exceed 20 Unicode characters')

export const RequirementTaskProposalSchema = z.object({
  shortContent: ShortContentSchema.describe('Concise task content without the requirement display ID; at most 20 Unicode characters.'),
  detail: z.string().trim().min(1).describe('Concrete task detail and completion boundary.'),
  assigneeUuid: z.string().trim().min(1).optional(),
  priorityUuid: z.string().trim().min(1).optional(),
  complexityUuid: z.string().trim().min(1).optional(),
  splitTypeUuid: z.string().trim().min(1).optional(),
  productUuid: z.string().trim().min(1).optional(),
  moduleUuid: z.string().trim().min(1).optional(),
  estimatedHours: z.number().positive().finite().optional(),
  planStartDate: DateSchema.optional(),
  planEndDate: DateSchema.optional(),
}).refine(
  value => !value.planStartDate || !value.planEndDate || value.planStartDate <= value.planEndDate,
  { message: 'planEndDate must be the same as or later than planStartDate' },
)

export const InspectRequirementDecompositionSchema = z.object({
  requirementId: z.string().trim().min(1).describe('ONES requirement UUID, number, or display ID.'),
  source: z.string().optional().describe('Source to inspect. If omitted, uses the default source.'),
})

export const PrepareRequirementDecompositionSchema = z.object({
  requirementId: z.string().trim().min(1).describe('ONES requirement UUID, number, or display ID.'),
  tasks: z.array(RequirementTaskProposalSchema).min(1).max(MAX_CREATE_OPERATIONS),
  source: z.string().optional().describe('Source to prepare against. If omitted, uses the default source.'),
})

export const ApplyRequirementDecompositionSchema = z.object({
  approvalToken: z.string().trim().min(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true).describe('Must be true only after the user confirms the exact prepared operations.'),
  source: z.string().optional().describe('Source to write to. Must match the prepared plan source.'),
})

export type InspectRequirementDecompositionInput = z.infer<typeof InspectRequirementDecompositionSchema>
export type PrepareRequirementDecompositionInput = z.infer<typeof PrepareRequirementDecompositionSchema>
export type ApplyRequirementDecompositionInput = z.infer<typeof ApplyRequirementDecompositionSchema>

interface ApprovalRecord {
  source: string
  requirementId: string
  requirementUuid: string
  decompositionRelation: RequirementDecompositionRelation
  baseline: RequirementDecompositionBaseline
  operations: RequirementTaskCreateOperation[]
  planHash: string
  expiresAt: number
}

export class RequirementDecompositionApprovalStore {
  private readonly approvals = new Map<string, ApprovalRecord>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options: { now?: () => number, ttlMs?: number } = {}) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? APPROVAL_TTL_MS
  }

  create(record: Omit<ApprovalRecord, 'expiresAt'>): { token: string, expiresAt: number } {
    const now = this.now()
    for (const [token, approval] of this.approvals) {
      const expired = approval.expiresAt <= now
      const superseded = approval.source === record.source
        && approval.requirementUuid === record.requirementUuid
      if (expired || superseded)
        this.approvals.delete(token)
    }

    const token = randomBytes(24).toString('hex')
    const expiresAt = now + this.ttlMs
    this.approvals.set(token, { ...record, expiresAt })
    return { token, expiresAt }
  }

  /** Atomically remove and return an approval before any asynchronous work. */
  take(token: string): ApprovalRecord | null {
    const record = this.approvals.get(token)
    if (!record)
      return null
    this.approvals.delete(token)
    if (record.expiresAt <= this.now())
      return null
    return record
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
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }
  return { sourceType, adapter }
}

function sanitizedContext(context: RequirementDecompositionContext): RequirementDecompositionContext {
  const requirement = {
    ...context.requirement,
    displayId: sanitizeExternalInline(context.requirement.displayId),
    name: sanitizeExternalInline(context.requirement.name),
    detail: sanitizeExternalText(context.requirement.detail),
    issueTypeName: sanitizeExternalInline(context.requirement.issueTypeName),
    statusName: sanitizeExternalInline(context.requirement.statusName),
    statusCategory: sanitizeExternalInline(context.requirement.statusCategory),
    projectName: context.requirement.projectName
      ? sanitizeExternalInline(context.requirement.projectName)
      : null,
    assigneeName: context.requirement.assigneeName
      ? sanitizeExternalInline(context.requirement.assigneeName)
      : null,
  }
  const sanitizeTask = (task: RequirementDecompositionContext['tasks'][number]) => ({
    ...task,
    displayId: sanitizeExternalInline(task.displayId),
    name: sanitizeExternalInline(task.name),
    detail: sanitizeExternalText(task.detail),
    statusName: sanitizeExternalInline(task.statusName),
    statusCategory: sanitizeExternalInline(task.statusCategory),
    assigneeName: task.assigneeName ? sanitizeExternalInline(task.assigneeName) : null,
  })
  const tasks = sortRequirementTasks(context.tasks.map(sanitizeTask))
  const pendingUuids = new Set(context.pendingTasks.map(task => task.uuid))
  return {
    decompositionRelation: context.decompositionRelation,
    requirement,
    tasks,
    pendingTasks: tasks.filter(task => pendingUuids.has(task.uuid)),
    baseline: context.baseline,
  }
}

function formatInspection(context: RequirementDecompositionContext): string {
  const lines = [
    `# ${context.requirement.displayId} ${context.requirement.name}`,
    '',
    `- **Type**: ${context.requirement.issueTypeName}`,
    `- **Status**: ${context.requirement.statusName} (${context.requirement.statusCategory})`,
    `- **Decomposition relation verified**: ${context.decompositionRelation.verified ? 'yes' : 'no'}`,
    `- **Related task candidates**: ${context.tasks.length}`,
    `- **Pending related task candidates**: ${context.pendingTasks.length}`,
    '- **Implementation order**: use pending tasks only; they are sorted by planned start, planned end, then Display ID, with unset dates last.',
    '- **Change safety**: compare requirement detail with every task name/detail before coding; warn on meaningful divergence and block affected work on a major mismatch.',
    '',
    '## Untrusted ONES Requirement Detail',
    '',
    UNTRUSTED_SOURCE_NOTICE,
    '',
    context.requirement.detail || '(No requirement detail)',
    '',
    context.decompositionRelation.verified
      ? '## Existing Requirement Decomposition'
      : '## Related Task Candidates (relationship unverified)',
    '',
  ]

  if (context.tasks.length === 0) {
    lines.push(context.decompositionRelation.verified
      ? 'No existing requirement decomposition tasks.'
      : 'No related task candidates were returned; the decomposition relationship is still unverified.')
  }
  else {
    for (const task of context.tasks) {
      lines.push(`### ${task.displayId} ${task.name}`)
      lines.push(`- Status: ${task.statusName} (${task.statusCategory})`)
      lines.push(`- Plan: ${task.planStartDate ?? 'unset'} → ${task.planEndDate ?? 'unset'}`)
      lines.push(`- Assignee: ${task.assigneeName ?? 'Unassigned'}`)
      lines.push('')
      lines.push(task.detail || '(No task detail)')
      lines.push('')
    }
  }

  return lines.join('\n')
}

function normalizedShortContent(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function buildOperations(
  displayId: string,
  tasks: PrepareRequirementDecompositionInput['tasks'],
): RequirementTaskCreateOperation[] {
  const seen = new Set<string>()
  return tasks.map((task) => {
    const shortContent = normalizedShortContent(task.shortContent)
    if (new RegExp(`^${displayId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(shortContent)) {
      throw new Error('shortContent must not repeat the requirement display ID')
    }
    const identity = shortContent.toLocaleLowerCase()
    if (seen.has(identity))
      throw new Error(`Duplicate decomposition task shortContent: "${shortContent}"`)
    seen.add(identity)
    return {
      operation: 'create' as const,
      title: `${displayId} ${shortContent}`,
      shortContent,
      detail: task.detail,
      ...(task.assigneeUuid ? { assigneeUuid: task.assigneeUuid } : {}),
      ...(task.priorityUuid ? { priorityUuid: task.priorityUuid } : {}),
      ...(task.complexityUuid ? { complexityUuid: task.complexityUuid } : {}),
      ...(task.splitTypeUuid ? { splitTypeUuid: task.splitTypeUuid } : {}),
      ...(task.productUuid ? { productUuid: task.productUuid } : {}),
      ...(task.moduleUuid ? { moduleUuid: task.moduleUuid } : {}),
      ...(task.estimatedHours !== undefined ? { estimatedHours: task.estimatedHours } : {}),
      ...(task.planStartDate ? { planStartDate: task.planStartDate } : {}),
      ...(task.planEndDate ? { planEndDate: task.planEndDate } : {}),
    }
  })
}

export async function handleInspectRequirementDecomposition(
  input: InspectRequirementDecompositionInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const { adapter } = resolveAdapter(input.source, adapters, defaultSource)
  const context = sanitizedContext(
    await adapter.getRequirementDecompositionContext({ requirementId: input.requirementId }),
  )
  return {
    content: [{ type: 'text' as const, text: formatInspection(context) }],
    structuredContent: context,
  }
}

export async function handlePrepareRequirementDecomposition(
  input: PrepareRequirementDecompositionInput,
  adapters: Map<string, BaseAdapter>,
  approvals: RequirementDecompositionApprovalStore,
  defaultSource?: string,
) {
  const { sourceType, adapter } = resolveAdapter(input.source, adapters, defaultSource)
  const context = await adapter.getRequirementDecompositionContext({ requirementId: input.requirementId })
  if (context.requirement.workItemKind !== 'requirement')
    throw new Error('Only requirements can be decomposed')
  if (!context.decompositionRelation.verified || !context.decompositionRelation.uuid) {
    throw new Error(
      'The "requirement decomposition task" relationship could not be verified from the read response. No plan or write was prepared.',
    )
  }
  if (context.requirement.statusCategory !== 'to_do' && context.requirement.statusCategory !== 'in_progress') {
    throw new Error(
      `Requirement ${context.requirement.displayId} is not pending (${context.requirement.statusName})`,
    )
  }
  if (context.tasks.length > 0) {
    throw new Error(
      `Requirement ${context.requirement.displayId} already has ${context.tasks.length} decomposition task(s). Inspect them; additions or edits require a separate explicit workflow.`,
    )
  }

  const operations = buildOperations(context.requirement.displayId, input.tasks)
  const planHash = buildRequirementDecompositionPlanHash({
    requirementUuid: context.requirement.uuid,
    decompositionRelation: context.decompositionRelation,
    baseline: context.baseline,
    operations,
  })
  const approval = approvals.create({
    source: sourceType,
    requirementId: input.requirementId,
    requirementUuid: context.requirement.uuid,
    decompositionRelation: context.decompositionRelation,
    baseline: context.baseline,
    operations,
    planHash,
  })
  const plan: RequirementDecompositionPlan = {
    requirement: sanitizedContext(context).requirement,
    decompositionRelation: context.decompositionRelation,
    operations,
    baseline: context.baseline,
    planHash,
    approvalToken: approval.token,
    expiresAt: new Date(approval.expiresAt).toISOString(),
  }
  return {
    content: [{
      type: 'text' as const,
      text: [
        `Prepared ${operations.length} create operation(s) for ${plan.requirement.displayId}.`,
        'No ONES create or edit request was sent.',
        'Show the exact operations to the user. Call apply_requirement_decomposition only after explicit confirmation.',
      ].join('\n'),
    }],
    structuredContent: plan,
  }
}

export async function handleApplyRequirementDecomposition(
  input: ApplyRequirementDecompositionInput,
  adapters: Map<string, BaseAdapter>,
  approvals: RequirementDecompositionApprovalStore,
  options: { defaultSource?: string, writesEnabled: boolean },
) {
  if (input.confirmed !== true)
    throw new Error('Explicit confirmation is required before applying a decomposition')
  if (!options.writesEnabled) {
    throw new Error(
      'Requirement decomposition writes are disabled. Enable both ONES_ENABLE_WRITES=true and the source requirementDecompositionWrites option only in an approved production deployment.',
    )
  }

  // Take the token synchronously before the first await. Concurrent calls can
  // never observe the same approval, even while the winner rechecks ONES state.
  const record = approvals.take(input.approvalToken)
  if (!record)
    throw new Error('Approval token is invalid, expired, or already used. Prepare the decomposition again.')
  const requestedSource = input.source ?? options.defaultSource
  if (requestedSource !== record.source)
    throw new Error('Approval token source does not match the requested source')
  if (input.planHash !== record.planHash)
    throw new Error('Plan hash does not match the approved decomposition')

  const { adapter } = resolveAdapter(record.source, adapters, options.defaultSource)
  const current = await adapter.getRequirementDecompositionContext({
    requirementId: record.requirementId,
  })
  if (current.requirement.uuid !== record.requirementUuid
    || !isSameRequirementBaseline(current.baseline, record.baseline)) {
    throw new Error('Requirement or related tasks changed after preparation. Prepare and confirm a new decomposition.')
  }
  if (!current.decompositionRelation.verified
    || current.decompositionRelation.uuid !== record.decompositionRelation.uuid) {
    throw new Error('The requirement decomposition relationship changed or is no longer verified. Prepare and confirm again.')
  }
  if (current.tasks.length > 0) {
    throw new Error('Requirement now has decomposition tasks. No create request was sent.')
  }

  const recomputedHash = buildRequirementDecompositionPlanHash({
    requirementUuid: record.requirementUuid,
    decompositionRelation: record.decompositionRelation,
    baseline: record.baseline,
    operations: record.operations,
  })
  if (recomputedHash !== record.planHash) {
    throw new Error('Stored decomposition plan failed integrity validation')
  }

  const result: ApplyRequirementDecompositionResult = await adapter.createRequirementDecomposition({
    requirementUuid: record.requirementUuid,
    decompositionRelation: record.decompositionRelation,
    baseline: record.baseline,
    planHash: record.planHash,
    operations: record.operations,
  })

  return {
    content: [{
      type: 'text' as const,
      text: `Created ${result.createdTasks.length} requirement decomposition task(s).`,
    }],
    structuredContent: result,
  }
}
