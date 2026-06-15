import { describe, expect, it } from 'vitest'
import {
  findBenchmark,
  getBenchmarkLimit,
  WORKLOAD_BENCHMARKS,
} from '../../../plugins/codex-workflow-assistant/scripts/src/lib/workload-benchmark.ts'

describe('workload benchmarks', () => {
  it('loads the workload reference rows used for estimation', () => {
    expect(WORKLOAD_BENCHMARKS.length).toBe(36)
    expect(findBenchmark('前端-新增组件')).toMatchObject({
      category: '前端-新增组件',
      work: '新增通用/业务组件',
      simpleHours: 4,
      mediumHours: 8,
      complexHours: 16,
    })
  })

  it('uses medium hours as the default baseline for middle-level estimates', () => {
    expect(getBenchmarkLimit('前端-新增组件')).toBe(8)
    expect(getBenchmarkLimit('后端-新增CRUD模块')).toBe(16)
  })

  it('uses the nearest available level when a requested level has no value', () => {
    expect(getBenchmarkLimit('后端-流程调整', 'complex')).toBe(16)
  })
})
