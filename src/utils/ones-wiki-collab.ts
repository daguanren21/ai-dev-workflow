import type { Doc, JSONOp } from 'ot-json1'
import type { RawData } from 'ws'

import { randomBytes } from 'node:crypto'
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
  ch?: string
  d?: string
  v?: number
  seq?: number
  src?: string
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
  cookieHeader?: string
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
  openWebSocket: (url: string, headers?: Record<string, string>) => WebSocket
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  if (headers.getSetCookie)
    return headers.getSetCookie()
  const raw = headers.get('set-cookie')
  return raw ? [raw] : []
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
  const appendComponent = (component: JSONOp) => {
    operation = operation === null ? component : json1.compose(operation, component)
  }
  const keys = [...new Set([...Object.keys(current), ...Object.keys(next)])].sort()

  for (const key of keys) {
    if (key === 'blocks')
      continue
    const hasCurrent = Object.hasOwn(current, key)
    const hasNext = Object.hasOwn(next, key)
    if (!hasCurrent && hasNext)
      appendComponent(insertOp([key], asDoc(next[key])))
    else if (hasCurrent && !hasNext)
      appendComponent(removeOp([key]))
    else if (hasCurrent && hasNext && !isDeepStrictEqual(current[key], next[key]))
      appendComponent(replaceOp([key], asDoc(current[key]), asDoc(next[key])))
  }

  const currentBlocks = Array.isArray(current.blocks) ? current.blocks : []
  const nextBlocks = Array.isArray(next.blocks) ? next.blocks : []
  const sharedBlockCount = Math.min(currentBlocks.length, nextBlocks.length)
  for (let index = 0; index < sharedBlockCount; index += 1) {
    if (!isDeepStrictEqual(currentBlocks[index], nextBlocks[index])) {
      appendComponent(removeOp(['blocks', index]))
      appendComponent(insertOp(['blocks', index], asDoc(nextBlocks[index])))
    }
  }
  for (let index = currentBlocks.length - 1; index >= nextBlocks.length; index -= 1)
    appendComponent(removeOp(['blocks', index]))
  for (let index = currentBlocks.length; index < nextBlocks.length; index += 1)
    appendComponent(insertOp(['blocks', index], asDoc(nextBlocks[index])))

  if (operation !== null)
    json1.checkValidOp(operation)
  return operation
}

function createTopLevelJson1Operations(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): JSONOp[] {
  const operation = createTopLevelJson1Operation(current, next)
  return operation === null ? [] : [operation]
}

