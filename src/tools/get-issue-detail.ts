import type { BaseAdapter } from '../adapters/base.js'
import type { IssueDetail } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetIssueDetailSchema = z.object({
  issueId: z.string().describe('The issue task ID or key (e.g. "6W9vW3y8J9DO66Pu" or "task-6W9vW3y8J9DO66Pu")'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetIssueDetailInput = z.infer<typeof GetIssueDetailSchema>

/**
 * Download an image from URL and return as base64 data URI.
 * Returns null if download fails.
 */
async function downloadImageAsBase64(url: string): Promise<{ base64: string, mimeType: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok)
      return null

    const contentType = res.headers.get('content-type') ?? 'image/png'
    const mimeType = contentType.split(';')[0].trim()
    const buffer = Buffer.from(await res.arrayBuffer())
    return { base64: buffer.toString('base64'), mimeType }
  }
  catch {
    return null
  }
}

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

  // Extract and download images from description
  const imageUrls = detail.descriptionRich ? extractImageUrls(detail.descriptionRich) : []
  const imageResults = await Promise.all(imageUrls.map(url => downloadImageAsBase64(url)))

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
  const lines = [
    `# ${detail.name}`,
    '',
    `- **Key**: ${detail.key}`,
    `- **UUID**: ${detail.uuid}`,
    `- **Type**: ${detail.issueTypeName}`,
    `- **Status**: ${detail.statusName} (${detail.statusCategory})`,
    `- **Priority**: ${detail.priorityValue ?? 'N/A'}`,
    `- **Severity**: ${detail.severityLevel ?? 'N/A'}`,
    `- **Assignee**: ${detail.assignName ?? 'Unassigned'}`,
    `- **Owner**: ${detail.ownerName ?? 'Unknown'}`,
    `- **Solver**: ${detail.solverName ?? 'Unassigned'}`,
  ]

  if (detail.projectName)
    lines.push(`- **Project**: ${detail.projectName}`)
  if (detail.sprintName)
    lines.push(`- **Sprint**: ${detail.sprintName}`)
  if (detail.deadline)
    lines.push(`- **Deadline**: ${detail.deadline}`)

  lines.push('', '## Description', '')
  if (detail.descriptionRich) {
    lines.push(detail.descriptionRich)
  }
  else if (detail.descriptionText) {
    lines.push(detail.descriptionText)
  }
  else {
    lines.push('_No description_')
  }

  return lines.join('\n')
}
