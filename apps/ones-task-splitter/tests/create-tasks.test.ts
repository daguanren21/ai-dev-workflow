import { parseTaskDocument } from '@ai-dev-workflow/task-splitter-core'
import { describe, expect, it } from 'vitest'
import { createTaskTree } from '../src/ones/create-tasks'

describe('createTaskTree', () => {
  it('creates parents before children and skips persisted ids on retry', async () => {
    const document = parseTaskDocument('REQ-100001 Parent\n1. Child - 2h')
    const calls: string[] = []
    const result = await createTaskTree(document, {
      async createTask(task) {
        calls.push(task.title)
        return { id: `ones-${task.id}` }
      },
    })
    expect(calls).toEqual(['REQ-100001 Parent', 'REQ-100001 Child'])
    const retried = await createTaskTree(result, {
      async createTask() {
        throw new Error('must not call')
      },
    })
    expect(retried.tasks.every(task => task.status === 'created')).toBe(true)
  })

  it('keeps failed tasks retryable while preserving successful parent', async () => {
    const document = parseTaskDocument('REQ-100001 Parent\n1. Child - 2h')
    const result = await createTaskTree(document, {
      async createTask(task) {
        if (task.parentId)
          throw new Error('temporary failure')
        return { id: 'ones-parent' }
      },
    })
    expect(result.tasks[0].onesTaskId).toBe('ones-parent')
    expect(result.tasks[1].status).toBe('failed')
  })
})
