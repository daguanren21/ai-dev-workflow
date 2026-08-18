import type { RequirementDecompositionBaseline, RequirementDecompositionContext, RequirementDecompositionRelation, RequirementDecompositionTask, RequirementTaskCreateOperation } from '../types/requirement'
import { createHash } from 'node:crypto'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonicalize)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    )
  }

  return value
}

export function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

function compareNullableDate(left: string | null, right: string | null): number {
  if (left === right)
    return 0
  if (left === null)
    return 1
  if (right === null)
    return -1
  return left.localeCompare(right)
}

export function sortRequirementTasks(tasks: RequirementDecompositionTask[]): RequirementDecompositionTask[] {
  return [...tasks].sort((left, right) =>
    compareNullableDate(left.planStartDate, right.planStartDate)
    || compareNullableDate(left.planEndDate, right.planEndDate)
    || left.displayId.localeCompare(right.displayId))
}

export function buildRequirementDecompositionBaseline(
  requirement: RequirementDecompositionContext['requirement'],
  tasks: RequirementDecompositionTask[],
  metadata: { version?: string | null, updatedAt?: string | null } = {},
): RequirementDecompositionBaseline {
  return {
    requirementVersion: metadata.version ?? null,
    requirementUpdatedAt: metadata.updatedAt ?? null,
    requirementHash: stableHash(requirement),
    relatedTasksHash: stableHash(tasks),
  }
}

export function buildRequirementDecompositionPlanHash(input: {
  requirementUuid: string
  decompositionRelation: RequirementDecompositionRelation
  baseline: RequirementDecompositionBaseline
  operations: RequirementTaskCreateOperation[]
}): string {
  return stableHash(input)
}

export function isSameRequirementBaseline(
  left: RequirementDecompositionBaseline,
  right: RequirementDecompositionBaseline,
): boolean {
  return left.requirementVersion === right.requirementVersion
    && left.requirementUpdatedAt === right.requirementUpdatedAt
    && left.requirementHash === right.requirementHash
    && left.relatedTasksHash === right.relatedTasksHash
}
