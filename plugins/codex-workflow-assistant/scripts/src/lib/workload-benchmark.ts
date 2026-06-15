export type ComplexityLevel = 'simple' | 'medium' | 'complex'

export interface WorkloadBenchmark {
  id: number
  category: string
  work: string
  simpleHours: number
  mediumHours: number
  complexHours: number | null
}

export interface BenchmarkLimit {
  category: string
  work: string
  complexity: ComplexityLevel
  limitHours: number
}

export const WORKLOAD_BENCHMARKS: WorkloadBenchmark[] = [
  { id: 1, category: '前端-界面修改', work: '已有界面修改', simpleHours: 6, mediumHours: 12, complexHours: 20 },
  { id: 2, category: '前端-新增页面/表单', work: '新增独立页面/表单', simpleHours: 8, mediumHours: 16, complexHours: 24 },
  { id: 3, category: '前端-新增组件', work: '新增通用/业务组件', simpleHours: 4, mediumHours: 8, complexHours: 16 },
  { id: 4, category: '前端-图表/大屏', work: '图表/大屏开发', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 5, category: '前端-移动端/主题/国际化适配', work: '移动端/主题/国际化改造', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 6, category: '后端-新增CRUD模块', work: '新增 CRUD 模块', simpleHours: 8, mediumHours: 16, complexHours: 24 },
  { id: 7, category: '后端-新增业务逻辑', work: '新增业务逻辑', simpleHours: 12, mediumHours: 20, complexHours: 24 },
  { id: 8, category: '后端-调整业务逻辑', work: '调整业务逻辑', simpleHours: 6, mediumHours: 12, complexHours: 20 },
  { id: 9, category: '后端-定时任务/批处理', work: '定时任务/批处理', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 10, category: '后端-消息队列', work: '消息队列（生产/消费）', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 11, category: '后端-新增接口（提供方）', work: '提供方-新增接口', simpleHours: 8, mediumHours: 16, complexHours: 24 },
  { id: 12, category: '后端-调用外部接口（消费方）', work: '调用外部接口（消费方）', simpleHours: 8, mediumHours: 16, complexHours: 24 },
  { id: 13, category: '后端-修改已有接口', work: '已有接口修改/完善', simpleHours: 4, mediumHours: 8, complexHours: 12 },
  { id: 14, category: '后端-新增查询接口', work: '新增数据查询接口', simpleHours: 4, mediumHours: 8, complexHours: 12 },
  { id: 15, category: '后端-修改查询接口', work: '已有数据查询接口修改', simpleHours: 4, mediumHours: 8, complexHours: 12 },
  { id: 16, category: '后端-三方API集成', work: '第三方平台集成', simpleHours: 6, mediumHours: 12, complexHours: 20 },
  { id: 17, category: '后端-新增流程', work: '新增整套流程', simpleHours: 16, mediumHours: 20, complexHours: 24 },
  { id: 18, category: '后端-流程调整', work: '流程调整', simpleHours: 4, mediumHours: 16, complexHours: null },
  { id: 19, category: '后端-权限/菜单配置', work: '权限/菜单配置', simpleHours: 2, mediumHours: 8, complexHours: 16 },
  { id: 20, category: '后端-新增导入', work: '新增导入功能', simpleHours: 8, mediumHours: 16, complexHours: 20 },
  { id: 21, category: '后端-修改导入', work: '已有导入功能修改', simpleHours: 6, mediumHours: 10, complexHours: null },
  { id: 22, category: '后端-新增导出', work: '新增导出功能', simpleHours: 8, mediumHours: 16, complexHours: 20 },
  { id: 23, category: '后端-修改导出', work: '已有导出功能修改', simpleHours: 6, mediumHours: 12, complexHours: null },
  { id: 24, category: '后端-数据处理', work: '上线一次性脚本处理', simpleHours: 4, mediumHours: 12, complexHours: 20 },
  { id: 25, category: '后端-报表统计', work: '统计类', simpleHours: 4, mediumHours: 8, complexHours: 16 },
  { id: 26, category: '后端-报表分析', work: '分析类', simpleHours: 12, mediumHours: 16, complexHours: 24 },
  { id: 27, category: '后端-报表变更', work: '报表变更', simpleHours: 4, mediumHours: 6, complexHours: 12 },
  { id: 28, category: '数开-ODS', work: 'ODS 层表开发（源数据接入）', simpleHours: 4, mediumHours: 8, complexHours: 16 },
  { id: 29, category: '数开-DWD', work: 'DWD 层开发（明细层建模）', simpleHours: 6, mediumHours: 12, complexHours: 24 },
  { id: 30, category: '数开-DWS', work: 'DWS 层开发（汇总层聚合指标）', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 31, category: '数开-ADS', work: 'ADS 层开发（应用数据服务层）', simpleHours: 4, mediumHours: 8, complexHours: 16 },
  { id: 33, category: '数开-调度管理', work: '调度任务配置与 DAG 管理（DataWorks 调度）', simpleHours: 2, mediumHours: 4, complexHours: 8 },
  { id: 34, category: '数开-数据质量', work: '数据质量规则配置（DataWorks DQC）', simpleHours: 2, mediumHours: 4, complexHours: 8 },
  { id: 35, category: '数开-维度建模', work: '维表/维度建模开发', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 36, category: '数开-指标开发', work: '指标/标签开发', simpleHours: 4, mediumHours: 10, complexHours: 20 },
  { id: 37, category: '数开-变更优化', work: '已有任务变更与优化', simpleHours: 4, mediumHours: 8, complexHours: 16 },
]

export function findBenchmark(category: string): WorkloadBenchmark | undefined {
  return WORKLOAD_BENCHMARKS.find(item => item.category === category || item.work === category)
}

export function getBenchmarkLimit(category: string, complexity: ComplexityLevel = 'medium'): number {
  const benchmark = findBenchmark(category)
  if (!benchmark) {
    throw new Error(`Unknown workload benchmark category: ${category}`)
  }

  if (complexity === 'simple') {
    return benchmark.simpleHours
  }
  if (complexity === 'medium') {
    return benchmark.mediumHours
  }
  return benchmark.complexHours ?? benchmark.mediumHours
}

export function getBenchmarkMetadata(category: string, complexity: ComplexityLevel = 'medium'): BenchmarkLimit {
  const benchmark = findBenchmark(category)
  if (!benchmark) {
    throw new Error(`Unknown workload benchmark category: ${category}`)
  }

  return {
    category: benchmark.category,
    work: benchmark.work,
    complexity,
    limitHours: getBenchmarkLimit(category, complexity),
  }
}
