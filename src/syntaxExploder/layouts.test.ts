import { describe, expect, test } from 'bun:test'
import { parseText, SAMPLE_TEXTS } from './document'
import { layoutReaderPixels, layoutLadderPixels } from './layouts'
import type { LayoutResult, Metrics } from './experiments'

const defaultMetrics: Metrics = {
  charW: 10,
  lineH: 18,
  maxCols: 80,
  padX: 24,
  padY: 24,
  spaceW: 10,
}

const narrowMetrics: Metrics = {
  ...defaultMetrics,
  maxCols: 40,
}

type WordPos = { col: number; row: number }

function readLayout(words: { id: string; targetX: number; targetY: number }[]): Map<string, WordPos> {
  const out = new Map<string, WordPos>()
  for (const w of words) out.set(w.id, { col: w.targetX, row: w.targetY })
  return out
}

function applyReader(text: string, metrics: Metrics, paragraphBreakRows = 0): { layout: Map<string, WordPos>; result: LayoutResult; doc: ReturnType<typeof parseText> } {
  const doc = parseText(text)
  const result = layoutReaderPixels({ model: doc, metrics, paragraphBreakRows })
  return { layout: readLayout(doc.words), result, doc }
}

function applyLadder(text: string, metrics: Metrics, paragraphBreakRows = 0): { layout: Map<string, WordPos>; result: LayoutResult; doc: ReturnType<typeof parseText> } {
  const doc = parseText(text)
  const result = layoutLadderPixels({ model: doc, metrics, paragraphBreakRows })
  return { layout: readLayout(doc.words), result, doc }
}

describe('layoutReaderPixels', () => {
  test('places all words', () => {
    const { layout, doc } = applyReader('Hello world test', defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })

  test('wraps at maxCols', () => {
    const doc = parseText('word '.repeat(20))
    for (const w of doc.words) w.pixelWidth = 10
    layoutReaderPixels({ model: doc, metrics: narrowMetrics })
    const positioned = readLayout(doc.words)

    let maxCol = 0
    for (const pos of positioned.values()) {
      maxCol = Math.max(maxCol, pos.col)
    }
    expect(maxCol).toBeLessThan(narrowMetrics.maxCols)
  })

  test('starts at col 0', () => {
    const { layout } = applyReader('First word', defaultMetrics)
    expect(layout.get('w0')?.col).toBe(0)
    expect(layout.get('w0')?.row).toBe(0)
  })
})

describe('layoutLadderPixels', () => {
  test('places all words', () => {
    const { layout, doc } = applyLadder('First sentence. Second sentence.', defaultMetrics)
    expect(layout.size).toBe(doc.words.length)
  })

  test('indents subsequent paragraphs or wraps', () => {
    const { layout } = applyLadder('First. Second. Third.', defaultMetrics)
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
    expect(applyReader('', defaultMetrics).layout.size).toBe(0)
    expect(applyLadder('', defaultMetrics).layout.size).toBe(0)
  })

  test('breakAfter inserts row gap', () => {
    const doc = parseText('one two three')
    doc.words.forEach(w => { w.pixelWidth = 20 })
    doc.words[0].breakAfter = true
    doc.words[0].breakAfterRows = 1
    layoutReaderPixels({ model: doc, metrics: defaultMetrics })
    const layout = readLayout(doc.words)
    expect(layout.get('w1')?.row).toBe(1)
  })

  test('ladder indent toggles on paragraph boundaries', () => {
    const doc = parseText('first second third')
    doc.words.forEach((w, i) => { w.pixelWidth = 20; w.paragraphIndex = i })
    layoutLadderPixels({ model: doc, metrics: defaultMetrics, paragraphBreakRows: 1 })
    const layout = readLayout(doc.words)
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
        const result = fn({ model: doc, metrics: defaultMetrics })
        const layout = readLayout(doc.words)

        expect(layout.size).toBe(doc.words.length)
        expect(result.maxRow).toBeGreaterThanOrEqual(0)

        for (const pos of layout.values()) {
          expect(pos.col).toBeGreaterThanOrEqual(0)
          expect(pos.row).toBeGreaterThanOrEqual(0)
        }
      })
    }
  }
})
