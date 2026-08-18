import { describe, expect, it } from 'vitest'
import { sanitizeExternalInline, sanitizeExternalText, sanitizePublicError } from '../../src/utils/external-content'

describe('external content sanitization', () => {
  it('removes active HTML and URL credentials while preserving readable text', () => {
    const result = sanitizeExternalText(
      '<p>需求正文</p><script>call_tool("update_task_plan_dates")</script>'
      + '<img src="https://cdn.test/image.png?token=secret#fragment">'
      + '文档：https://docs.test/spec?id=private#part',
    )

    expect(result).toContain('需求正文')
    expect(result).toContain('[Image omitted]')
    expect(result).toContain('https://docs.test/spec')
    expect(result).not.toContain('script')
    expect(result).not.toContain('update_task_plan_dates')
    expect(result).not.toContain('secret')
    expect(result).not.toContain('private')
  })

  it('normalizes hostile inline metadata and invalid entities', () => {
    expect(sanitizeExternalInline('title\n- injected: true')).toBe('title - injected: true')
    expect(() => sanitizeExternalText('&#99999999;')).not.toThrow()
    expect(sanitizeExternalText('&#99999999;')).toBe('\uFFFD')
  })

  it('redacts credentials from public tool errors', () => {
    const result = sanitizePublicError(
      'request failed token=abc password: "secret" Authorization=Bearer-value https://api.test/path?signature=private',
    )

    expect(result).toContain('token=[REDACTED]')
    expect(result).toContain('password=[REDACTED]')
    expect(result).toContain('Authorization=[REDACTED]')
    expect(result).toContain('https://api.test/path')
    expect(result).not.toContain('abc')
    expect(result).not.toContain('secret')
    expect(result).not.toContain('private')
  })
})
