import type { DraftDocument } from '@ai-dev-workflow/task-splitter-core'

export async function requestCreateTasks(document: DraftDocument) {
  return browser.runtime.sendMessage({ type: 'ones:create-tasks', document }) as Promise<{ document: DraftDocument, status: string, created: string[], failed: string[] }>
}

export async function requestSessionStatus() {
  return browser.runtime.sendMessage({ type: 'ones:session-status' }) as Promise<{ status: string }>
}
