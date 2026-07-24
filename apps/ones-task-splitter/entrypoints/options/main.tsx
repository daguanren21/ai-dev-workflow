import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'

function OptionsApp() {
  const [baseUrl, setBaseUrl] = useState('')
  const [saved, setSaved] = useState(false)
  function save() {
    void browser.storage.local.set({ 'task-splitter:ones-base-url': baseUrl })
    setSaved(true)
  }
  return (
    <main className="app-shell">
      <h1>Task Splitter 设置</h1>
      <section className="panel" style={{ marginTop: 16, maxWidth: 640 }}>
        <label className="muted" htmlFor="ones-url">ONES 地址</label>
        <input id="ones-url" className="field" style={{ width: '100%', marginTop: 6 }} placeholder="https://ones.example" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} />
        <div className="actions">
          <button className="btn primary" onClick={save}>保存设置</button>
          {saved && <span className="status">已保存</span>}
        </div>
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><OptionsApp /></StrictMode>)
