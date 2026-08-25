import type { ApplyRequirementDecompositionResult, PendingWorkItem, PendingWorkItemsResult, Requirement, RequirementDecompositionContext, RequirementDecompositionTask } from '../../types/requirement'
import type { CreateRequirementDecompositionParams, GetRequirementDecompositionContextParams } from '../base'
import type { OnesApiClient } from './api-client'
import type { OnesTaskNode } from './types'
import { classifyOnesWorkItem } from '../../utils/ones-issue-kind'
import { buildRequirementDecompositionBaseline, sortRequirementTasks } from '../../utils/requirement-decomposition'
import { compareNullableDate, firstString, inferredParentDisplayId, mapWithConcurrency, parseDisplayId, taskDisplayId, taskInfoDate, taskInfoDetail, taskInfoHours } from './task-helpers'
import { DEFAULT_STATUS_NOT_IN, SEARCH_TASKS_QUERY } from './task-queries'

export interface OnesTaskPlanningOptions {
  api: OnesApiClient
  getRequirement: (id: string) => Promise<Requirement>
  fetchTaskInfo: (taskUuid: string) => Promise<Record<string, unknown>>
}

export class OnesTaskPlanning {
  constructor(private readonly options: OnesTaskPlanningOptions) {}

  async listPendingWorkItems(): Promise<PendingWorkItemsResult> {
    const data = await this.options.api.graphql<{
      data?: { buckets?: Array<{ key: string, tasks?: OnesTaskNode[] }> }
    }>(SEARCH_TASKS_QUERY, {
      groupBy: { tasks: {} },
      groupOrderBy: null,
      orderBy: { position: 'ASC', createTime: 'DESC' },
      filterGroup: [{
        assign_in: ['${currentUser}'],
        status_notIn: DEFAULT_STATUS_NOT_IN,
      }],
      search: null,
      pagination: { limit: 1000, preciseCount: false },
      limit: 1000,
    }, 'group-task-data')

    const tasks = (data.data?.buckets?.flatMap(bucket => bucket.tasks ?? []) ?? [])
      .filter(task => task.status?.category === 'to_do' || task.status?.category === 'in_progress')
      .filter((task) => {
        const kind = classifyOnesWorkItem(task.issueType, task.subIssueType)
        return kind === 'requirement' || kind === 'task'
      })
    const items = await mapWithConcurrency(tasks, 6, async (task): Promise<PendingWorkItem> => {
      const info = await this.options.fetchTaskInfo(task.uuid)
      const partial = Object.keys(info).length === 0
      const kind = classifyOnesWorkItem(task.issueType, task.subIssueType)
      const fallbackIdentifier = task.project?.identifier?.toUpperCase() ?? null
      return {
        uuid: task.uuid,
        displayId: taskDisplayId(info, task, fallbackIdentifier),
        kind: kind === 'requirement' ? 'requirement' : 'task',
        title: firstString(info, ['summary', 'name']) ?? task.name,
        statusName: task.status.name,
        statusCategory: task.status.category === 'in_progress' ? 'in_progress' : 'to_do',
        assigneeName: task.assign?.name ?? null,
        projectName: task.project?.name ?? null,
        parentUuid: firstString(info, ['parent_uuid', 'parentUuid']) ?? task.parent?.uuid ?? null,
        parentDisplayId: kind === 'task' ? inferredParentDisplayId(task, info) : null,
        actualHours: taskInfoHours(info, ['total_manhour', 'totalManhour', 'actual_manhour']),
        remainingHours: taskInfoHours(info, ['remaining_manhour', 'remainingManhour']),
        estimatedHours: taskInfoHours(info, ['assess_manhour', 'assessManhour', 'estimated_manhour']),
        planStartDate: taskInfoDate(info, 'start'),
        planEndDate: taskInfoDate(info, 'end'),
        partial,
        warnings: partial ? ['ONES task detail GET returned no data'] : [],
      }
    })
    items.sort((left, right) => (
      compareNullableDate(left.planStartDate, right.planStartDate)
      || compareNullableDate(left.planEndDate, right.planEndDate)
      || left.displayId.localeCompare(right.displayId)
    ))
    return {
      items,
      total: items.length,
      partialCount: items.filter(item => item.partial).length,
      fetchedAt: new Date().toISOString(),
    }
  }

