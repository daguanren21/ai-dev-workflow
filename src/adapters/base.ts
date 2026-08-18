import type { SourceConfig } from '../types/config'
import type { AddManhourResult, ApplyRequirementDecompositionResult, IssueDetail, PendingWorkItemsResult, RelatedIssue, Requirement, RequirementDecompositionBaseline, RequirementDecompositionContext, RequirementDecompositionRelation, RequirementTaskCreateOperation, SearchResult, SourceType, TestCaseResult, UpdateTaskPlanDatesResult } from '../types/requirement'
import type { RemoteImageTrust } from '../utils/safe-image'

export interface GetRequirementParams {
  id: string
}

export interface SearchRequirementsParams {
  query: string
  page?: number
  pageSize?: number
}

export interface GetRelatedIssuesParams {
  taskId: string
}

export interface GetIssueDetailParams {
  issueId: string
}

export interface GetTestcasesParams {
  taskNumber: number
  libraryUuid?: string
}

export interface AddManhourParams {
  taskId: string
  hours: number
  description: string
  date?: string
}

export interface UpdateTaskPlanDatesParams {
  taskId: string
  planStartDate?: string
  planEndDate?: string
}

export interface GetRequirementDecompositionContextParams {
  requirementId: string
}

export interface CreateRequirementDecompositionParams {
  requirementUuid: string
  decompositionRelation: RequirementDecompositionRelation
  /** Expected pre-write version/hash snapshot for conditional mutation. */
  baseline: RequirementDecompositionBaseline
  /** Stable idempotency key for the exact approved payload. */
  planHash: string
  operations: RequirementTaskCreateOperation[]
}

/**
 * Abstract base class for source adapters.
 * Each adapter implements platform-specific logic for fetching requirements.
 */
export abstract class BaseAdapter {
  readonly sourceType: SourceType
  protected readonly config: SourceConfig
  protected readonly resolvedAuth: Record<string, string>

  constructor(
    sourceType: SourceType,
    config: SourceConfig,
    resolvedAuth: Record<string, string>,
  ) {
    this.sourceType = sourceType
    this.config = config
    this.resolvedAuth = resolvedAuth
  }

  classifyRemoteImageUrl(url: string): RemoteImageTrust {
    try {
      return new URL(url).origin === new URL(this.config.apiBase).origin
        ? 'configured-origin'
        : 'untrusted'
    }
    catch {
      return 'untrusted'
    }
  }

  /**
   * Fetch a single requirement by its ID.
   */
  abstract getRequirement(params: GetRequirementParams): Promise<Requirement>

  /**
   * Search requirements by query string.
   */
  abstract searchRequirements(params: SearchRequirementsParams): Promise<SearchResult>

  /** List current-user requirements and tasks that are not started or in progress. */
  abstract listPendingWorkItems(): Promise<PendingWorkItemsResult>

  abstract getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]>

  abstract getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail>

  abstract getTestcases(params: GetTestcasesParams): Promise<TestCaseResult>

  abstract addManhour(params: AddManhourParams): Promise<AddManhourResult>

  abstract updateTaskPlanDates(params: UpdateTaskPlanDatesParams): Promise<UpdateTaskPlanDatesResult>

  abstract getRequirementDecompositionContext(
    params: GetRequirementDecompositionContextParams,
  ): Promise<RequirementDecompositionContext>

  abstract createRequirementDecomposition(
    params: CreateRequirementDecompositionParams,
  ): Promise<ApplyRequirementDecompositionResult>
}
