import type WebSocket from 'ws'

import { EventEmitter } from 'node:events'
import { type as json1 } from 'ot-json1'
import { describe, expect, it, vi } from 'vitest'
import { createTopLevelJson1Operation, replaceOnesWikiDocument } from '../../src/utils/ones-wiki-collab'

class FakeWebSocket extends EventEmitter {
  readonly sent: Array<Record<string, unknown>> = []

  send(data: string, callback?: (error?: Error) => void): void {
    const message = JSON.parse(data) as Record<string, unknown>
    this.sent.push(message)
    callback?.()

    if (message.a === 'hs') {
      queueMicrotask(() => this.frame({
        a: 'hs',
        id: 'client-demo',
        protocol: 1,
        protocolMinor: 1,
        type: 'http://sharejs.org/types/JSONv0',
      }))
    }
    else if (message.a === 'f') {
      queueMicrotask(() => this.frame({
        a: 'f',
        c: 'team-demo',
        d: 'document-demo',
        data: {
          v: 41,
          type: 'http://sharejs.org/types/JSONv1',
          data: {
            blocks: [{ id: 'block-demo', type: 'text', text: [{ insert: 'Before' }] }],
            comments: {},
            meta: { version: 1 },
            authors: [],
            commentators: [],
          },
        },
      }))
    }
    else if (message.a === 'ps') {
      queueMicrotask(() => this.frame({
        a: 'ps',
        ch: message.ch,
        seq: message.seq,
      }))
    }
    else if (message.a === 's') {
      queueMicrotask(() => this.frame({
        a: 's',
        c: 'team-demo',
        d: 'document-demo',
      }))
    }
    else if (message.a === 'op') {
      queueMicrotask(() => this.frame({
        a: 'op',
        c: 'team-demo',
        d: 'document-demo',
        seq: message.seq,
        v: Number(message.v) + 1,
      }))
    }
  }

  close(): void {}

  frame(message: Record<string, unknown>): void {
    this.emit('message', Buffer.from(JSON.stringify(message)))
  }
}

describe('ones Wiki collaboration protocol', () => {
  it('should generate a valid JSONv1 operation for changed top-level document partitions', () => {
    const current = {
      blocks: [{ id: 'before' }],
      comments: { keep: true },
      obsolete: [{ id: 'old' }],
    }
    const next = {
      blocks: [{ id: 'after' }],
      comments: { keep: true },
      added: [{ id: 'new' }],
    }

    const operation = createTopLevelJson1Operation(current, next)

    expect(operation).not.toBeNull()
    expect(json1.apply(current, operation)).toEqual(next)
  })

  it('should authenticate, handshake, subscribe to the initial snapshot, write, and await ack', async () => {
    const socket = new FakeWebSocket()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'set-cookie': 'wiz-session=editor-demo; Path=/; HttpOnly' }),
      json: () => Promise.resolve({ read: 'share-db-read-token', user: 'editor-user-demo' }),
    })
    const openWebSocket = vi.fn((_url: string, headers?: Record<string, string>) => {
      expect(headers).toMatchObject({
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cache-Control': 'no-cache',
        'Cookie': 'login-session=project-demo; wiz-session=editor-demo',
        'Origin': 'https://ones.test',
        'Pragma': 'no-cache',
      })
      queueMicrotask(() => socket.frame({
        a: 'init',
        id: 'client-demo',
        protocol: 1,
        protocolMinor: 1,
        type: 'http://sharejs.org/types/JSONv0',
      }))
      return socket as unknown as WebSocket
    })

    const resultPromise = replaceOnesWikiDocument({
      baseUrl: 'https://ones.test',
      teamId: 'team-demo',
      documentId: 'document-demo',
      accessToken: 'oauth-access-token',
      editorToken: 'live-editor-token',
      userId: 'session-user-demo',
      cookieHeader: 'login-session=project-demo',
      displayName: 'Example User',
    }, snapshot => ({
      ...snapshot,
      blocks: [{ id: 'block-demo', type: 'text', text: [{ insert: 'After' }] }],
    }), {
      fetch: fetchMock,
      openWebSocket,
    })

    await expect(resultPromise).resolves.toEqual({
      snapshotVersion: 41,
      version: 42,
      changed: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ones.test/wiki/api/wiki/editor/team-demo/document-demo/auth',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer oauth-access-token',
          'x-live-editor-token': 'live-editor-token',
          'Cookie': 'login-session=project-demo',
        }),
      }),
    )
    const authHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(Buffer.from(authHeaders['x-live-editor-base-url'], 'base64url').toString()).toBe(
      'https://ones.test/wiki/api/wiki/editor/team-demo/document-demo',
    )
    expect(socket.sent.map(message => message.a)).toEqual(['hs', 'f', 'p', 'ps', 's', 'op'])
    expect(socket.sent[0]).toEqual(expect.objectContaining({
      a: 'hs',
      id: null,
      auth: expect.objectContaining({
        appId: 'team-demo',
        docId: 'document-demo',
        permission: 'w',
        userId: 'session-user-demo',
        token: 'live-editor-token',
      }),
    }))
    expect(socket.sent[0]).not.toHaveProperty('protocol')
    expect(socket.sent[0]).not.toHaveProperty('protocolMinor')
    expect(socket.sent[0]).not.toHaveProperty('options')
    expect(socket.sent[1]).toEqual({ a: 'f', c: 'team-demo', d: 'document-demo' })
    expect(socket.sent[2]).toEqual(expect.objectContaining({
      a: 'p',
      ch: 'team-demo:document-demo',
      p: null,
      pv: 2,
    }))
    expect(socket.sent[3]).toEqual({ a: 'ps', ch: 'team-demo:document-demo', seq: 1 })
    expect(socket.sent[4]).toEqual({ a: 's', c: 'team-demo', d: 'document-demo', v: 41 })
    expect(socket.sent[5]).toEqual(expect.objectContaining({
      a: 'op',
      c: 'team-demo',
      d: 'document-demo',
      v: 41,
      seq: 1,
      x: {},
    }))
    expect(socket.sent[5]).not.toHaveProperty('src')
    expect(JSON.stringify(socket.sent[5].op)).toContain('"r":true')
  })
})
