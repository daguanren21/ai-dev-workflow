import type { Doc, JSONOp } from 'ot-json1'
import type { RawData } from 'ws'

import { isDeepStrictEqual } from 'node:util'
import { insertOp, type as json1, removeOp, replaceOp } from 'ot-json1'
import WebSocket from 'ws'

const JSON0_URI = 'http://sharejs.org/types/JSONv0'
const JSON1_URI = 'http://sharejs.org/types/JSONv1'
const DEFAULT_TIMEOUT_MS = 15_000

interface WikiEditorAuthResponse {
  read?: string
  user?: string
}

interface ShareDbMessage {
  a?: string
  id?: string
  c?: string
  d?: string
  v?: number
  seq?: number
  error?: unknown
  protocol?: number
  protocolMinor?: number
  type?: string
  data?: {
    v?: number
    type?: string
    data?: unknown
  }
}

export interface OnesWikiCollabOptions {
  baseUrl: string
  teamId: string
  documentId: string
  accessToken: string
  editorToken: string
  userId: string
  displayName?: string
  avatarUrl?: string
  timeoutMs?: number
}

export interface OnesWikiCollabWriteResult {
  snapshotVersion: number
  version: number
  changed: boolean
}

export interface OnesWikiCollabDependencies {
  fetch: typeof fetch
  openWebSocket: (url: string) => WebSocket
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asJsonDocument(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error(`ONES Wiki collaboration ${label} is not a JSON object`)
  return value
}

function asDoc(value: unknown): Doc {
  return value as Doc
}

export function createTopLevelJson1Operation(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): JSONOp {
  let operation: JSONOp = null
  const keys = [...new Set([...Object.keys(current), ...Object.keys(next)])].sort()

  for (const key of keys) {
    const hasCurrent = Object.hasOwn(current, key)
    const hasNext = Object.hasOwn(next, key)
    let component: JSONOp
    if (!hasCurrent) {
      component = insertOp([key], asDoc(next[key]))
    }
    else if (!hasNext) {
      component = removeOp([key])
    }
    else if (!isDeepStrictEqual(current[key], next[key])) {
      component = replaceOp([key], asDoc(current[key]), asDoc(next[key]))
    }
    else {
      continue
    }
    operation = operation === null ? component : json1.compose(operation, component)
  }

  if (operation !== null)
    json1.checkValidOp(operation)
  return operation
}

function wikiEditorUrls(baseUrl: string, teamId: string, documentId: string): { authUrl: string, socketUrl: string } {
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('ONES Wiki collaboration requires an HTTP(S) source URL')
  const encodedTeamId = encodeURIComponent(teamId)
  const encodedDocumentId = encodeURIComponent(documentId)
  const path = `/wiki/api/wiki/editor/${encodedTeamId}/${encodedDocumentId}`
  const socketUrl = new URL(path, url)
  socketUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return {
    authUrl: new URL(`${path}/auth`, url).toString(),
    socketUrl: socketUrl.toString(),
  }
}

function rawDataToText(data: RawData): string {
  if (typeof data === 'string')
    return data
  if (data instanceof ArrayBuffer)
    return Buffer.from(data).toString('utf8')
  if (Array.isArray(data))
    return Buffer.concat(data).toString('utf8')
  return data.toString('utf8')
}

function closeSocket(socket: WebSocket): void {
  try {
    socket.close(1000)
  }
  catch {
    // The operation result is already known; a close failure is not actionable.
  }
}

export async function replaceOnesWikiDocument(
  options: OnesWikiCollabOptions,
  update: (snapshot: Record<string, unknown>) => Record<string, unknown>,
  dependencies: OnesWikiCollabDependencies = {
    fetch,
    openWebSocket: url => new WebSocket(url),
  },
): Promise<OnesWikiCollabWriteResult> {
  const { authUrl, socketUrl } = wikiEditorUrls(options.baseUrl, options.teamId, options.documentId)
  const authResponse = await dependencies.fetch(authUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${options.accessToken}`,
      'x-live-editor-token': options.editorToken,
      'x-live-editor-base-url': Buffer.from(socketUrl).toString('base64url'),
    },
  })
  if (!authResponse.ok)
    throw new Error(`ONES Wiki collaboration auth failed with status ${authResponse.status}`)
  const editorAuth = await authResponse.json() as WikiEditorAuthResponse
  if (typeof editorAuth.read !== 'string' || !editorAuth.read)
    throw new Error('ONES Wiki collaboration auth response did not include a read token')

  return new Promise<OnesWikiCollabWriteResult>((resolve, reject) => {
    const socket = dependencies.openWebSocket(socketUrl)
    const sequence = 1
    let clientId = ''
    let state: 'init' | 'handshake' | 'snapshot' | 'ack' = 'init'
    let settled = false
    let snapshotVersion = 0
    let timeout: ReturnType<typeof setTimeout> | undefined

    const finish = (result: OnesWikiCollabWriteResult) => {
      if (settled)
        return
      settled = true
      if (timeout)
        clearTimeout(timeout)
      resolve(result)
      closeSocket(socket)
    }
    const fail = (error: Error) => {
      if (settled)
        return
      settled = true
      if (timeout)
        clearTimeout(timeout)
      reject(error)
      closeSocket(socket)
    }
    const send = (message: Record<string, unknown>) => {
      socket.send(JSON.stringify(message), (error?: Error) => {
        if (error)
          fail(new Error(`ONES Wiki collaboration send failed: ${error.message}`))
      })
    }

    timeout = setTimeout(() => {
      fail(new Error(`ONES Wiki collaboration timed out while waiting for ${state}`))
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    socket.on('error', () => fail(new Error('ONES Wiki collaboration WebSocket failed')))
    socket.on('close', (code) => {
      if (!settled)
        fail(new Error(`ONES Wiki collaboration WebSocket closed before ${state} (code ${code})`))
    })
    socket.on('message', (rawData) => {
      let message: ShareDbMessage
      try {
        message = JSON.parse(rawDataToText(rawData)) as ShareDbMessage
      }
      catch {
        fail(new Error('ONES Wiki collaboration returned an invalid JSON frame'))
        return
      }

      if (message.error !== undefined) {
        fail(new Error(`ONES Wiki collaboration rejected ${state}`))
        return
      }
      if (message.a === 'ping') {
        send({ a: 'pong' })
        return
      }
      if (message.a === 'p')
        return

      if (state === 'init') {
        if (message.a !== 'init' || typeof message.id !== 'string' || message.protocol !== 1 || message.protocolMinor !== 1 || message.type !== JSON0_URI) {
          fail(new Error('ONES Wiki collaboration returned an unsupported init frame'))
          return
        }
        clientId = message.id
        state = 'handshake'
        send({
          a: 'hs',
          id: clientId,
          auth: {
            appId: options.teamId,
            docId: options.documentId,
            userId: options.userId,
            permission: 'w',
            token: editorAuth.read,
            displayName: options.displayName ?? '',
            avatarUrl: options.avatarUrl ?? '',
          },
          options: { ping: { interval: 50_000, timeout: 150_000 } },
        })
        return
      }

      if (state === 'handshake') {
        if (message.a !== 'hs' || message.id !== clientId || message.protocol !== 1 || message.protocolMinor !== 1 || message.type !== JSON0_URI) {
          fail(new Error('ONES Wiki collaboration returned an unsupported handshake frame'))
          return
        }
        state = 'snapshot'
        send({ a: 's', c: options.teamId, d: options.documentId })
        return
      }

      if (state === 'snapshot') {
        const snapshot = message.data
        if (message.a !== 's' || message.c !== options.teamId || message.d !== options.documentId || typeof snapshot?.v !== 'number' || snapshot.type !== JSON1_URI) {
          fail(new Error('ONES Wiki collaboration returned an unsupported snapshot frame'))
          return
        }
        const current = asWikiSnapshot(snapshot.data)
        let next: Record<string, unknown>
        let operation: JSONOp
        try {
          next = asJsonDocument(update(structuredClone(current)), 'update')
          operation = createTopLevelJson1Operation(current, next)
        }
        catch (error) {
          fail(error instanceof Error ? error : new Error('ONES Wiki collaboration update failed'))
          return
        }
        snapshotVersion = snapshot.v
        if (operation === null) {
          finish({ snapshotVersion, version: snapshotVersion, changed: false })
          return
        }
        state = 'ack'
        send({
          a: 'op',
          c: options.teamId,
          d: options.documentId,
          v: snapshotVersion,
          seq: sequence,
          op: operation,
        })
        return
      }

      if (state === 'ack' && message.a === 'op' && message.c === options.teamId && message.d === options.documentId && message.seq === sequence) {
        finish({
          snapshotVersion,
          version: typeof message.v === 'number' ? message.v : snapshotVersion + 1,
          changed: true,
        })
      }
    })
  })
}

function asWikiSnapshot(value: unknown): Record<string, unknown> {
  const snapshot = asJsonDocument(value, 'snapshot')
  if (!Array.isArray(snapshot.blocks))
    throw new Error('ONES Wiki collaboration snapshot did not include a blocks array')
  return snapshot
}
