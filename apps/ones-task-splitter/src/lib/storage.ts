import type { DraftDocument } from '@ai-dev-workflow/task-splitter-core'

const PREFIX = 'task-splitter:draft:'

export async function saveDraft(document: DraftDocument): Promise<void> {
  const updated = { ...document, updatedAt: new Date().toISOString() }
  await browser.storage.local.set({ [`${PREFIX}${document.id}`]: updated })
}

export async function loadDraft(id: string): Promise<DraftDocument | null> {
  const result = await browser.storage.local.get(`${PREFIX}${id}`)
  return (result[`${PREFIX}${id}`] as DraftDocument | undefined) ?? null
}

export async function listDrafts(): Promise<DraftDocument[]> {
  const result = await browser.storage.local.get()
  return Object.entries(result)
    .filter(([key]) => key.startsWith(PREFIX))
    .map(([, value]) => value as DraftDocument)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