function wikiEditorUrls(baseUrl: string, teamId: string, documentId: string): { authUrl: string, editorBaseUrl: string, socketUrl: string } {
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('ONES Wiki collaboration requires an HTTP(S) source URL')
  const encodedTeamId = encodeURIComponent(teamId)
  const encodedDocumentId = encodeURIComponent(documentId)
  const path = `/wiki/api/wiki/editor/${encodedTeamId}/${encodedDocumentId}`
  const editorBaseUrl = new URL(path, url)
  const socketUrl = new URL(editorBaseUrl)
  socketUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return {
    authUrl: `${editorBaseUrl.toString()}/auth`,
    editorBaseUrl: editorBaseUrl.toString(),
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
    openWebSocket: (url, headers) => new WebSocket(url, { headers }),
  },
): Promise<OnesWikiCollabWriteResult> {
  const { authUrl, editorBaseUrl, socketUrl } = wikiEditorUrls(options.baseUrl, options.teamId, options.documentId)
  const authResponse = await dependencies.fetch(authUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${options.accessToken}`,
      'x-live-editor-token': options.editorToken,
      'x-live-editor-base-url': Buffer.from(editorBaseUrl).toString('base64url'),
      ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
    },
  })
  if (!authResponse.ok)
    throw new Error(`ONES Wiki collaboration auth failed with status ${authResponse.status}`)
  const editorAuth = await authResponse.json() as WikiEditorAuthResponse
  if (typeof editorAuth.read !== 'string' || !editorAuth.read)
    throw new Error('ONES Wiki collaboration auth response did not include a read token')
  const cookies = [
    options.cookieHeader,
    ...getSetCookies(authResponse).map(cookie => cookie.split(';')[0]),
  ].filter((cookie): cookie is string => Boolean(cookie)).join('; ')
  const socketHeaders: Record<string, string> = {
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
    'Origin': new URL(options.baseUrl).origin,
    ...(cookies ? { Cookie: cookies } : {}),
  }

  return new Promise<OnesWikiCollabWriteResult>((resolve, reject) => {
    const socket = dependencies.openWebSocket(socketUrl, socketHeaders)
    let sequence = 1
    let state: 'init' | 'handshake' | 'fetch' | 'presence' | 'subscribe' | 'ack' = 'init'
    let settled = false
    let snapshotVersion = 0
    let currentVersion = 0
    let pendingOperations: JSONOp[] = []
    const presenceChannel = `${options.teamId}:${options.documentId}`
    const presenceId = randomBytes(7).toString('base64url').slice(0, 9)
    let timeout: NodeJS.Timeout | undefined

    const finish = (result: OnesWikiCollabWriteResult) => {
      if (settled)
        return
      settled = true
      clearTimeout(timeout)
      resolve(result)
      closeSocket(socket)
    }
    const fail = (error: Error) => {
      if (settled)
        return
      settled = true
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
    const sendHandshake = () => {
      send({
        a: 'hs',
        id: null,
        auth: {
          appId: options.teamId,
          docId: options.documentId,
          userId: options.userId,
          permission: 'w',
          token: options.editorToken,
          displayName: options.displayName ?? '',
          avatarUrl: options.avatarUrl ?? '',
        },
      })
    }
    const sendNextOperation = () => {
      const operation = pendingOperations[0]
      if (operation === undefined)
        return
      send({
        a: 'op',
        c: options.teamId,
        d: options.documentId,
        v: currentVersion,
        seq: sequence,
        x: {},
        op: operation,
      })
    }

    timeout = setTimeout(() => {
      fail(new Error(`ONES Wiki collaboration timed out while waiting for ${state}`))
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    socket.on('open', sendHandshake)
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
        state = 'handshake'
        sendHandshake()
        return
      }

      if (state === 'handshake') {
        if (message.a !== 'hs' || typeof message.id !== 'string' || message.protocol !== 1 || message.protocolMinor !== 1 || message.type !== JSON0_URI) {
          fail(new Error('ONES Wiki collaboration returned an unsupported handshake frame'))
          return
        }
        state = 'fetch'
        send({ a: 'f', c: options.teamId, d: options.documentId })
        return
      }

      if (state === 'fetch') {
        const snapshot = message.data
        if (message.a !== 'f' || message.c !== options.teamId || message.d !== options.documentId || typeof snapshot?.v !== 'number' || snapshot.type !== JSON1_URI) {
          return
        }
        const current = asWikiSnapshot(snapshot.data)
        try {
          const next = asJsonDocument(update(structuredClone(current)), 'update')
          pendingOperations = createTopLevelJson1Operations(current, next)
        }
        catch (error) {
          fail(error instanceof Error ? error : new Error('ONES Wiki collaboration update failed'))
          return
        }
        snapshotVersion = snapshot.v
        currentVersion = snapshotVersion
        state = 'presence'
        send({ a: 'p', ch: presenceChannel, id: presenceId, p: null, pv: 2 })
        send({ a: 'ps', ch: presenceChannel, seq: 1 })
        return
      }

      if (state === 'presence') {
        if (message.a !== 'ps' || message.ch !== presenceChannel || message.seq !== 1)
          return
        state = 'subscribe'
        send({ a: 's', c: options.teamId, d: options.documentId, v: snapshotVersion })
        return
      }

      if (state === 'subscribe') {
        if (message.a !== 's' || message.c !== options.teamId || message.d !== options.documentId)
          return
        if (!pendingOperations.length) {
          finish({ snapshotVersion, version: snapshotVersion, changed: false })
          return
        }
        state = 'ack'
        sendNextOperation()
        return
      }

      if (state === 'ack' && message.a === 'op' && message.c === options.teamId && message.d === options.documentId && message.seq === sequence) {
        currentVersion = typeof message.v === 'number' ? message.v : currentVersion + 1
        pendingOperations.shift()
        if (!pendingOperations.length) {
          finish({ snapshotVersion, version: currentVersion, changed: true })
          return
        }
        sequence += 1
        sendNextOperation()
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
