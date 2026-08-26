import type { SourceConfig } from '../types/config'
import type { AddManhourResult, ApplyRequirementDecompositionResult, IssueDetail, PendingWorkItemsResult, RelatedIssue, Requirement, RequirementDecompositionBaseline, RequirementDecompositionContext, RequirementDecompositionRelation, RequirementTaskCreateOperation, SearchResult, SourceType, TestCaseResult, UpdateTaskPlanDatesResult } from '../types/requirement'
import type { WikiCreateRequest, WikiDeleteRequest, WikiDeleteResult, WikiPage, WikiPageChildrenParams, WikiPageLocator, WikiPageSearchParams, WikiPageSummary, WikiPathResolution, WikiPathResolveParams, WikiUpdateRequest, WikiWriteResult } from '../types/wiki'
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
  protected readonly resolvedOpenApiAuth?: Record<string, string>

  constructor(
    sourceType: SourceType,
    config: SourceConfig,
    resolvedAuth: Record<string, string>,
    resolvedOpenApiAuth?: Record<string, string>,
  ) {
    this.sourceType = sourceType
    this.config = config
    this.resolvedAuth = resolvedAuth
    this.resolvedOpenApiAuth = resolvedOpenApiAuth
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

  /** Read one Wiki page. Adapters without Wiki support fail closed. */
  async getWikiPage(_params: WikiPageLocator): Promise<WikiPage> {
    throw new Error(`${this.sourceType}: Wiki page reads are not supported`)
  }

  /** Search Wiki metadata. This must never fall back to guessing an endpoint. */
  async searchWikiPages(_params: WikiPageSearchParams): Promise<WikiPageSummary[]> {
    throw new Error(`${this.sourceType}: Wiki search endpoint is not verified`)
  }

  /** List direct Wiki children. This must never infer a tree from unrelated links. */
  async listWikiPageChildren(_params: WikiPageChildrenParams): Promise<WikiPageSummary[]> {
    throw new Error(`${this.sourceType}: Wiki tree endpoint is not verified`)
  }

  /** Resolve a breadcrumb path and reject missing or ambiguous matches. */
  async resolveWikiPath(_params: WikiPathResolveParams): Promise<WikiPathResolution> {
    throw new Error(`${this.sourceType}: Wiki path resolution is not supported`)
  }

  /** Production Wiki writes stay disabled until the exact provider endpoint is verified. */
  async createWikiPage(_params: WikiCreateRequest): Promise<WikiWriteResult> {
    throw new Error(`${this.sourceType}: Wiki create endpoint is not verified`)
  }

  /** Production Wiki writes stay disabled until the exact provider endpoint is verified. */
  async updateWikiPage(_params: WikiUpdateRequest): Promise<WikiWriteResult> {
    throw new Error(`${this.sourceType}: Wiki update endpoint is not verified`)
  }

  /** Production Wiki deletes stay disabled until the exact provider endpoint is verified. */
  async deleteWikiPage(_params: WikiDeleteRequest): Promise<WikiDeleteResult> {
    throw new Error(`${this.sourceType}: Wiki delete endpoint is not verified`)
  }
}
