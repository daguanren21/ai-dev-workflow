import type { SourceType } from '../types/requirement.js'
import type { SourceConfig } from '../types/config.js'
import { BaseAdapter } from './base.js'
import { OnesAdapter } from './ones.js'
import { JiraAdapter } from './jira.js'
import { GitHubAdapter } from './github.js'

const ADAPTER_MAP: Record<string, new (
  sourceType: SourceType,
  config: SourceConfig,
  resolvedAuth: Record<string, string>,
) => BaseAdapter> = {
  ones: OnesAdapter,
  jira: JiraAdapter,
  github: GitHubAdapter,
}

/**
 * Factory function to create the appropriate adapter based on source type.
 */
export function createAdapter(
  sourceType: SourceType,
  config: SourceConfig,
  resolvedAuth: Record<string, string>,
): BaseAdapter {
  const AdapterClass = ADAPTER_MAP[sourceType]
  if (!AdapterClass) {
    throw new Error(
      `Unsupported source type: "${sourceType}". Supported: ${Object.keys(ADAPTER_MAP).join(', ')}`,
    )
  }
  return new AdapterClass(sourceType, config, resolvedAuth)
}

export { BaseAdapter } from './base.js'
export { OnesAdapter } from './ones.js'
export { JiraAdapter } from './jira.js'
export { GitHubAdapter } from './github.js'
