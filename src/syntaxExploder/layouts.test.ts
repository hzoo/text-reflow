import { describe, expect, test } from 'bun:test'
import { parseText, SAMPLE_TEXTS } from './document'
import { layoutReaderPixels, layoutLadderPixels } from './layouts'
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

describe('layoutReaderPixels', () => {
  test('places all words', () => {
    const doc = parseText('Hello world test')
    const layout = layoutReaderPixels({ model: doc, metrics: defaultMetrics })
    expect(layout.size).toBe(doc.words.length)
  })

  test('wraps at maxCols', () => {
    const doc = parseText('word '.repeat(20))
    const layout = layoutReaderPixels({ model: doc, metrics: narrowMetrics })

    let maxCol = 0
    for (const pos of layout.values()) {
      maxCol = Math.max(maxCol, pos.col)
    }
    expect(maxCol).toBeLessThan(narrowMetrics.maxCols)
  })

  test('starts at col 0', () => {
    const doc = parseText('First word')
    const layout = layoutReaderPixels({ model: doc, metrics: defaultMetrics })
    expect(layout.get('w0')?.col).toBe(0)
    expect(layout.get('w0')?.row).toBe(0)
  })
})

describe('layoutLadderPixels', () => {
  test('places all words', () => {
    const doc = parseText('First sentence. Second sentence.')
    const layout = layoutLadderPixels({ model: doc, metrics: defaultMetrics })
    expect(layout.size).toBe(doc.words.length)
  })

  test('indents subsequent paragraphs or wraps', () => {
    const doc = parseText('First. Second. Third.')
    const layout = layoutLadderPixels({ model: doc, metrics: defaultMetrics })
    // Ladder logic: x resets to 0 or indent based on paragraph breaks or wrap
    // We just verify it produces valid coordinates
    for (const pos of layout.values()) {
      expect(pos.col).toBeGreaterThanOrEqual(0)
      expect(pos.row).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('layout edge cases', () => {
  test('empty document → empty map', () => {
    expect(layoutReaderPixels({ model: parseText(''), metrics: defaultMetrics }).size).toBe(0)
    expect(layoutLadderPixels({ model: parseText(''), metrics: defaultMetrics }).size).toBe(0)
  })

  test('breakAfter inserts row gap', () => {
    const doc = parseText('one two three')
    doc.words.forEach(w => { w.pixelWidth = 20 })
    doc.words[0].breakAfter = true
    doc.words[0].breakAfterRows = 1
    const layout = layoutReaderPixels({ model: doc, metrics: defaultMetrics })
    expect(layout.get('w1')?.row).toBe(1)
  })

  test('ladder indent toggles on paragraph boundaries', () => {
    const doc = parseText('first second third')
    doc.words.forEach((w, i) => { w.pixelWidth = 20; w.paragraphIndex = i })
    const layout = layoutLadderPixels({ model: doc, metrics: defaultMetrics, paragraphBreakRows: 1 })
    expect(layout.get('w0')?.col).toBe(0)
    expect(layout.get('w1')!.col).toBeGreaterThan(0)
    expect(layout.get('w2')?.col).toBe(0)
  })
})

describe('all layouts with sample texts', () => {
  const layouts = [
    { name: 'reader', fn: layoutReaderPixels },
    { name: 'ladder', fn: layoutLadderPixels },
  ]

  for (const [textName, text] of Object.entries(SAMPLE_TEXTS)) {
    for (const { name, fn } of layouts) {
      test(`${name} handles ${textName}`, () => {
        const doc = parseText(text)
        const layout = fn({ model: doc, metrics: defaultMetrics })

        expect(layout.size).toBe(doc.words.length)

        for (const [, pos] of layout) {
          expect(pos.col).toBeGreaterThanOrEqual(0)
          expect(pos.row).toBeGreaterThanOrEqual(0)
        }
      })
    }
  }
})
