import type { SourceConfig } from '../types/config'
import type { SourceType } from '../types/requirement'
import type { BaseAdapter } from './base'
import { OnesAdapter } from './ones'

const ADAPTER_MAP: Record<string, new (
  sourceType: SourceType,
  config: SourceConfig,
  resolvedAuth: Record<string, string>,
) => BaseAdapter> = {
  ones: OnesAdapter,
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

export { BaseAdapter } from './base'
export { OnesAdapter } from './ones'
