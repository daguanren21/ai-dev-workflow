import { describe, expect, it } from 'vitest'
import { applyWikiUpdateOperation, markdownToWikiDocument, markdownToWikiHtml, renderWikiContent } from '../../src/adapters/ones/wiki-document'

describe('ones Wiki Markdown document generation', () => {
  it('creates a native table with stable column widths and complete cells', () => {
    const document = markdownToWikiDocument([
      '| Version | Capability | Status |',
      '| --- | --- | --- |',
      '| v3 | Virtual table | Supported |',
      '| v4 | Virtual table | Supported |',
    ].join('\n'))
    const blocks = document.blocks as Array<Record<string, unknown>>
    const table = blocks[0]

    expect(table).toMatchObject({
      type: 'table',
      rows: 3,
      cols: 3,
      colsWidth: [100, 115, 100],
    })
    expect(table.children).toHaveLength(9)
    const childIds = table.children as string[]
    const generatedIds = [
      table.id,
      ...childIds,
      ...childIds.map(id => (document[id] as Array<Record<string, unknown>>)[0].id),
    ]
    expect(generatedIds.every(id => typeof id === 'string' && /^[a-z][a-z0-9]{8}$/i.test(id))).toBe(true)
    expect(renderWikiContent(JSON.stringify(document))).toContain('| v4 | Virtual table | Supported |')
  })

  it('preserves ordered-list numbers and groups consecutive items', () => {
    const document = markdownToWikiDocument([
      '1. First check',
      '2. Second check',
      '3. Third check',
      '4. Fourth check',
    ].join('\n'))
    const lists = document.blocks as Array<Record<string, unknown>>

    expect(new Set(lists.map(block => block.groupId)).size).toBe(1)
    expect(lists.every(block => block.ordered === true)).toBe(true)
    const rendered = renderWikiContent(JSON.stringify(document))
    expect(rendered).toContain('1. First check')
    expect(rendered).toContain('2. Second check')
    expect(rendered).toContain('3. Third check')
    expect(rendered).toContain('4. Fourth check')
  })

  it('converts Markdown reference links into native ONES link runs', () => {
    const document = markdownToWikiDocument(
      '- [Official guide](https://docs.example.test/guide)',
    )
    const blocks = document.blocks as Array<Record<string, unknown>>

    expect(blocks[0].text).toEqual([{
      insert: 'Official guide',
      attributes: { link: 'https://docs.example.test/guide' },
    }])
    expect(renderWikiContent(JSON.stringify(document))).toContain(
      '[Official guide](https://docs.example.test/guide)',
    )
  })

  it('renders tables, ordered numbers, and links as publishable Wiki HTML', () => {
    const html = markdownToWikiHtml([
      '| Version | Status |',
      '| --- | --- |',
      '| v3 | Supported |',
      '',
      '1. First check',
      '1. Second `check`',
      '',
      '- [Official guide](https://docs.example.test/guide)',
    ].join('\n'))

    expect(html).toContain('<table style="width:100%">')
    expect(html).toContain('<ol start="1"><li>First check</li><li>Second <code>check</code></li></ol>')
    expect(html).toContain('<a href="https://docs.example.test/guide"')
  })

  it('replaces an existing collaborative document without changing its page identity', () => {
    const existing = JSON.stringify({
      blocks: [{ id: 'old-block', type: 'text', text: [{ insert: 'Old content' }] }],
      comments: {},
      meta: {},
    })
    const replaced = applyWikiUpdateOperation(existing, {
      type: 'replace_document',
      markdown: [
        '# Updated research',
        '',
        '1. First',
        '2. Second',
      ].join('\n'),
    })

    expect(renderWikiContent(replaced)).toContain('# Updated research')
    expect(renderWikiContent(replaced)).toContain('1. First')
    expect(renderWikiContent(replaced)).toContain('2. Second')
    expect(renderWikiContent(replaced)).not.toContain('Old content')
  })
})
