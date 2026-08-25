import type { SourceConfig } from '../../types/config'
import type { TestCase, TestCaseResult, TestCaseStep } from '../../types/requirement'
import type { GetTestcasesParams } from '../base'
import type { OnesApiClient } from './api-client'
import { classifyOnesWorkItem } from '../../utils/ones-issue-kind'

const SEARCH_TASKS_QUERY = `
  query GROUP_TASK_DATA($groupBy: GroupBy, $groupOrderBy: OrderBy, $orderBy: OrderBy, $filterGroup: [Filter!], $search: Search, $pagination: Pagination, $limit: Int) {
    buckets(groupBy: $groupBy, orderBy: $groupOrderBy, pagination: $pagination, filter: $search) {
      key
      tasks(filterGroup: $filterGroup, orderBy: $orderBy, limit: $limit, includeAncestors: { pathField: "path" }) {
        key uuid number name
        issueType { uuid name detailType }
        subIssueType { uuid name detailType }
      }
    }
  }
`

const TESTCASE_LIBRARY_LIST_QUERY = `
  query Q {
    testcaseLibraries { uuid name key testcaseCaseCount }
  }
`

const TESTCASE_MODULE_SEARCH_QUERY = `
  query Q($filter: Filter) {
    testcaseModules(filter: $filter) { uuid name key parent { uuid name } }
  }
`

const TESTCASE_LIST_PAGED_QUERY = `
  query PAGED_LIBRARY_TESTCASE_LIST($testCaseFilter: Filter, $pagination: Pagination) {
    buckets(groupBy: {testcaseCases: {}}, pagination: $pagination) {
      testcaseCases(filterGroup: $testCaseFilter, limit: 10000) {
        uuid name key id
        priority { uuid value }
        type { uuid value }
        assign { uuid name }
        testcaseModule { uuid }
      }
      key
      pageInfo { count totalCount hasNextPage endCursor }
    }
  }
`

const TESTCASE_DETAIL_QUERY = `
  query QUERY_TESTCASES_DETAIL($testCaseFilter: Filter, $stepFilter: Filter) {
    testcaseCases(filter: $testCaseFilter) {
      uuid name key id condition desc path
      assign { uuid name }
      priority { uuid value }
      type { uuid value }
      testcaseLibrary { uuid }
      testcaseModule { uuid }
      relatedTasks { uuid name number }
    }
    testcaseCaseSteps(filter: $stepFilter, orderBy: { index: ASC }) {
      key uuid testcaseCase { uuid } desc result index
    }
  }
`

export interface OnesTestcaseReaderOptions {
  config: SourceConfig
  api: OnesApiClient
  refreshImageUrls: (html: string) => Promise<string>
}

export class OnesTestcaseReader {
  constructor(private readonly options: OnesTestcaseReaderOptions) {}

