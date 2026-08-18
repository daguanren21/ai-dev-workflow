import type { PendingWorkItem, PendingWorkItemsResult } from '../../../src/types/requirement'
import type { DashboardFilters } from './model'
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { formatHours, groupWorkItems, matchesFilters } from './model'
import './styles.css'

const initialFilters: DashboardFilters = { query: '', status: 'all', kind: 'all' }

function Status({ item }: { item: PendingWorkItem }) {
  return <span className={`status status--${item.statusCategory}`}>{item.statusName}</span>
}

function WorkRow({ item }: { item: PendingWorkItem }) {
  return (
    <tr className={item.partial ? 'row-partial' : undefined}>
      <td className="id-cell">{item.displayId}</td>
      <td><span className={`kind kind--${item.kind}`}>{item.kind === 'requirement' ? '需求' : '任务'}</span></td>
      <td className="title-cell">
        <span title={item.title}>{item.title}</span>
        {item.partial && <span className="warning" title={item.warnings.join('；')}>数据不完整</span>}
      </td>
      <td><Status item={item} /></td>
      <td>{item.assigneeName ?? '—'}</td>
      <td className="number">{formatHours(item.actualHours)}</td>
      <td className="number">{formatHours(item.remainingHours)}</td>
      <td className="number number--strong">{formatHours(item.estimatedHours)}</td>
      <td className="date">{item.planStartDate ?? '—'}</td>
      <td className="date">{item.planEndDate ?? '—'}</td>
    </tr>
  )
}

function Dashboard() {
  const [result, setResult] = useState<PendingWorkItemsResult>()
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const response = await fetch('/api/pending', { headers: { Accept: 'application/json' } })
      const payload = await response.json() as PendingWorkItemsResult | { error?: string }
      if (!response.ok)
        throw new Error('error' in payload ? payload.error : '读取 ONES 任务失败')
      setResult(payload as PendingWorkItemsResult)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取 ONES 任务失败')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  const filtered = useMemo(
    () => (result?.items ?? []).filter(item => matchesFilters(item, filters)),
    [filters, result],
  )
  const groups = useMemo(() => groupWorkItems(filtered), [filtered])
  const counts = useMemo(() => ({
    todo: result?.items.filter(item => item.statusCategory === 'to_do').length ?? 0,
    progress: result?.items.filter(item => item.statusCategory === 'in_progress').length ?? 0,
    hours: result?.items.reduce((sum, item) => sum + (item.actualHours ?? 0), 0) ?? 0,
  }), [result])

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">ORCA / ONES READ-ONLY</p>
          <h1>ONES Tasks</h1>
          <p className="subtitle">当前账号的待完成需求与任务 · 缺陷已排除</p>
        </div>
        <button type="button" className="refresh" onClick={() => void load()} disabled={loading}>
          <span className={loading ? 'spin' : ''}>↻</span>
          {loading ? '同步中' : '刷新'}
        </button>
      </header>

      <section className="metrics" aria-label="任务统计">
        <div>
          <span>未开始</span>
          <strong>{counts.todo}</strong>
        </div>
        <div>
          <span>进行中</span>
          <strong>{counts.progress}</strong>
        </div>
        <div>
          <span>累计已用</span>
          <strong>{formatHours(counts.hours)}</strong>
        </div>
        <div>
          <span>数据时间</span>
          <strong className="timestamp">{result ? new Date(result.fetchedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}</strong>
        </div>
      </section>

      <section className="toolbar" aria-label="筛选条件">
        <label className="search">
          <span>搜索</span>
          <input value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} placeholder="编号、标题、负责人" />
        </label>
        <label>
          <span>状态</span>
          <select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value as DashboardFilters['status'] }))}>
            <option value="all">全部待完成</option>
            <option value="to_do">未开始</option>
            <option value="in_progress">进行中</option>
          </select>
        </label>
        <label>
          <span>类型</span>
          <select value={filters.kind} onChange={event => setFilters(current => ({ ...current, kind: event.target.value as DashboardFilters['kind'] }))}>
            <option value="all">需求 + 任务</option>
            <option value="requirement">需求</option>
            <option value="task">任务</option>
          </select>
        </label>
        <span className="result-count">
          显示
          {filtered.length}
          {' '}
          /
          {result?.total ?? 0}
        </span>
      </section>

      {error && (
        <section className="error">
          <strong>读取失败</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>重试</button>
        </section>
      )}
      {!error && loading && !result && <section className="loading">正在读取 ONES 任务详情与工时…</section>}
      {!error && result && (
        <section className="table-shell">
          {result.partialCount > 0 && (
            <div className="partial-notice">
              {result.partialCount}
              {' '}
              条记录详情不完整，已保留基础信息并明确标记。
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>编号</th>
                  <th>类型</th>
                  <th>标题</th>
                  <th>状态</th>
                  <th>负责人</th>
                  <th>已用工时</th>
                  <th>剩余工时</th>
                  <th>总工时</th>
                  <th>预计开始</th>
                  <th>预计结束</th>
                </tr>
              </thead>
              {groups.map(group => (
                <tbody key={group.key}>
                  <tr className="group-row">
                    <th colSpan={10}>
                      <span>{group.key === 'standalone' ? '未关联需求' : group.key}</span>
                      <strong>{group.requirement?.title ?? `${group.items.length} 个任务`}</strong>
                    </th>
                  </tr>
                  {group.requirement && <WorkRow item={group.requirement} />}
                  {group.items.map(item => <WorkRow key={item.uuid} item={item} />)}
                </tbody>
              ))}
            </table>
          </div>
          {groups.length === 0 && <div className="empty">没有符合筛选条件的任务</div>}
        </section>
      )}
      <footer>只读视图 · 此页面没有创建、编辑或删除能力</footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Dashboard /></StrictMode>)
