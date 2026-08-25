import type { SourceConfig } from '../../src/types/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnesApiClient } from '../../src/adapters/ones/api-client'

describe('onesApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends GraphQL requests with the cached bearer session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new OnesApiClient({
      apiBase: 'https://ones.example.test',
    } as SourceConfig, {})
    Object.assign(client, {
      session: {
        accessToken: 'access-token',
        teamUuid: 'team-1',
        orgUuid: 'org-1',
        userUuid: 'user-1',
        userName: 'User',
        expiresAt: Date.now() + 60_000,
      },
    })

    const request = client.graphql('query Example { ok }', { id: 'task-1' }, 'Task')
    await expect(request).resolves.toEqual({ data: { ok: true } })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ones.example.test/project/api/project/team/team-1/items/graphql?t=Task',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer access-token',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          query: 'query Example { ok }',
          variables: { id: 'task-1' },
        }),
      }),
    )
  })
})