  async get(params: GetTestcasesParams): Promise<TestCaseResult> {
    const { api, config } = this.options
    const searchData = await api.graphql<{
      data?: { buckets?: Array<{ tasks?: Array<{
        uuid: string
        number: number
        name: string
        issueType?: { uuid: string, name: string, detailType?: number }
        subIssueType?: { uuid: string, name: string, detailType?: number } | null
      }> }> }
    }>(SEARCH_TASKS_QUERY, {
      groupBy: { tasks: {} },
      groupOrderBy: null,
      orderBy: { createTime: 'DESC' },
      filterGroup: [{ number_in: [params.taskNumber] }],
      search: null,
      pagination: { limit: 10, preciseCount: false },
      limit: 10,
    }, 'group-task-data')

    const task = (searchData.data?.buckets?.flatMap(bucket => bucket.tasks ?? []) ?? [])
      .find(candidate => candidate.number === params.taskNumber)
    if (!task)
      throw new Error(`ONES: Task #${params.taskNumber} not found`)

    const kind = classifyOnesWorkItem(task.issueType, task.subIssueType)
    if (kind === 'unknown')
      throw new Error(`ONES: Unable to classify "${params.taskNumber}" before get_testcases`)
    if (kind === 'defect') {
      throw new Error(
        `ONES: "${params.taskNumber}" is a defect (defect). get_testcases does not apply. Use get_issue_detail instead.`,
      )
    }

    let libraryUuid = params.libraryUuid ?? (config.options?.testcaseLibraryUuid as string)
    if (!libraryUuid) {
      const libraryData = await api.graphql<{
        data?: { testcaseLibraries?: Array<{ uuid: string, name: string, testcaseCaseCount: number }> }
      }>(TESTCASE_LIBRARY_LIST_QUERY, {}, 'library-select')
      const libraries = libraryData.data?.testcaseLibraries ?? []
      if (libraries.length === 0)
        throw new Error('ONES: No testcase libraries found for this team')
      libraries.sort((left, right) => right.testcaseCaseCount - left.testcaseCaseCount)
      libraryUuid = libraries[0].uuid
    }

    const moduleData = await api.graphql<{
      data?: { testcaseModules?: Array<{ uuid: string, name: string }> }
    }>(TESTCASE_MODULE_SEARCH_QUERY, {
      filter: { testcaseLibrary_in: [libraryUuid], name_match: `#${params.taskNumber}` },
    }, 'find-testcase-module')
    const module = moduleData.data?.testcaseModules?.[0]
    if (!module)
      throw new Error(`ONES: No testcase module matching "#${params.taskNumber}" in library ${libraryUuid}`)

    const caseList: Array<{ uuid: string, id: string, name: string }> = []
    let cursor = ''
    let totalCount = 0
    while (true) {
      const listData = await api.graphql<{
        data?: { buckets?: Array<{
          pageInfo: { totalCount: number, hasNextPage: boolean, endCursor: string }
          testcaseCases: Array<{ uuid: string, id: string, name: string }>
        }> }
      }>(TESTCASE_LIST_PAGED_QUERY, {
        testCaseFilter: [{ testcaseLibrary_in: [libraryUuid], path_match: module.uuid }],
        pagination: { limit: 50, after: cursor, preciseCount: true },
      }, 'testcase-list-paged')
      const bucket = listData.data?.buckets?.[0]
      if (!bucket)
        break
      caseList.push(...(bucket.testcaseCases ?? []))
      totalCount = bucket.pageInfo.totalCount
      if (!bucket.pageInfo.hasNextPage)
        break
      cursor = bucket.pageInfo.endCursor
    }

    if (caseList.length === 0) {
      return {
        taskNumber: params.taskNumber,
        taskName: task.name,
        moduleName: module.name,
        moduleUuid: module.uuid,
        totalCount: 0,
        cases: [],
      }
    }

    const allCases: TestCase[] = []
    for (let index = 0; index < caseList.length; index += 20) {
      const uuids = caseList.slice(index, index + 20).map(testCase => testCase.uuid)
      const detailData = await api.graphql<{
        data?: {
          testcaseCases: Array<{
            uuid: string
            id: string
            name: string
            condition: string
            desc: string
            path: string
            assign?: { name: string } | null
            priority?: { value: string } | null
            type?: { value: string } | null
          }>
          testcaseCaseSteps: Array<{
            uuid: string
            desc: string
            result: string
            index: number
            testcaseCase: { uuid: string }
          }>
        }
      }>(TESTCASE_DETAIL_QUERY, {
        testCaseFilter: { uuid_in: [...uuids, null] },
        stepFilter: { testcaseCase_in: uuids },
      }, 'library-testcase-detail')

      const stepsByCase = new Map<string, TestCaseStep[]>()
      for (const step of detailData.data?.testcaseCaseSteps ?? []) {
        const steps = stepsByCase.get(step.testcaseCase.uuid) ?? []
        steps.push({
          uuid: step.uuid,
          index: step.index,
          desc: step.desc ?? '',
          result: step.result ?? '',
        })
        stepsByCase.set(step.testcaseCase.uuid, steps)
      }

      for (const testCase of detailData.data?.testcaseCases ?? []) {
        allCases.push({
          uuid: testCase.uuid,
          id: testCase.id,
          name: testCase.name,
          priority: testCase.priority?.value ?? 'N/A',
          type: testCase.type?.value ?? 'Unknown',
          assignName: testCase.assign?.name ?? null,
          condition: testCase.condition ?? '',
          desc: testCase.desc ? await this.options.refreshImageUrls(testCase.desc) : '',
          steps: (stepsByCase.get(testCase.uuid) ?? []).sort((left, right) => left.index - right.index),
          modulePath: testCase.path ?? '',
        })
      }
    }

    return {
      taskNumber: params.taskNumber,
      taskName: task.name,
      moduleName: module.name,
      moduleUuid: module.uuid,
      totalCount,
      cases: allCases,
    }
  }
}
