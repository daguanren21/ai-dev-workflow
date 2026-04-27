import type { BaseAdapter } from '../adapters/base.js'
import type { Attachment, Requirement } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetRequirementSchema = z.object({
  id: z.string().describe('The requirement/issue ID'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetRequirementInput = z.infer<typeof GetRequirementSchema>

type McpContent
  = | { type: 'text', text: string }
    | { type: 'image', data: string, mimeType: string }

async function downloadImageAsBase64(url: string, fallbackMimeType = 'image/png'): Promise<{ base64: string, mimeType: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok)
      return null

    const contentType = res.headers.get('content-type') ?? fallbackMimeType
    const mimeType = contentType.split(';')[0].trim() || fallbackMimeType
    const buffer = Buffer.from(await res.arrayBuffer())
    return { base64: buffer.toString('base64'), mimeType }
  }
  catch {
    return null
  }
}

function isImageAttachment(attachment: Attachment): boolean {
  if (attachment.mimeType.startsWith('image/'))
    return true

  return /\.(?:png|jpe?g|gif|webp|svg)$/i.test(attachment.url)
}

function displayAttachmentUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  }
  catch {
    return url.replace(/[?#].*$/, '')
  }
}

export async function handleGetRequirement(
  input: GetRequirementInput,
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
  const imageAttachments = requirement.attachments.filter(isImageAttachment)
  const imageResults = await Promise.all(
    imageAttachments.map(attachment => downloadImageAsBase64(attachment.url, attachment.mimeType)),
  )

  const content: McpContent[] = [
    {
      type: 'text' as const,
      text: formatRequirement(requirement),
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

function formatRequirement(req: Requirement): string {
  const lines = [
    `# ${req.title}`,
    '',
    `- **ID**: ${req.id}`,
    `- **Source**: ${req.source}`,
    `- **Status**: ${req.status}`,
    `- **Priority**: ${req.priority}`,
    `- **Type**: ${req.type}`,
    `- **Assignee**: ${req.assignee ?? 'Unassigned'}`,
    `- **Reporter**: ${req.reporter || 'Unknown'}`,
  ]

  if (req.createdAt) {
    lines.push(`- **Created**: ${req.createdAt}`)
  }
  if (req.updatedAt) {
    lines.push(`- **Updated**: ${req.updatedAt}`)
  }

  if (req.dueDate) {
    lines.push(`- **Due**: ${req.dueDate}`)
  }

  if (req.labels.length > 0) {
    lines.push(`- **Labels**: ${req.labels.join(', ')}`)
  }

  lines.push('', '## Description', '', req.description || '_No description_')

  if (req.attachments.length > 0) {
    lines.push('', '## Attachments')
    for (const att of req.attachments) {
      lines.push(`- [${att.name}](${displayAttachmentUrl(att.url)}) (${att.mimeType}, ${att.size} bytes)`)
    }
  }

  return lines.join('\n')
}
