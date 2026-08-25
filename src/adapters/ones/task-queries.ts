export const TASK_DETAIL_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key uuid number name
      description
      descriptionText
      desc_rich: description
      issueType { uuid name detailType }
      subIssueType { uuid name detailType }
      status { uuid name category }
      priority { value }
      assign { uuid name }
      owner { uuid name }
      project { uuid name }
      parent { uuid number issueType { uuid name } }
      relatedTasks {
        key uuid number name
        description
        descriptionText
        desc_rich: description
        issueType { uuid name }
        subIssueType { uuid name detailType }
        status { uuid name category }
        assign { uuid name }
      }
      relatedWikiPages {
        uuid title referenceType subReferenceType errorMessage
      }
      relatedWikiPagesCount
    }
  }
`

export const RELATED_ACTIVITIES_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key
      ...RelatedActivities_task1
    }
  }

  fragment RelatedActivities_task1 on Task {
    relatedActivities {
      uuid name projectUUID project_uuid: projectUUID
      relatedChild related_child_uuid: relatedChild
    }
    relatedActivitiesCount
  }
`

export const SEARCH_TASKS_QUERY = `
  query GROUP_TASK_DATA($groupBy: GroupBy, $groupOrderBy: OrderBy, $orderBy: OrderBy, $filterGroup: [Filter!], $search: Search, $pagination: Pagination, $limit: Int) {
    buckets(groupBy: $groupBy, orderBy: $groupOrderBy, pagination: $pagination, filter: $search) {
      key
      tasks(filterGroup: $filterGroup, orderBy: $orderBy, limit: $limit, includeAncestors: { pathField: "path" }) {
        key uuid number name
        issueType { uuid name detailType }
        subIssueType { uuid name detailType }
        status { uuid name category }
        priority { value }
        assign { uuid name }
        project { uuid name identifier }
        parent { uuid number issueType { uuid name } }
      }
    }
  }
`

export const PROJECTS_QUERY = `
  query Projects($groupBy: GroupBy, $orderBy: OrderBy, $pagination: Pagination, $projectOrderBy: OrderBy, $projectFilterGroup: [Filter!]) {
    buckets(groupBy: $groupBy, orderBy: $orderBy, pagination: $pagination) {
      key
      projects(limit: 10000, orderBy: $projectOrderBy, filterGroup: $projectFilterGroup) {
        key uuid name identifier
      }
    }
  }
`

export const DEFAULT_STATUS_NOT_IN = ['FgMGkcaq', 'NvRwHBSo', 'Dn3k8ffK', 'TbmY2So5']