  async getDecompositionContext(
    params: GetRequirementDecompositionContextParams,
  ): Promise<RequirementDecompositionContext> {
    const workItem = await this.options.getRequirement(params.requirementId)
    if (workItem.raw.workItemKind !== 'requirement') {
      const kind = typeof workItem.raw.workItemKind === 'string'
        ? workItem.raw.workItemKind
        : workItem.type
      throw new Error(
        `ONES: "${params.requirementId}" is ${kind}, not a requirement. Only requirements can be decomposed.`,
      )
    }
    const raw = workItem.raw as unknown as OnesTaskNode & Record<string, unknown>
    if (!Number.isInteger(raw.number))
      throw new TypeError('ONES: Standalone wiki pages cannot be decomposed into requirement tasks')
    const parsedDisplayId = parseDisplayId(params.requirementId)
    const requirementInfo = await this.options.fetchTaskInfo(workItem.id)
    const projectIdentifier = parsedDisplayId?.identifier.toUpperCase()
      ?? firstString(requirementInfo, ['projectIdentifier', 'project_identifier'])
    const displayId = firstString(requirementInfo, ['displayId', 'display_id'])
      ?? (projectIdentifier ? `${projectIdentifier}-${raw.number}` : `#${raw.number}`)
    const relatedTasks = (raw.relatedTasks ?? [])
      .filter(task => classifyOnesWorkItem(task.issueType, task.subIssueType) === 'task')
    const relatedInfos = await Promise.all(
      relatedTasks.map(task => this.options.fetchTaskInfo(task.uuid)),
    )
    const tasks = sortRequirementTasks(relatedTasks.map((task, index): RequirementDecompositionTask => {
      const info = relatedInfos[index] ?? {}
      const statusCategory = task.status?.category ?? 'unknown'
      return {
        uuid: task.uuid,
        displayId: taskDisplayId(info, task, projectIdentifier),
        name: task.name,
        detail: taskInfoDetail(info, task),
        statusName: task.status?.name ?? 'Unknown',
        statusCategory,
        pending: statusCategory === 'to_do' || statusCategory === 'in_progress',
        assigneeName: task.assign?.name ?? null,
        assigneeUuid: task.assign?.uuid ?? null,
        planStartDate: taskInfoDate(info, 'start'),
        planEndDate: taskInfoDate(info, 'end'),
      }
    }))
    const requirement = {
      workItemKind: 'requirement' as const,
      uuid: workItem.id,
      displayId,
      name: raw.name ?? workItem.title,
      detail: typeof workItem.raw.sourceDescription === 'string'
        ? workItem.raw.sourceDescription
        : workItem.description,
      issueTypeName: raw.subIssueType?.name ?? raw.issueType?.name ?? '需求',
      statusName: raw.status?.name ?? workItem.status,
      statusCategory: raw.status?.category ?? workItem.status,
      projectUuid: raw.project?.uuid ?? null,
      projectName: raw.project?.name ?? null,
      assigneeUuid: raw.assign?.uuid ?? null,
      assigneeName: raw.assign?.name ?? workItem.assignee,
    }
    const baseline = buildRequirementDecompositionBaseline(requirement, tasks, {
      version: firstString(requirementInfo, ['version', 'version_uuid', 'versionUuid']),
      updatedAt: firstString(requirementInfo, ['updatedAt', 'updated_at', 'updateTime', 'update_time']),
    })
    return {
      decompositionRelation: { verified: false, uuid: null, name: null },
      requirement,
      tasks,
      pendingTasks: tasks.filter(task => task.pending),
      baseline,
    }
  }

  async createDecomposition(
    _params: CreateRequirementDecompositionParams,
  ): Promise<ApplyRequirementDecompositionResult> {
    throw new Error(
      'ONES: Requirement task creation is unavailable because the production create/relationship API contract has not been confirmed. No write request was sent.',
    )
  }
}
