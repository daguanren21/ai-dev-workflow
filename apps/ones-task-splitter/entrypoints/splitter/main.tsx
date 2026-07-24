import type { DraftDocument, DraftTask } from '@ai-dev-workflow/task-splitter-core'
import { parseTaskDocument } from '@ai-dev-workflow/task-splitter-core'
import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { requestCreateTasks } from '../../src/lib/messages.js'
import { saveDraft } from '../../src/lib/storage.js'
import '../../src/styles.css'

const FORMAT_EXAMPLE = `REQ-100001 【优化】需求标题
前置任务 - 3h - 2026-07-14
问题排查 - 1h - 2026-07-14~2026-07-15
开发自测 - 3h - 2026-07-15`

function updateTask(document: DraftDocument, id: string, patch: Partial<DraftTask>): DraftDocument {
  return { ...document, tasks: document.tasks.map(task => task.id === id ? { ...task, ...patch } : task) }
}

function statusLabel(task: DraftTask): string {
  if (task.status === 'created')
    return '已创建'
  if (task.status === 'failed')
    return '创建失败'
  if (task.status === 'creating')
    return '创建中'
  return task.warnings.length > 0 ? '待检查' : '已解析'
}

function TaskRow({ task, onChange }: { task: DraftTask, onChange: (patch: Partial<DraftTask>) => void }) {
  const isParent = task.parentId === null
  return (
    <article className={`task-item ${isParent ? 'task-item-parent' : 'task-item-child'}`}>
      <div className="task-marker" aria-hidden="true">{isParent ? 'P' : '↳'}</div>
      <div className="task-content">
        <div className="task-heading">
          <span className="task-kind">{isParent ? '父任务' : '子任务'}</span>
          <span className={`task-status status-${task.status}`}>{statusLabel(task)}</span>
          <span className="task-confidence">{task.confidence === 'high' ? '高置信度' : task.confidence === 'medium' ? '需复核' : '低置信度'}</span>
        </div>
        <div className="task-fields">
          <label className="field-block field-title">
            <span>任务标题</span>
            <input className="control control-title" aria-label="任务标题" value={task.title} onChange={event => onChange({ title: event.target.value })} />
          </label>
          <label className="field-block field-key">
            <span>关联需求</span>
            <input className="control" aria-label="关联需求" value={task.requirementKeys.join('&')} onChange={event => onChange({ requirementKeys: event.target.value.split('&').map(value => value.trim()).filter(Boolean) })} />
          </label>
          <label className="field-block field-hours">
            <span>预计工时</span>
            <div className="unit-control">
              <input className="control" aria-label="预计工时" type="number" min="0" step="0.5" value={task.estimateHours ?? ''} onChange={event => onChange({ estimateHours: event.target.value ? Number(event.target.value) : null })} />
              <b>h</b>
            </div>
          </label>
          <label className="field-block field-date">
            <span>开始日期</span>
            <input className="control date-control" aria-label="开始日期" inputMode="numeric" maxLength={10} placeholder="YYYY-MM-DD" value={task.planStartDate ?? ''} onChange={event => onChange({ planStartDate: event.target.value || null })} />
          </label>
          <label className="field-block field-date">
            <span>结束日期</span>
            <input className="control date-control" aria-label="结束日期" inputMode="numeric" maxLength={10} placeholder="YYYY-MM-DD" value={task.planEndDate ?? ''} onChange={event => onChange({ planEndDate: event.target.value || null })} />
          </label>
        </div>
        <label className="field-block field-notes">
          <span>备注</span>
          <textarea className="control control-notes" aria-label="备注" rows={2} placeholder="补充实现范围、联调或自测信息" value={task.notes} onChange={event => onChange({ notes: event.target.value })} />
        </label>
        {task.warnings.length > 0 && (
          <div className="task-warning">
            <span aria-hidden="true">!</span>
            {task.warnings.map(warning => warning === 'missing-estimate-hours' ? '请补充预计工时' : warning === 'missing-title' ? '请补充任务标题' : warning).join(' · ')}
          </div>
        )}
        {task.errorMessage && <div className="task-error">{task.errorMessage}</div>}
      </div>
    </article>
  )
}

