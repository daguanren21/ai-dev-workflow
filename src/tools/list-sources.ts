import type { BaseAdapter } from '../adapters/base.js'
import type { McpConfig } from '../types/config.js'

export async function handleListSources(
  adapters: Map<string, BaseAdapter>,
  config: McpConfig,
) {
  const lines = ['# Configured Sources', '']

  if (adapters.size === 0) {
    lines.push('No sources configured.')
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    }
  }

  for (const type of adapters.keys()) {
    const isDefault = config.defaultSource === type
    lines.push(`## ${type}${isDefault ? ' (default)' : ''}`)
    lines.push('- **Status**: configured')
    lines.push('')
  }

  if (config.defaultSource) {
    lines.push(`> Default source: **${config.defaultSource}**`)
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  }
}
