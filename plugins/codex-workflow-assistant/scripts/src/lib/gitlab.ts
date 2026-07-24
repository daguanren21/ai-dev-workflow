export interface GitLabActivity {
  date: string
  commits: GitLabCommit[]
  mergeRequests: GitLabMergeRequest[]
}

export interface GitLabCommit {
  type: 'commit'
  id: string
  shortId: string
  title: string
  message: string
  committedAt: string
  webUrl: string
  additions: number
  deletions: number
  total: number
}

export interface GitLabMergeRequest {
  type: 'merge_request'
  iid: number
  title: string
  sourceBranch: string
  webUrl: string
  updatedAt: string
}

export interface FetchGitLabActivityOptions {
  url: string
  token: string
  projectId: string
  date: string
  fetchImpl?: typeof fetch
}

interface GitLabCommitResponse {
  id: string
  short_id: string
  title: string
  message: string
  committed_date: string
  web_url: string
  stats?: {
    additions?: number
    deletions?: number
    total?: number
  }
}

interface GitLabMergeRequestResponse {
  iid: number
  title: string
  source_branch: string
  web_url: string
  updated_at: string
}

export async function fetchGitLabActivity({
  url,
  token,
  projectId,
  date,
  fetchImpl = fetch,
}: FetchGitLabActivityOptions): Promise<GitLabActivity> {
  if (!token) {
    throw new Error('GITLAB_TOKEN is required')
  }
  if (!url || !projectId) {
    throw new Error('GitLab project could not be inferred from git remote; set GITLAB_URL and GITLAB_PROJECT_ID to override')
  }

  const encodedProject = encodeURIComponent(projectId)
  const since = `${date}T00:00:00Z`
  const until = `${date}T23:59:59Z`

  const commits = await fetchPaged<GitLabCommitResponse, GitLabCommit>({
    endpoint: `${url}/api/v4/projects/${encodedProject}/repository/commits`,
    token,
    fetchImpl,
    query: {
      since,
      until,
      with_stats: 'true',
      per_page: '100',
    },
    map: mapCommit,
  })

  const mergeRequests = await fetchPaged<GitLabMergeRequestResponse, GitLabMergeRequest>({
    endpoint: `${url}/api/v4/projects/${encodedProject}/merge_requests`,
    token,
    fetchImpl,
    query: {
      scope: 'all',
      updated_after: since,
      updated_before: until,
      per_page: '100',
    },
    map: mapMergeRequest,
  })

  return { date, commits, mergeRequests }
}

async function fetchPaged<TRaw, TMapped>({
  endpoint,
  token,
  query,
  fetchImpl,
  map,
}: {
  endpoint: string
  token: string
  query: Record<string, string>
  fetchImpl: typeof fetch
  map: (item: TRaw) => TMapped
}): Promise<TMapped[]> {
  const records: TMapped[] = []
  let page = 1

  while (page) {
    const params = new URLSearchParams({ ...query, page: String(page) })
    const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'PRIVATE-TOKEN': token,
      },
    })

    if (!response.ok) {
      throw new Error(`GitLab request failed with status ${response.status}`)
    }

    const items = await response.json() as TRaw[]
    records.push(...items.map(map))

    const next = response.headers.get('x-next-page')
    page = next ? Number.parseInt(next, 10) : 0
  }

  return records
}

function mapCommit(commit: GitLabCommitResponse): GitLabCommit {
  return {
    type: 'commit',
    id: commit.id,
    shortId: commit.short_id,
    title: commit.title,
    message: commit.message,
    committedAt: commit.committed_date,
    webUrl: commit.web_url,
    additions: commit.stats?.additions || 0,
    deletions: commit.stats?.deletions || 0,
    total: commit.stats?.total || 0,
  }
}

function mapMergeRequest(mr: GitLabMergeRequestResponse): GitLabMergeRequest {
  return {
    type: 'merge_request',
    iid: mr.iid,
    title: mr.title,
    sourceBranch: mr.source_branch,
    webUrl: mr.web_url,
    updatedAt: mr.updated_at,
  }
}
