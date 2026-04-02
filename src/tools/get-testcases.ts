import type { BaseAdapter } from '../adapters/base.js'
import type { TestCaseResult } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetTestcasesSchema = z.object({
  taskNumber: z.string().describe('Task number (e.g. "302" or "#302"). Finds all testcases in the matching module.'),
  libraryUuid: z.string().optional().describe('Testcase library UUID. If omitted, uses configured default.'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetTestcasesInput = z.infer<typeof GetTestcasesSchema>

export async function handleGetTestcases(
  input: GetTestcasesInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const sourceType = input.source ?? defaultSource
  if (!sourceType) {
    throw new Error('No source specified and no default source configured')
  }

  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }

  const numMatch = input.taskNumber.match(/^#?(\d+)$/)
  if (!numMatch) {
    throw new Error(`Invalid task number: "${input.taskNumber}". Expected a number like "302" or "#302".`)
  }

  const result = await adapter.getTestcases({
    taskNumber: Number.parseInt(numMatch[1], 10),
    libraryUuid: input.libraryUuid,
  })

  return {
    content: [{ type: 'text' as const, text: formatTestcases(result) }],
  }
}

function formatTestcases(result: TestCaseResult): string {
  const lines = [
    `# ${result.taskName} — 测试用例`,
    '',
    `- **模块**: ${result.moduleName}`,
    `- **共 ${result.totalCount} 个用例**（已加载 ${result.cases.length} 个）`,
    '',
  ]

  for (const tc of result.cases) {
    lines.push(`## ${tc.id} ${tc.name}`)
    lines.push('')
    lines.push(`- 优先级: ${tc.priority} | 类型: ${tc.type}`)
    if (tc.assignName)
      lines.push(`- 维护人: ${tc.assignName}`)
    if (tc.condition)
      lines.push(`- 前置条件: ${tc.condition}`)
    if (tc.desc)
      lines.push(`- 备注: ${tc.desc}`)

    if (tc.steps.length > 0) {
      lines.push('')
      lines.push('| 步骤 | 操作描述 | 预期结果 |')
      lines.push('|------|----------|----------|')
      for (const step of tc.steps) {
        const desc = step.desc.replace(/\n/g, '<br>')
        const res = step.result.replace(/\n/g, '<br>')
        lines.push(`| ${step.index + 1} | ${desc} | ${res} |`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
