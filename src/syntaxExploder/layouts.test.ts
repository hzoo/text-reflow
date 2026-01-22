import { describe, expect, test } from 'bun:test'
import { parseText, SAMPLE_TEXTS } from './document'
import { layoutPlainWrap, layoutCascade, layoutTree, layoutListAware, layoutMagnifyBlocks, layoutRadial } from './layouts'
import type { Metrics } from './experiments'

const defaultMetrics: Metrics = {
  charW: 10,
  lineH: 18,
  maxCols: 80,
  padX: 24,
  padY: 24,
}

const narrowMetrics: Metrics = {
  ...defaultMetrics,
  maxCols: 40,
}

describe('layoutPlainWrap', () => {
  test('places all words', () => {
    const doc = parseText('Hello world test')
    const layout = layoutPlainWrap(doc, defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })

  test('wraps at maxCols', () => {
    const doc = parseText('word '.repeat(20))
    const layout = layoutPlainWrap(doc, narrowMetrics)

    let maxCol = 0
    for (const pos of layout.values()) {
      maxCol = Math.max(maxCol, pos.col)
    }
    expect(maxCol).toBeLessThan(narrowMetrics.maxCols)
  })

  test('starts at col 0', () => {
    const doc = parseText('First word')
    const layout = layoutPlainWrap(doc, defaultMetrics)
    expect(layout.get('w0')?.col).toBe(0)
    expect(layout.get('w0')?.row).toBe(0)
  })
})

describe('layoutCascade', () => {
  test('indents sentences progressively', () => {
    const doc = parseText('First. Second. Third.')
    const layout = layoutCascade(doc, defaultMetrics)

    const firstPos = layout.get('w0')
    const secondPos = layout.get('w1')
    const thirdPos = layout.get('w2')

    expect(firstPos?.col).toBe(0)
    expect(secondPos!.col).toBeGreaterThan(firstPos!.col)
    expect(thirdPos!.col).toBeGreaterThan(secondPos!.col)
  })

  test('places sentences on different rows', () => {
    const doc = parseText('First sentence. Second sentence.')
    const layout = layoutCascade(doc, defaultMetrics)

    const firstRow = layout.get('w0')?.row
    const secondRow = layout.get('w2')?.row // "Second"

    expect(secondRow).toBeGreaterThan(firstRow!)
  })
})

describe('layoutTree', () => {
  test('handles text with subordinate clauses', () => {
    const doc = parseText('The cat, which was black, slept.')
    const layout = layoutTree(doc, defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })

  test('handles simple sentences', () => {
    const doc = parseText('Simple sentence here.')
    const layout = layoutTree(doc, defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })
})

describe('layoutListAware', () => {
  test('handles text with lists', () => {
    const doc = parseText('Options: first, second, third, and fourth.')
    const layout = layoutListAware(doc, defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })

  test('adapts to narrow screens', () => {
    const doc = parseText('Items: one, two, three, four, five.')
    const layout = layoutListAware(doc, narrowMetrics)
    expect(layout.size).toBe(doc.words.length)
  })

  test('handles non-list text gracefully', () => {
    const doc = parseText('Just a simple sentence.')
    const layout = layoutListAware(doc, defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })
})

describe('layoutMagnifyBlocks', () => {
  test('spaces sentences vertically', () => {
    const doc = parseText('First. Second. Third.')
    const layout = layoutMagnifyBlocks(doc, defaultMetrics)

    const rows = new Set<number>()
    for (const pos of layout.values()) {
      rows.add(pos.row)
    }
    expect(rows.size).toBeGreaterThan(1)
  })
})

describe('layoutRadial', () => {
  test('centers around pivot', () => {
    const doc = parseText('The cat is sleeping.')
    const layout = layoutRadial(doc, defaultMetrics)

    // "is" should be near center
    const isPos = layout.get('w2')
    expect(isPos?.col).toBeGreaterThan(20)
    expect(isPos?.col).toBeLessThan(60)
  })
})

describe('all layouts with sample texts', () => {
  const layouts = [
    { name: 'plainWrap', fn: layoutPlainWrap },
    { name: 'cascade', fn: layoutCascade },
    { name: 'tree', fn: layoutTree },
    { name: 'listAware', fn: layoutListAware },
    { name: 'magnifyBlocks', fn: layoutMagnifyBlocks },
    { name: 'radial', fn: layoutRadial },
  ]

  for (const [textName, text] of Object.entries(SAMPLE_TEXTS)) {
    for (const { name, fn } of layouts) {
      test(`${name} handles ${textName}`, () => {
        const doc = parseText(text)
        const layout = fn(doc, defaultMetrics)

        expect(layout.size).toBe(doc.words.length)

        for (const [, pos] of layout) {
          expect(pos.col).toBeGreaterThanOrEqual(0)
          expect(pos.row).toBeGreaterThanOrEqual(0)
        }
      })
    }
  }
})
