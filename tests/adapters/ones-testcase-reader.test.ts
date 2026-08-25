import type { OnesApiClient } from '../../src/adapters/ones/api-client'
import type { SourceConfig } from '../../src/types/config'
import { describe, expect, it, vi } from 'vitest'
import { OnesTestcaseReader } from '../../src/adapters/ones/testcase-reader'

describe('onesTestcaseReader', () => {
  it('rejects defects before querying testcase libraries', async () => {
    const graphql = vi.fn().mockResolvedValue({
      data: {
        buckets: [{
          tasks: [{
            uuid: 'defect-1',
            number: 42,
            name: 'Broken behavior',
            issueType: { uuid: 'defect', name: '缺陷', detailType: 3 },
          }],
        }],
      },
    })
    const reader = new OnesTestcaseReader({
      config: { apiBase: 'https://ones.example.test' } as SourceConfig,
      api: { graphql } as unknown as OnesApiClient,
      refreshImageUrls: vi.fn(),
    })

    const request = reader.get({ taskNumber: 42 })
    await expect(request).rejects.toThrow('get_testcases does not apply')
    expect(graphql).toHaveBeenCalledOnce()
  })
})
