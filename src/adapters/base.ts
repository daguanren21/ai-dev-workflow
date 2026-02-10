import type { SourceConfig } from '../types/config.js'
import type { Requirement, SearchResult, SourceType } from '../types/requirement.js'

export interface GetRequirementParams {
  id: string
}

export interface SearchRequirementsParams {
  query: string
  page?: number
  pageSize?: number
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
}
