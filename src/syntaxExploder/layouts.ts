import type { LayoutMap, LayoutContext } from './experiments'

export function layoutReaderPixels({ model, metrics, words: overrideWords, paragraphBreakRows = 0 }: LayoutContext): LayoutMap {
  const map: LayoutMap = new Map()
  const words = overrideWords ?? model.words
  const maxWidth = metrics.maxCols
  let row = 0
  let x = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const next = words[i + 1]
    const width = Math.max(1, w.pixelWidth)
    if (x > 0 && x + width > maxWidth) {
      row++
      x = 0
    }

    map.set(w.id, { col: Math.round(x), row })
    x += width

    const isParagraphEnd = !next || next.paragraphIndex !== w.paragraphIndex
    const baseBreak = w.breakAfter ? Math.max(1, w.breakAfterRows) : 0
    const breakRows = isParagraphEnd ? Math.max(baseBreak, paragraphBreakRows) : baseBreak
    if (breakRows > 0) {
      row += breakRows
      x = 0
    }
  }

  return map
}

export function layoutLadderPixels({ model, metrics, words: overrideWords, paragraphBreakRows = 0 }: LayoutContext): LayoutMap {
  const map: LayoutMap = new Map()
  const words = overrideWords ?? model.words
  const maxWidth = metrics.maxCols
  const maxIndent = Math.floor(maxWidth * 0.18)

  let row = 0
  let x = 0
  let indent = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const next = words[i + 1]
    const width = Math.max(1, w.pixelWidth)
    if (x === 0) x = indent

    if (x > 0 && x + width > maxWidth) {
      row++
      x = indent
    }

    map.set(w.id, { col: Math.round(x), row })
    x += width

    const isParagraphEnd = !next || next.paragraphIndex !== w.paragraphIndex
    const baseBreak = w.breakAfter ? Math.max(1, w.breakAfterRows) : 0
    const breakRows = isParagraphEnd ? Math.max(baseBreak, paragraphBreakRows) : baseBreak
    if (breakRows > 0) {
      row += breakRows
      x = 0
      if (!w.imageUrl) indent = indent === 0 ? maxIndent : 0
    }
  }

  return map
}
