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
    else if (message.a === 's') {
      queueMicrotask(() => this.frame({
        a: 's',
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
    else if (message.a === 'op') {
      queueMicrotask(() => this.frame({
        a: 'op',
        c: 'team-demo',
        d: 'document-demo',
        src: 'client-demo',
        seq: 1,
        v: 42,
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
      json: () => Promise.resolve({ read: 'share-db-read-token', user: 'user-demo' }),
    })

    const resultPromise = replaceOnesWikiDocument({
      baseUrl: 'https://ones.test',
      teamId: 'team-demo',
      documentId: 'document-demo',
      accessToken: 'oauth-access-token',
      editorToken: 'live-editor-token',
      userId: 'user-demo',
      displayName: 'Example User',
    }, snapshot => ({
      ...snapshot,
      blocks: [{ id: 'block-demo', type: 'text', text: [{ insert: 'After' }] }],
    }), {
      fetch: fetchMock,
      openWebSocket: () => {
        queueMicrotask(() => socket.frame({
          a: 'init',
          id: 'client-demo',
          protocol: 1,
          protocolMinor: 1,
          type: 'http://sharejs.org/types/JSONv0',
        }))
        return socket as unknown as WebSocket
      },
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
        }),
      }),
    )
    const authHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(Buffer.from(authHeaders['x-live-editor-base-url'], 'base64url').toString()).toBe(
      'wss://ones.test/wiki/api/wiki/editor/team-demo/document-demo',
    )
    expect(socket.sent.map(message => message.a)).toEqual(['hs', 's', 'op'])
    expect(socket.sent[0]).toEqual(expect.objectContaining({
      a: 'hs',
      id: 'client-demo',
      auth: expect.objectContaining({
        appId: 'team-demo',
        docId: 'document-demo',
        permission: 'w',
        token: 'share-db-read-token',
      }),
    }))
    expect(socket.sent[1]).toEqual({ a: 's', c: 'team-demo', d: 'document-demo' })
    expect(socket.sent[2]).toEqual(expect.objectContaining({
      a: 'op',
      c: 'team-demo',
      d: 'document-demo',
      v: 41,
      seq: 1,
    }))
  })
})
