import type { Attachment, Requirement } from '../../types/requirement'
import type { OnesWorkItemKind } from '../../utils/ones-issue-kind'
import type { RemoteImageTrust } from '../../utils/safe-image'
import type { OnesRelatedActivity, OnesSession, OnesTaskNode } from './types'
import type { OnesWikiReader } from './wiki-reader'
import { workItemKindLabel } from '../../utils/ones-issue-kind'
import { getTaskDetailText, parseDisplayId, toRequirement } from './task-helpers'
import { attachmentNameFromPath, mimeTypeFromFileName } from './wiki-document'
import { parseOnesWikiPageRoute } from './wiki-reader'

interface HtmlImageReference {
  tag: string
  src: string
  resourceUuid: string
}

function extractHtmlImageReferences(html: string): HtmlImageReference[] {
  return Array.from(html.matchAll(/<img\b[^>]*>/gi), (match) => {
    const tag = match[0]
    const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
    const resourceMatch = tag.match(/\bdata-uuid\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
    return {
      tag,
      src: (srcMatch?.[1] ?? srcMatch?.[2] ?? '').replace(/&amp;/gi, '&').trim(),
      resourceUuid: (resourceMatch?.[1] ?? resourceMatch?.[2] ?? '').trim(),
    }
  })
}

function containsInlineTaskImages(task: OnesTaskNode): boolean {
  return [task.description, task.desc_rich].some(value => typeof value === 'string' && /<img\b/i.test(value))
    || /\[(?:image|图片)\]/i.test(task.descriptionText ?? '')
}

function extractWikiPageUuidsFromText(text: string, apiBase: string): string[] {
  if (!text)
    return []
  const uuids = new Set<string>()
  const configuredOrigin = new URL(apiBase).origin
  const absoluteRanges: Array<{ start: number, end: number }> = []
  const collect = (candidate: string) => {
    try {
      const absolute = new URL(candidate.replace(/&amp;/g, '&'), apiBase)
      if (absolute.origin !== configuredOrigin)
        return
      const route = parseOnesWikiPageRoute(candidate)
      if (route)
        uuids.add(route.wikiUuid)
    }
    catch {
      // Ignore malformed source links. They are untrusted content.
    }
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const start = match.index!
    absoluteRanges.push({ start, end: start + match[0].length })
    collect(match[0])
  }
  for (const match of text.matchAll(/\/wiki(?:\/|(?=[#?]))[^\s<>"']+/gi)) {
    const start = match.index!
    if (!absoluteRanges.some(range => start >= range.start && start < range.end))
      collect(match[0])
  }
  return [...uuids]
}

function decodeOnesPathIdentifier(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment)
    return /^[\w-]{1,128}$/.test(decoded) ? decoded : null
  }
  catch {
    return null
  }
}

function encodeOnesPathIdentifier(value: string, label: string): string {
  if (!/^[\w-]{1,128}$/.test(value))
    throw new Error(`ONES: Invalid ${label}`)
  return encodeURIComponent(value)
}

export interface OnesTaskContentOptions {
  apiBase: string
  wikiReader: OnesWikiReader
  fetchTaskInfo: (taskUuid: string) => Promise<Record<string, unknown>>
  fetchRelatedActivities: (taskKey: string) => Promise<OnesRelatedActivity[]>
  getSession: () => Promise<OnesSession>
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>
  classifyRemoteImageUrl: (url: string) => RemoteImageTrust
  rememberSourceIssuedImageUrl: (url: string) => string | null
}

export class OnesTaskContent {
  constructor(private readonly options: OnesTaskContentOptions) {}

  async refreshImageUrls(html: string): Promise<string> {
    return this.refreshImageUrlsWithCache(html, new Map())
  }

  private async refreshImageUrlsWithCache(
    html: string,
    freshUrlCache: Map<string, Promise<string | null>>,
  ): Promise<string> {
    if (!html)
      return html
    const images = extractHtmlImageReferences(html).flatMap((image) => {
      const resourceUuid = this.getAttachmentResourceUuid(image)
      return resourceUuid ? [{ image, resourceUuid }] : []
    })
    if (images.length === 0)
      return html
    const replacements = await Promise.all(images.map(async ({ image, resourceUuid }) => {
      let freshUrl = freshUrlCache.get(resourceUuid)
      if (!freshUrl) {
        freshUrl = this.resolveAttachmentUrl(resourceUuid)
        freshUrlCache.set(resourceUuid, freshUrl)
      }
      return { fullMatch: image.tag, freshUrl: await freshUrl }
    }))
    let result = html
    for (const { fullMatch, freshUrl } of replacements) {
      if (!freshUrl)
        continue
      const updatedImg = /\bsrc\s*=/i.test(fullMatch)
        ? fullMatch.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i, `src="${freshUrl}"`)
        : fullMatch.replace(/<img\b/i, `<img src="${freshUrl}"`)
      result = result.replace(fullMatch, updatedImg)
    }
    return result
  }

  private getAttachmentResourceUuid(image: HtmlImageReference): string {
    if (image.src) {
      try {
        const source = new URL(image.src, this.options.apiBase)
        if (source.origin === new URL(this.options.apiBase).origin) {
          const match = source.pathname.match(/\/res\/attachment\/([^/]+)$/)
          const resourceUuid = match?.[1] ? decodeOnesPathIdentifier(match[1]) : null
          if (resourceUuid)
            return resourceUuid
        }
      }
      catch {
        // Fall back to data-uuid for non-URL or legacy image sources.
      }
    }
    return image.resourceUuid
  }

  private async resolveAttachmentUrl(resourceUuid: string): Promise<string | null> {
    let encodedResourceUuid: string
    try {
      encodedResourceUuid = encodeOnesPathIdentifier(resourceUuid, 'attachment resource UUID')
    }
    catch {
      return null
    }
    const session = await this.options.getSession()
    const teamUuid = encodeOnesPathIdentifier(session.teamUuid, 'team UUID')
    const path = `/project/api/project/team/${teamUuid}/res/attachment/${encodedResourceUuid}?op=${encodeURIComponent('imageMogr2/auto-orient')}`
    try {
      const manualRes = await this.options.authorizedFetch(path, { redirect: 'manual' })
      if (manualRes.status === 302 || manualRes.status === 301) {
        const location = manualRes.headers.get('location')
        if (location)
          return this.options.rememberSourceIssuedImageUrl(location)
      }
      const followRes = await this.options.authorizedFetch(path, { redirect: 'follow' })
      const requestUrl = new URL(path, this.options.apiBase).toString()
      if (followRes.url && followRes.url !== requestUrl)
        return this.options.rememberSourceIssuedImageUrl(followRes.url)
      if (followRes.ok) {
        const text = await followRes.text()
        if (text.startsWith('http'))
          return this.options.rememberSourceIssuedImageUrl(text.trim())
        try {
          const data = JSON.parse(text) as { url?: string }
          return data.url ? this.options.rememberSourceIssuedImageUrl(data.url) : null
        }
        catch {
          return null
        }
      }
      return null
    }
    catch {
      return null
    }
  }

  async getFreshTaskDescriptions(
    task: Pick<OnesTaskNode, 'uuid' | 'description' | 'desc_rich'>,
  ): Promise<{ description: string, descriptionRich: string }> {
    const taskInfo = await this.options.fetchTaskInfo(task.uuid)
    const rawDescription = typeof taskInfo.desc === 'string' ? taskInfo.desc : task.description ?? ''
    const rawDescriptionRich = typeof taskInfo.desc_rich === 'string'
      ? taskInfo.desc_rich
      : task.desc_rich ?? task.description ?? ''
    const cache = new Map<string, Promise<string | null>>()
    const [description, descriptionRich] = await Promise.all([
      this.refreshImageUrlsWithCache(rawDescription, cache),
      this.refreshImageUrlsWithCache(rawDescriptionRich, cache),
    ])
    return { description, descriptionRich }
  }

  private async getTaskImageAttachments(task: OnesTaskNode): Promise<Attachment[]> {
    const { description, descriptionRich } = await this.getFreshTaskDescriptions(task)
    const images = [...extractHtmlImageReferences(descriptionRich), ...extractHtmlImageReferences(description)]
    const seen = new Set<string>()
    const attachments: Attachment[] = []
    for (const image of images) {
      if (!image.src)
        continue
      let url: string
      try {
        url = new URL(image.src, this.options.apiBase).toString()
      }
      catch {
        continue
      }
      if (this.options.classifyRemoteImageUrl(url) === 'untrusted')
        continue
      const identity = image.resourceUuid || url
      if (seen.has(identity))
        continue
      seen.add(identity)
      const pathname = new URL(url).pathname
      const pathName = attachmentNameFromPath(pathname)
      attachments.push({
        id: image.resourceUuid || `${task.uuid}-image-${attachments.length + 1}`,
        name: pathName && pathName !== '/' ? pathName : `image-${attachments.length + 1}.png`,
        url,
        mimeType: mimeTypeFromFileName(pathname),
        size: 0,
      })
    }
    return attachments
  }

  async buildRequirementDocument(inputId: string, taskKey: string, task: OnesTaskNode): Promise<Requirement> {
    const relatedActivities = parseDisplayId(inputId.trim())
      ? await this.options.fetchRelatedActivities(taskKey)
      : []
    const wikiRefs = new Map<string, { title: string, uuid: string }>()
    for (const wiki of task.relatedWikiPages ?? []) {
      if (!wiki.errorMessage)
        wikiRefs.set(wiki.uuid, { title: wiki.title, uuid: wiki.uuid })
    }
    const detailForLinks = [task.description, task.descriptionText, task.desc_rich].filter(Boolean).join('\n')
    for (const wikiUuid of extractWikiPageUuidsFromText(detailForLinks, this.options.apiBase)) {
      if (!wikiRefs.has(wikiUuid))
        wikiRefs.set(wikiUuid, { title: `Wiki ${wikiUuid}`, uuid: wikiUuid })
    }
    const [wikiContents, taskImageAttachments] = await Promise.all([
      Promise.all([...wikiRefs.values()].map(async (wiki) => {
        const rendered = await this.options.wikiReader.fetchContent(wiki.uuid)
        return { ...wiki, content: rendered.content, attachments: rendered.attachments }
      })),
      containsInlineTaskImages(task) ? this.getTaskImageAttachments(task) : Promise.resolve([]),
    ])

    const parts = [
      `# #${task.number} ${task.name}`,
      '',
      `- **Type**: ${task.issueType?.name ?? 'Unknown'}`,
      '- **Work Item Kind**: requirement',
      `- **Status**: ${task.status?.name ?? 'Unknown'}`,
      `- **Assignee**: ${task.assign?.name ?? 'Unassigned'}`,
    ]
    if (task.owner?.name)
      parts.push(`- **Owner**: ${task.owner.name}`)
    if (task.project?.name)
      parts.push(`- **Project**: ${task.project.name}`)
    parts.push(`- **UUID**: ${task.uuid}`)
    if (task.relatedTasks?.length) {
      parts.push('', '## Related Tasks')
      for (const related of task.relatedTasks)
        parts.push(`- #${related.number} ${related.name} [${related.issueType?.name}] (${related.status?.name}) — ${related.assign?.name ?? 'Unassigned'}`)
    }
    if (relatedActivities.length) {
      parts.push('', '## Related Work Items')
      for (const activity of relatedActivities) {
        const details = [
          `UUID: ${activity.uuid}`,
          activity.projectUUID ? `Project: ${activity.projectUUID}` : null,
          activity.relatedChild ? `Relation: ${activity.relatedChild}` : null,
        ].filter(Boolean)
        parts.push(`- ${activity.name} (${details.join(', ')})`)
      }
    }
    if (task.parent?.uuid) {
      parts.push('', '## Parent Task', `- UUID: ${task.parent.uuid}`)
      if (task.parent.number)
        parts.push(`- Number: #${task.parent.number}`)
    }
    if (wikiContents.length > 0) {
      parts.push('', '---', '', '## Requirement Documents')
      for (const wiki of wikiContents)
        parts.push('', `### ${wiki.title}`, '', wiki.content || '(No content available)')
    }
    const detailText = getTaskDetailText(task)
    const hasWikiContent = wikiContents.some(wiki => wiki.content.trim())
    if (detailText && !hasWikiContent)
      parts.push('', '---', '', '## Requirement Detail', '', detailText)
    const requirement = toRequirement(task, parts.join('\n'), [
      ...wikiContents.flatMap(wiki => wiki.attachments),
      ...taskImageAttachments,
    ])
    requirement.raw = {
      ...requirement.raw,
      relatedActivities,
      workItemKind: 'requirement',
      sourceDescription: hasWikiContent
        ? wikiContents.map(wiki => wiki.content).filter(Boolean).join('\n\n')
        : detailText,
      hasSourceDescription: hasWikiContent || Boolean(detailText),
      hasRequirementDocuments: hasWikiContent,
      relatedTaskCount: task.relatedTasks?.length ?? 0,
    }
    return requirement
  }

  buildWorkItemSummary(task: OnesTaskNode, kind: OnesWorkItemKind): Requirement {
    const nextTool = kind === 'defect' ? 'get_issue_detail' : 'get_related_issues / get_testcases'
    const parts = [
      `# #${task.number} ${task.name}`,
      '',
      `- **Type**: ${task.subIssueType?.name ?? task.issueType?.name ?? 'Unknown'}`,
      `- **Work Item Kind**: ${kind}`,
      `- **Status**: ${task.status?.name ?? 'Unknown'}`,
      `- **Assignee**: ${task.assign?.name ?? 'Unassigned'}`,
    ]
    if (task.owner?.name)
      parts.push(`- **Owner**: ${task.owner.name}`)
    if (task.project?.name)
      parts.push(`- **Project**: ${task.project.name}`)
    parts.push(`- **UUID**: ${task.uuid}`)
    if (task.parent?.uuid) {
      parts.push('', '## Parent Task', `- UUID: ${task.parent.uuid}`)
      if (task.parent.number)
        parts.push(`- Number: #${task.parent.number}`)
    }
    const detailText = getTaskDetailText(task)
    if (detailText)
      parts.push('', '---', '', kind === 'defect' ? '## Defect Detail' : '## Task Detail', '', detailText)
    parts.push(
      '',
      '## Next Tool',
      '',
      `This ID is a ${workItemKindLabel(kind)}, not a requirement document.`,
      `Do not treat wiki/requirement docs as the source of truth. Use \`${nextTool}\` for the next lookup.`,
    )
    if (task.relatedTasks?.length) {
      parts.push('', '## Related Tasks')
      for (const related of task.relatedTasks)
        parts.push(`- #${related.number} ${related.name} [${related.issueType?.name}] (${related.status?.name}) — ${related.assign?.name ?? 'Unassigned'}`)
    }
    const requirement = toRequirement(task, parts.join('\n'))
    requirement.raw = {
      ...requirement.raw,
      workItemKind: kind,
      sourceDescription: detailText,
      hasSourceDescription: Boolean(detailText),
      hasRequirementDocuments: false,
      relatedTaskCount: task.relatedTasks?.length ?? 0,
    }
    return requirement
  }
}
