import { describe, expect, it } from 'vitest'
import { normalizeWikiPath, parseWikiTextRun, redactWikiSecrets, selectExactTableHeaders } from '../../src/utils/wiki-content'

describe('wiki content safety', () => {
  it('redacts secret key/value pairs and secret table columns by default', () => {
    const input = [
      '| Environment | Account | Password |',
      '| --- | --- | --- |',
      '| sandbox | demo-user | mock-password-value |',
      '',
      'token: mock-token-value',
    ].join('\n')

    const result = redactWikiSecrets(input)
    expect(result).toContain('| sandbox | demo-user | [REDACTED] |')
    expect(result).toContain('token: [REDACTED]')
    expect(result).not.toContain('mock-password-value')
    expect(result).not.toContain('mock-token-value')
  })

  it('reveals mock secrets only when explicitly requested', () => {
    expect(redactWikiSecrets('password: mock-value', true)).toContain('mock-value')
  })

  it('preserves safe HTML table structure and redacts sensitive columns', () => {
    const input = [
      '<table>',
      '<tbody>',
      '<tr><td>Goal</td><td>Owner</td><td>Password</td></tr>',
      '<tr><td rowspan="2" onclick="unsafe()">Example</td><td>@Example Owner</td><td>mock-password</td></tr>',
      '<tr><td><script>unsafe()</script>Backup Owner</td><td>mock-password-2</td></tr>',
      '</tbody>',
      '</table>',
    ].join('\n')

    const result = redactWikiSecrets(input)
    expect(result).toContain('<table>')
    expect(result).toContain('<td rowspan="2">Example</td>')
    expect(result).toContain('@Example Owner')
    expect(result).toContain('<td>[REDACTED]</td>')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('mock-password')
  })

  it('selects one exact table and rejects ambiguous matches', () => {
    const content = [
      '| Goal | Owner | Status |',
      '| --- | --- | --- |',
      '| Example | Demo User | Planned |',
      '',
      '| Service | Owner |',
      '| --- | --- |',
      '| Demo | Demo User |',
    ].join('\n')

    expect(selectExactTableHeaders(content, ['Goal', 'Status'])).toEqual(['Goal', 'Owner', 'Status'])
    expect(() => selectExactTableHeaders(content, ['Owner'])).toThrow('Multiple tables')
  })

  it('normalizes exact breadcrumb paths and rejects traversal', () => {
    expect(normalizeWikiPath('Example Team / Annual Plan / Goals')).toEqual([
      'Example Team',
      'Annual Plan',
      'Goals',
    ])
    expect(() => normalizeWikiPath('Example Team/../Secrets')).toThrow('unsafe')
  })

  it('renders an ONES mention from its display text instead of its placeholder', () => {
    expect(parseWikiTextRun({
      insert: ' ',
      attributes: {
        id: 'mention-demo',
        type: 'user',
        text: '@Example Owner',
        mentionId: 'user-demo',
      },
    })).toEqual({
      text: '@Example Owner',
      attributes: {
        id: 'mention-demo',
        type: 'user',
        text: '@Example Owner',
        mentionId: 'user-demo',
      },
    })
  })

  it('does not treat unrelated rich-text attributes as a mention', () => {
    expect(parseWikiTextRun({
      insert: 'Visible text',
      attributes: { text: 'Not a mention', bold: true },
    })?.text).toBe('Visible text')
  })
})
