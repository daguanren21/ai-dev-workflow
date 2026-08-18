import type { BaseAdapter } from '../adapters/base'
import type { TestCaseResult } from '../types/requirement'
import { z } from 'zod/v4'
import { sanitizeExternalInline, sanitizeExternalText, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content'

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

function formatTableCell(value: string): string {
  return sanitizeExternalText(value)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
}

function formatTestcases(result: TestCaseResult): string {
  const lines = [
    `# ${sanitizeExternalInline(result.taskName)} — 测试用例`,
    '',
    `- **模块**: ${sanitizeExternalInline(result.moduleName)}`,
    `- **共 ${result.totalCount} 个用例**（已加载 ${result.cases.length} 个）`,
    '',
    UNTRUSTED_SOURCE_NOTICE,
    '',
  ]

  for (const testCase of result.cases) {
    lines.push(`## ${sanitizeExternalInline(testCase.id)} ${sanitizeExternalInline(testCase.name)}`)
    lines.push('')
    lines.push(`- 优先级: ${sanitizeExternalInline(testCase.priority)} | 类型: ${sanitizeExternalInline(testCase.type)}`)
    if (testCase.assignName)
      lines.push(`- 维护人: ${sanitizeExternalInline(testCase.assignName)}`)
    if (testCase.condition)
      lines.push(`- 前置条件: ${sanitizeExternalText(testCase.condition)}`)
    if (testCase.desc)
      lines.push(`- 备注: ${sanitizeExternalText(testCase.desc)}`)

    if (testCase.steps.length > 0) {
      lines.push('')
      lines.push('| 步骤 | 操作描述 | 预期结果 |')
      lines.push('|------|----------|----------|')
      for (const step of testCase.steps)
        lines.push(`| ${step.index + 1} | ${formatTableCell(step.desc)} | ${formatTableCell(step.result)} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