function SplitterApp() {
  const [rawText, setRawText] = useState('')
  const [document, setDocument] = useState<DraftDocument | null>(null)
  const [message, setMessage] = useState('')
  const totalHours = useMemo(() => document?.tasks.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0) ?? 0, [document])
  const warningCount = document?.tasks.reduce((sum, task) => sum + task.warnings.length, 0) ?? 0
  const parentCount = document?.tasks.filter(task => task.parentId === null).length ?? 0

  function parse() {
    const next = parseTaskDocument(rawText)
    setDocument(next.tasks.length > 0 ? next : null)
    setMessage(next.tasks.length > 0 ? `已识别 ${next.tasks.length} 个任务` : '没有识别到任务')
  }

  async function importFile(file: File) {
    setRawText(await file.text())
    setMessage(`已导入 ${file.name}`)
  }

  async function save() {
    if (!document)
      return
    await saveDraft(document)
    setMessage('草稿已保存到本地')
  }

  async function create() {
    if (!document)
      return
    // eslint-disable-next-line no-alert
    if (!window.confirm(`确认创建 ${document.tasks.length} 个任务，总工时 ${totalHours}h？`))
      return
    const result = await requestCreateTasks(document)
    setDocument(result.document)
    await saveDraft(result.document)
    setMessage(result.status === 'reauth-required' ? '请先在设置页配置 ONES 地址并登录' : `创建完成：成功 ${result.created.length}，失败 ${result.failed.length}`)
  }

  function exportJson() {
    if (!document)
      return
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `${document.sourceName || 'task-draft'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function copyFormatExample() {
    await navigator.clipboard.writeText(FORMAT_EXAMPLE)
    setMessage('标准格式已复制')
  }

  return (
    <main className="workspace">
      <header className="workspace-header">
        <div className="brand-lockup">
          <div className="brand-mark">O</div>
          <div>
            <p className="eyebrow">ONES WORKBENCH</p>
            <h1>任务拆分器</h1>
            <p className="subtitle">把一段需求说明整理成可确认的任务树。</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-chip">
            <i />
            本地草稿
          </span>
          <button className="button button-quiet" onClick={() => void save()} disabled={!document}>保存草稿</button>
          <button className="button button-primary" onClick={() => void create()} disabled={!document}>确认写入</button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="source-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">01 / 输入</span>
              <h2>原始需求</h2>
            </div>
            <span className="section-count">
              {rawText.length}
              {' '}
              字
            </span>
          </div>
          <textarea className="source-editor" placeholder="粘贴需求说明，或拖入 TXT / Markdown 文件" value={rawText} onChange={event => setRawText(event.target.value)} />
          <label
            className="drop-zone"
            onDragOver={event => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const file = event.dataTransfer.files[0]
              if (file)
                void importFile(file)
            }}
          >
            <span className="drop-icon">↓</span>
            <span>拖拽文件到这里</span>
            <small>支持 .txt / .md</small>
            <input
              hidden
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file)
                  void importFile(file)
              }}
            />
          </label>
          <div className="source-actions">
            <button className="button button-primary" onClick={parse}>解析任务</button>
            <button
              className="button button-quiet"
              onClick={() => {
                setRawText('')
                setDocument(null)
                setMessage('已清空')
              }}
            >
              清空
            </button>
          </div>
          {message && <p className="live-message" aria-live="polite">{message}</p>}
          <div className="source-tip">
            <span>i</span>
            <p>解析只在本地完成。确认写入前不会调用 ONES。</p>
          </div>
          <details className="format-guide">
            <summary>查看推荐输入格式</summary>
            <p>总工时可以写，但只作为汇总，不生成任务。每个具体任务建议独占一行。</p>
            <pre>{FORMAT_EXAMPLE}</pre>
            <button className="format-copy" onClick={() => void copyFormatExample()}>复制示例</button>
          </details>
        </aside>

        <section className="tasks-panel">
          <div className="section-heading tasks-heading">
            <div>
              <span className="section-kicker">02 / 编辑</span>
              <h2>任务树</h2>
            </div>
            <div className="task-summary">
              <span>
                <b>{document?.tasks.length ?? 0}</b>
                {' '}
                个任务
              </span>
              <span>
                <b>{totalHours}</b>
                h
              </span>
            </div>
          </div>
          <div className="task-list">{document?.tasks.map(task => <TaskRow key={task.id} task={task} onChange={patch => setDocument(current => current ? updateTask(current, task.id, patch) : current)} />)}</div>
          {!document && (
            <div className="empty-tasks">
              <div className="empty-symbol">↳</div>
              <h3>任务树会出现在这里</h3>
              <p>先在左侧粘贴需求文本，再点击“解析任务”。</p>
            </div>
          )}
        </section>

        <aside className="review-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">03 / 检查</span>
              <h2>提交前检查</h2>
            </div>
          </div>
          <div className="metric-list">
            <div className="metric">
              <span>任务数量</span>
              <strong>{document?.tasks.length ?? 0}</strong>
            </div>
            <div className="metric">
              <span>父任务</span>
              <strong>{parentCount}</strong>
            </div>
            <div className="metric">
              <span>预计总工时</span>
              <strong>
                {totalHours}
                <em>h</em>
              </strong>
            </div>
          </div>
          <div className={`review-alert ${warningCount > 0 ? 'has-warning' : 'is-ready'}`}>
            <span className="alert-symbol">{warningCount > 0 ? '!' : '✓'}</span>
            <div>
              <strong>{warningCount > 0 ? `${warningCount} 项需要复核` : '可以提交'}</strong>
              <p>{warningCount > 0 ? '请先补充缺失字段，再确认写入。' : '所有任务字段都已完成基础检查。'}</p>
            </div>
          </div>
          <div className="review-divider" />
          <div className="review-row">
            <span>ONES 会话</span>
            <b className="session-state">未配置</b>
          </div>
          <div className="review-row">
            <span>保存位置</span>
            <b>浏览器本地</b>
          </div>
          <button className="button button-outline review-export" onClick={exportJson} disabled={!document}>导出任务 JSON</button>
        </aside>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><SplitterApp /></StrictMode>)
