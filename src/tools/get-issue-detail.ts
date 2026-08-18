import type { BaseAdapter } from '../adapters/base'
import type { IssueDetail } from '../types/requirement'
import { z } from 'zod/v4'
import { sanitizeExternalInline, sanitizeExternalText, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content'
import { downloadTrustedImages } from '../utils/safe-image'

export const GetIssueDetailSchema = z.object({
  issueId: z.string().describe('ONES defect UUID, task key, number, or display ID (for example "DEMO-2001")'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetIssueDetailInput = z.infer<typeof GetIssueDetailSchema>

/**
 * Extract image URLs from HTML string.
 */
function extractImageUrls(html: string): string[] {
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
  return Array.from(html.matchAll(imgRegex), m => m[1])
    .map(url => url.replace(/&amp;/g, '&'))
}

export async function handleGetIssueDetail(
  input: GetIssueDetailInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const sourceType = input.source ?? defaultSource
  if (!sourceType) {
    throw new Error('No source specified and no default source configured')
  }

  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }

  const detail = await adapter.getIssueDetail({ issueId: input.issueId })

  const imageUrls = detail.descriptionRich ? extractImageUrls(detail.descriptionRich) : []
  const imageResults = await downloadTrustedImages(imageUrls, {
    classifyUrl: url => adapter.classifyRemoteImageUrl(url),
  })

  // Build MCP content: text first, then embedded images
  const content: Array<{ type: 'text', text: string } | { type: 'image', data: string, mimeType: string }> = [
    { type: 'text' as const, text: formatIssueDetail(detail) },
  ]

  for (let i = 0; i < imageResults.length; i++) {
    const img = imageResults[i]
    if (img) {
      content.push({
        type: 'image' as const,
        data: img.base64,
        mimeType: img.mimeType,
      })
    }
  }

  return { content }
}

function formatIssueDetail(detail: IssueDetail): string {
  const description = sanitizeExternalText(
    detail.descriptionText || detail.description || detail.descriptionRich,
  )
  const lines = [
    `# ${sanitizeExternalInline(detail.name)}`,
    '',
    `- **Key**: ${sanitizeExternalInline(detail.key)}`,
    `- **UUID**: ${sanitizeExternalInline(detail.uuid)}`,
    `- **Type**: ${sanitizeExternalInline(detail.issueTypeName)}`,
    `- **Status**: ${sanitizeExternalInline(detail.statusName)} (${sanitizeExternalInline(detail.statusCategory)})`,
    `- **Priority**: ${sanitizeExternalInline(detail.priorityValue ?? 'N/A')}`,
    `- **Severity**: ${sanitizeExternalInline(detail.severityLevel ?? 'N/A')}`,
    `- **Assignee**: ${sanitizeExternalInline(detail.assignName ?? 'Unassigned')}`,
    `- **Owner**: ${sanitizeExternalInline(detail.ownerName ?? 'Unknown')}`,
    `- **Solver**: ${sanitizeExternalInline(detail.solverName ?? 'Unassigned')}`,
  ]

  if (detail.projectName)
    lines.push(`- **Project**: ${sanitizeExternalInline(detail.projectName)}`)
  if (detail.sprintName)
    lines.push(`- **Sprint**: ${sanitizeExternalInline(detail.sprintName)}`)
  if (detail.deadline)
    lines.push(`- **Deadline**: ${sanitizeExternalInline(detail.deadline)}`)

  lines.push(
    '',
    '## Untrusted ONES Description',
    '',
    UNTRUSTED_SOURCE_NOTICE,
    '',
    description || '_No description_',
  )

  return lines.join('\n')
}
