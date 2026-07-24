import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { requestSessionStatus } from '../../src/lib/messages.js'
import { listDrafts } from '../../src/lib/storage.js'
import '../../src/styles.css'

function PopupApp() {
  const [drafts, setDrafts] = useState<Array<{ id: string, sourceName: string, updatedAt: string }>>([])
  const [session, setSession] = useState('检查中')
  useEffect(() => {
    void listDrafts().then(setDrafts).catch(() => setSession('本地模式'))
    void requestSessionStatus().then(result => setSession(result.status)).catch(() => setSession('未配置'))
  }, [])
  return (
    <main className="app-shell">
      <header className="toolbar">
        <h1>Task Splitter</h1>
        <span className="status">
          ONES:
          {session}
        </span>
      </header>
      <button className="btn primary" onClick={() => void browser.tabs.create({ url: browser.runtime.getURL('/splitter.html') })}>打开拆分器</button>
      <section className="panel" style={{ marginTop: 12 }}>
        <strong>最近草稿</strong>
        {drafts.length === 0
          ? <p className="muted">暂无草稿</p>
          : drafts.slice(0, 5).map(draft => (
              <div className="status" key={draft.id}>
                {draft.sourceName}
                {' '}
                ·
                {' '}
                {new Date(draft.updatedAt).toLocaleString()}
              </div>
            ))}
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><PopupApp /></StrictMode>)
