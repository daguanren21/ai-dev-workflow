import type { SourceConfig } from '../types/config.js'
import type { IssueDetail, RelatedIssue, Requirement, SearchResult, SourceType, TestCaseResult } from '../types/requirement.js'

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

  /**
   * Fetch a single requirement by its ID.
   */
  abstract getRequirement(params: GetRequirementParams): Promise<Requirement>

  /**
   * Search requirements by query string.
   */
  abstract searchRequirements(params: SearchRequirementsParams): Promise<SearchResult>

  abstract getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]>

  abstract getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail>

  abstract getTestcases(params: GetTestcasesParams): Promise<TestCaseResult>
}
