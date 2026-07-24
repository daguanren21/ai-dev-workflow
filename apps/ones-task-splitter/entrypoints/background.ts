import type { DraftDocument } from '@ai-dev-workflow/task-splitter-core'
import { defineBackground } from 'wxt/utils/define-background'
import { createTaskTree } from '../src/ones/create-tasks.js'

interface CreateResult { document: DraftDocument, status: 'created' | 'reauth-required' | 'partial-failure', created: string[], failed: string[] }

async function createTasks(document: DraftDocument): Promise<CreateResult> {
  const settings = await browser.storage.local.get('task-splitter:ones-base-url')
  const baseUrl = settings['task-splitter:ones-base-url']
  if (typeof baseUrl !== 'string' || baseUrl.length === 0)
    return { document, status: 'reauth-required', created: [], failed: [] }
  const nextDocument = await createTaskTree(document, {
    async createTask(_task) {
      throw new Error(`ONES task API is not configured for ${baseUrl}`)
    },
  })
  return { document: nextDocument, status: nextDocument.tasks.some(task => task.status === 'failed') ? 'partial-failure' : 'created', created: nextDocument.tasks.filter(task => task.status === 'created').map(task => task.id), failed: nextDocument.tasks.filter(task => task.status === 'failed').map(task => task.id) }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: { type: string, document?: DraftDocument }) => {
    if (message.type === 'ones:create-tasks' && message.document)
      return createTasks(message.document)
    if (message.type === 'ones:session-status')
      return Promise.resolve({ status: 'not-configured' })
    return undefined
  })
})
