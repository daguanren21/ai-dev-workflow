export type Confidence = 'high' | 'medium' | 'low'
export type DraftTaskStatus = 'draft' | 'creating' | 'created' | 'failed'

export interface DraftTask {
  id: string
  parentId: string | null
  requirementKeys: string[]
  title: string
  estimateHours: number | null
  planStartDate: string | null
  planEndDate: string | null
  notes: string
  sourceText: string
  confidence: Confidence
  warnings: string[]
  status: DraftTaskStatus
  onesTaskId: string | null
  errorMessage: string | null
}

export interface DraftDocument {
  id: string
  sourceName: string
  rawText: string
  tasks: DraftTask[]
  createdAt: string
  updatedAt: string
}
