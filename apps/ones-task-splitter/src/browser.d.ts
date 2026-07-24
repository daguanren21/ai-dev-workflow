declare const browser: {
  storage: {
    local: {
      get: (key?: string) => Promise<Record<string, unknown>>
      set: (values: Record<string, unknown>) => Promise<void>
    }
  }
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>
    getURL: (path: string) => string
    onMessage: { addListener: (callback: (message: any) => unknown) => void }
  }
  tabs: { create: (options: { url: string }) => Promise<unknown> }
}
