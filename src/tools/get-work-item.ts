import type { BaseAdapter } from '../adapters/base.js'
import type { Attachment, Requirement } from '../types/requirement.js'
import { z } from 'zod/v4'
import { sanitizeExternalInline, sanitizeExternalText, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content.js'
import { downloadTrustedImages } from '../utils/safe-image.js'

export const GetWorkItemSchema = z.object({
  id: z.string().describe('ONES work-item ID, task number, displayId, or wiki page URL'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetWorkItemInput = z.infer<typeof GetWorkItemSchema>

type McpContent
  = | { type: 'text', text: string }
    | { type: 'image', data: string, mimeType: string }

function isImageAttachment(attachment: Attachment): boolean {
  const mimeType = attachment.mimeType.toLowerCase()
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType))
    return true

  return /\.(?:png|jpe?g|gif|webp)(?:[?#]|$)/i.test(attachment.url)
}

export async function handleGetWorkItem(
  input: GetWorkItemInput,
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

  const requirement = await adapter.getRequirement({ id: input.id })
  const imageUrls = requirement.attachments
    .filter(isImageAttachment)
    .map(attachment => attachment.url)
  const imageResults = await downloadTrustedImages(imageUrls, {
    classifyUrl: url => adapter.classifyRemoteImageUrl(url),
  })

  const content: McpContent[] = [
    {
      type: 'text' as const,
      text: formatWorkItem(requirement),
    },
  ]

  for (const image of imageResults) {
    if (!image)
      continue

    content.push({
      type: 'image' as const,
      data: image.base64,
      mimeType: image.mimeType,
    })
  }

  return {
    content,
  }
}

function formatWorkItem(req: Requirement): string {
  const lines = [
    `# ${sanitizeExternalInline(req.title)}`,
    '',
    `- **ID**: ${sanitizeExternalInline(req.id)}`,
    `- **Source**: ${sanitizeExternalInline(req.source)}`,
    `- **Status**: ${sanitizeExternalInline(req.status)}`,
    `- **Priority**: ${sanitizeExternalInline(req.priority)}`,
    `- **Type**: ${sanitizeExternalInline(req.type)}`,
    `- **Assignee**: ${sanitizeExternalInline(req.assignee ?? 'Unassigned')}`,
    `- **Reporter**: ${sanitizeExternalInline(req.reporter || 'Unknown')}`,
  ]

  if (req.createdAt)
    lines.push(`- **Created**: ${sanitizeExternalInline(req.createdAt)}`)
  if (req.updatedAt)
    lines.push(`- **Updated**: ${sanitizeExternalInline(req.updatedAt)}`)
  if (req.dueDate)
    lines.push(`- **Due**: ${sanitizeExternalInline(req.dueDate)}`)
  if (req.labels.length > 0)
    lines.push(`- **Labels**: ${req.labels.map(sanitizeExternalInline).join(', ')}`)

  lines.push(
    '',
    '## Untrusted ONES Description',
    '',
    UNTRUSTED_SOURCE_NOTICE,
    '',
    sanitizeExternalText(req.description) || '_No description_',
  )

  if (req.attachments.length > 0) {
    lines.push('', '## Attachments')
    for (const attachment of req.attachments) {
      lines.push(
        `- ${sanitizeExternalInline(attachment.name)} `
        + `(${sanitizeExternalInline(attachment.mimeType)}, ${attachment.size} bytes; URL omitted)`,
      )
    }
  }

  return lines.join('\n')
}
