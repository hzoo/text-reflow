import type { LayoutContext, LayoutResult } from './experiments'

export function layoutReaderPixels({ model, metrics, words: overrideWords, paragraphBreakRows = 0 }: LayoutContext): LayoutResult {
  const words = overrideWords ?? model.words
  const maxWidth = Number.isFinite(metrics.maxCols) ? metrics.maxCols : 200
  let row = 0
  let x = 0
  let maxRow = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const next = words[i + 1]
    const widthRaw = w.pixelWidth
    const width = Number.isFinite(widthRaw) ? Math.max(1, widthRaw) : 1
    if (x > 0 && x + width > maxWidth) {
      row++
      x = 0
    }

    w.targetX = Math.round(x)
    w.targetY = row
    
    // Track maxRow including image span
    const span = w.imageH ? Math.max(1, Math.ceil(w.imageH / metrics.lineH)) : 1
    const endRow = row + span - 1
    if (endRow > maxRow) maxRow = endRow

    x += width

    const isParagraphEnd = !next || next.paragraphIndex !== w.paragraphIndex
    const baseBreak = w.breakAfter ? Math.max(1, Number.isFinite(w.breakAfterRows) ? w.breakAfterRows : 1) : 0
    const breakRows = isParagraphEnd ? Math.max(baseBreak, paragraphBreakRows) : baseBreak
    if (breakRows > 0) {
      row += breakRows
      x = 0
    }
  }

  return { maxRow }
}

export function layoutLadderPixels({ model, metrics, words: overrideWords, paragraphBreakRows = 0 }: LayoutContext): LayoutResult {
  const words = overrideWords ?? model.words
  const maxWidth = Number.isFinite(metrics.maxCols) ? metrics.maxCols : 200
  const maxIndent = Math.floor(maxWidth * 0.18)

  let row = 0
  let x = 0
  let indent = 0
  let maxRow = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const next = words[i + 1]
    const widthRaw = w.pixelWidth
    const width = Number.isFinite(widthRaw) ? Math.max(1, widthRaw) : 1
    if (x === 0) x = indent

    if (x > 0 && x + width > maxWidth) {
      row++
      x = indent
    }

    w.targetX = Math.round(x)
    w.targetY = row
    
    // Track maxRow
    const span = w.imageH ? Math.max(1, Math.ceil(w.imageH / metrics.lineH)) : 1
    const endRow = row + span - 1
    if (endRow > maxRow) maxRow = endRow

    x += width

    const isParagraphEnd = !next || next.paragraphIndex !== w.paragraphIndex
    const baseBreak = w.breakAfter ? Math.max(1, Number.isFinite(w.breakAfterRows) ? w.breakAfterRows : 1) : 0
    const breakRows = isParagraphEnd ? Math.max(baseBreak, paragraphBreakRows) : baseBreak
    if (breakRows > 0) {
      row += breakRows
      x = 0
      if (!w.imageUrl) indent = indent === 0 ? maxIndent : 0
    }
  }

  return { maxRow }
}
