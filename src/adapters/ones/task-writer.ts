import type { AddManhourResult, UpdateTaskPlanDatesResult } from '../../types/requirement'
import type { AddManhourParams, UpdateTaskPlanDatesParams } from '../base'
import type { OnesApiClient } from './api-client'
import type { OnesTaskRef } from './types'
import { isValidOnesDate } from './task-helpers'

const ADD_MANHOUR_MUTATION = `
  mutation AddManhour {
    addManhour(mode: $mode, owner: $owner, task: $task, type: $type, start_time: $start_time, hours: $hours, description: $description, customData: $customData) {
      key
    }
  }
`

function toOnesHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0)
    throw new Error('ONES: hours must be a positive number')
  return Math.round(hours * 100000)
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseManhourDate(input?: string): { date: string | null, startTime: number } {
  const value = input?.trim()
  if (!value) {
    const now = new Date()
    return {
      date: null,
      startTime: Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000),
    }
  }
  const fullDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dayOnlyMatch = value.match(/^(\d{1,2})号?$/)
  const now = new Date()
  const year = fullDateMatch ? Number.parseInt(fullDateMatch[1], 10) : now.getFullYear()
  const month = fullDateMatch ? Number.parseInt(fullDateMatch[2], 10) : now.getMonth() + 1
  const day = fullDateMatch
    ? Number.parseInt(fullDateMatch[3], 10)
    : dayOnlyMatch
      ? Number.parseInt(dayOnlyMatch[1], 10)
      : Number.NaN
  const parsed = new Date(year, month - 1, day)
  const valid = Number.isInteger(day)
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
  if (!valid)
    throw new Error('ONES: date must be a valid YYYY-MM-DD date or day of current month')
  return {
    date: toLocalDateString(parsed),
    startTime: Math.floor(parsed.getTime() / 1000),
  }
}

export interface OnesTaskWriterOptions {
  api: OnesApiClient
  resolveTaskRef: (input: string) => Promise<OnesTaskRef>
}

export class OnesTaskWriter {
  constructor(private readonly options: OnesTaskWriterOptions) {}

  async addManhour(params: AddManhourParams): Promise<AddManhourResult> {
    const description = params.description.trim()
    if (!description)
      throw new Error('ONES: description is required')
    const taskRef = await this.options.resolveTaskRef(params.taskId)
    const workDate = parseManhourDate(params.date)
    const data = await this.options.api.graphql<{ data?: { addManhour?: { key?: string } } }>(
      ADD_MANHOUR_MUTATION,
      {
        mode: 'simple',
        type: 'recorded',
        customData: {},
        owner: (await this.options.api.getSession()).userUuid,
        task: taskRef.uuid,
        start_time: workDate.startTime,
        hours: toOnesHours(params.hours),
        description,
      },
      'add-manhour',
    )
    const key = data.data?.addManhour?.key
    if (!key)
      throw new Error('ONES: Failed to add manhour')
    return {
      key,
      taskUuid: taskRef.uuid,
      hours: params.hours,
      description,
      date: workDate.date,
    }
  }

  async updatePlanDates(params: UpdateTaskPlanDatesParams): Promise<UpdateTaskPlanDatesResult> {
    const planStartDate = params.planStartDate?.trim()
    const planEndDate = params.planEndDate?.trim()
    if (!planStartDate && !planEndDate)
      throw new Error('ONES: planStartDate or planEndDate is required')
    if (planStartDate && !isValidOnesDate(planStartDate))
      throw new Error('ONES: planStartDate must be a valid YYYY-MM-DD date')
    if (planEndDate && !isValidOnesDate(planEndDate))
      throw new Error('ONES: planEndDate must be a valid YYYY-MM-DD date')
    const taskRef = await this.options.resolveTaskRef(params.taskId)
    const session = await this.options.api.getSession()
    const fieldValues: Array<{ field_uuid: string, value: string }> = []
    if (planStartDate)
      fieldValues.push({ field_uuid: 'field027', value: planStartDate })
    if (planEndDate)
      fieldValues.push({ field_uuid: 'field028', value: planEndDate })
    const response = await this.options.api.authorizedFetch(
      `/project/api/project/team/${session.teamUuid}/tasks/update3`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [{ uuid: taskRef.uuid, field_values: fieldValues }] }),
      },
    )
    if (!response.ok)
      throw new Error(`ONES: Failed to update task plan dates: ${response.status}`)
    return {
      taskUuid: taskRef.uuid,
      planStartDate: planStartDate ?? null,
      planEndDate: planEndDate ?? null,
    }
  }
}
