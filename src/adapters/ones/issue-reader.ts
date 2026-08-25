import type { IssueDetail, RelatedIssue } from '../../types/requirement'
import type { GetIssueDetailParams, GetRelatedIssuesParams } from '../base'
import type { OnesApiClient } from './api-client'
import type { OnesTaskNode, OnesTaskRef } from './types'
import { classifyOnesWorkItem } from '../../utils/ones-issue-kind'
import { unsupportedWorkItemToolError } from './task-helpers'

const RELATED_TASKS_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key
      issueType { uuid name detailType }
      subIssueType { uuid name detailType }
      relatedTasks {
        key uuid name path deadline
        project { uuid name }
        priority { value }
        issueType { key uuid name detailType }
        subIssueType { key uuid name detailType }
        status { uuid name category }
        assign { uuid name }
        sprint { name uuid }
        statusCategory
      }
    }
  }
`

const ISSUE_DETAIL_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key uuid description descriptionText desc_rich: description name
      issueType { key uuid name detailType }
      subIssueType { key uuid name detailType }
      status { uuid name category }
      priority { value }
      assign { uuid name }
      owner { uuid name }
      solver { uuid name }
      project { uuid name }
      severityLevel { value }
      deadline(unit: ONESDATE)
      sprint { name uuid }
    }
  }
`

export interface OnesIssueReaderOptions {
  api: OnesApiClient
  resolveTaskRef: (input: string) => Promise<OnesTaskRef>
  getFreshTaskDescriptions: (
    task: Pick<OnesTaskNode, 'uuid' | 'description' | 'desc_rich'>,
  ) => Promise<{ description: string, descriptionRich: string }>
}

export class OnesIssueReader {
  constructor(private readonly options: OnesIssueReaderOptions) {}

  async getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]> {
    const session = await this.options.api.getSession()
    const taskKey = params.taskId.startsWith('task-') ? params.taskId : `task-${params.taskId}`
    const data = await this.options.api.graphql<{
      data?: {
        task?: {
          key: string
          issueType?: { uuid: string, name: string, detailType?: number }
          subIssueType?: { uuid: string, name: string, detailType?: number } | null
          relatedTasks: Array<{
            key: string
            uuid: string
            name: string
            issueType: { key: string, uuid: string, name: string, detailType: number }
            subIssueType?: { key: string, uuid: string, name: string, detailType: number } | null
            status: { uuid: string, name: string, category: string }
            assign?: { uuid: string, name: string } | null
            priority?: { value: string } | null
            project?: { uuid: string, name: string } | null
          }>
        }
      }
    }>(RELATED_TASKS_QUERY, { key: taskKey }, 'Task')
    const parent = data.data?.task
    if (!parent)
      throw new Error(`ONES: Task "${params.taskId}" not found`)
    const parentKind = classifyOnesWorkItem(parent.issueType, parent.subIssueType)
    if (parentKind === 'unknown')
      throw new Error(`ONES: Unable to classify "${params.taskId}" before get_related_issues`)
    if (parentKind === 'defect')
      throw unsupportedWorkItemToolError(params.taskId, parentKind, 'get_related_issues', 'get_issue_detail')
    const filtered = (parent.relatedTasks ?? [])
      .filter(task => (
        (task.issueType?.detailType === 3 || task.subIssueType?.detailType === 3)
        && task.status?.category === 'to_do'
      ))
      .sort((left, right) => {
        const leftCurrent = left.assign?.uuid === session.userUuid ? 0 : 1
        const rightCurrent = right.assign?.uuid === session.userUuid ? 0 : 1
        return leftCurrent - rightCurrent
      })
    return filtered.map(task => ({
      key: task.key,
      uuid: task.uuid,
      name: task.name,
      issueTypeName: task.subIssueType?.name ?? task.issueType?.name ?? 'Unknown',
      statusName: task.status?.name ?? 'Unknown',
      statusCategory: task.status?.category ?? 'unknown',
      assignName: task.assign?.name ?? null,
      assignUuid: task.assign?.uuid ?? null,
      priorityValue: task.priority?.value ?? null,
      projectName: task.project?.name ?? null,
    }))
  }

  async getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail> {
    const { key: issueKey } = await this.options.resolveTaskRef(params.issueId)
    const data = await this.options.api.graphql<{
      data?: {
        task?: {
          key: string
          uuid: string
          name: string
          description: string
          descriptionText: string
          desc_rich: string
          issueType: { name: string, detailType?: number }
          subIssueType?: { name: string, detailType?: number } | null
          status: { name: string, category: string }
          priority?: { value: string } | null
          assign?: { uuid: string, name: string } | null
          owner?: { uuid: string, name: string } | null
          solver?: { uuid: string, name: string } | null
          project?: { uuid: string, name: string } | null
          severityLevel?: { value: string } | null
          deadline?: string | null
          sprint?: { name: string } | null
        }
      }
    }>(ISSUE_DETAIL_QUERY, { key: issueKey }, 'Task')
    const task = data.data?.task
    if (!task)
      throw new Error(`ONES: Issue "${issueKey}" not found`)
    const kind = classifyOnesWorkItem(task.issueType, task.subIssueType)
    if (kind === 'unknown')
      throw new Error(`ONES: Unable to classify "${params.issueId}" before get_issue_detail`)
    if (kind === 'requirement' || kind === 'task')
      throw unsupportedWorkItemToolError(params.issueId, kind, 'get_issue_detail', 'get_work_item')
    const fresh = await this.options.getFreshTaskDescriptions(task)
    return {
      key: task.key,
      uuid: task.uuid,
      name: task.name,
      description: fresh.description,
      descriptionRich: fresh.descriptionRich,
      descriptionText: task.descriptionText ?? '',
      issueTypeName: task.subIssueType?.name ?? task.issueType?.name ?? 'Unknown',
      statusName: task.status?.name ?? 'Unknown',
      statusCategory: task.status?.category ?? 'unknown',
      assignName: task.assign?.name ?? null,
      ownerName: task.owner?.name ?? null,
      solverName: task.solver?.name ?? null,
      priorityValue: task.priority?.value ?? null,
      severityLevel: task.severityLevel?.value ?? null,
      projectName: task.project?.name ?? null,
      deadline: task.deadline ?? null,
      sprintName: task.sprint?.name ?? null,
      raw: task as unknown as Record<string, unknown>,
    }
  }
}
