import type { DraftDocument, DraftTask } from '@ai-dev-workflow/task-splitter-core'

export interface TaskTransport {
  createTask: (task: DraftTask, parentOnesId: string | null) => Promise<{ id: string }>
}

export async function createTaskTree(document: DraftDocument, transport: TaskTransport): Promise<DraftDocument> {
  const next = structuredClone(document)
  const byId = new Map(next.tasks.map(task => [task.id, task]))
  const pending = [...next.tasks]
  while (pending.length > 0) {
    const task = pending.shift()!
    if (task.onesTaskId)
      continue
    const parent = task.parentId ? byId.get(task.parentId) : undefined
    if (task.parentId && !parent?.onesTaskId) {
      pending.push(task)
      continue
    }
    task.status = 'creating'
    try {
      const result = await transport.createTask(task, parent?.onesTaskId ?? null)
      task.onesTaskId = result.id
      task.status = 'created'
      task.errorMessage = null
    }
    catch (error) {
      task.status = 'failed'
      task.errorMessage = (error as Error).message
    }
  }
  return next
}
