export interface OnesCreateInput { title: string, parentId: string | null, estimateHours: number | null, planStartDate: string | null, planEndDate: string | null, notes: string }

export interface OnesClient {
  getSessionStatus: () => Promise<'authenticated' | 'reauth-required' | 'not-configured'>
  createTask: (input: OnesCreateInput) => Promise<{ id: string }>
}
