import type { DocumentModel } from './model'
import type { LayoutMap, Metrics } from './experiments'

export function layoutReaderPixels(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model
  const maxWidth = metrics.maxCols
  let row = 0
  let x = 0

  for (const w of words) {
    const width = Math.max(1, w.pixelWidth)
    if (x > 0 && x + width > maxWidth) {
      row++
      x = 0
    }

    map.set(w.id, { col: Math.round(x), row })
    x += width

    if (w.breakAfter) {
      row += Math.max(1, w.breakAfterRows)
      x = 0
    }
  }

  return map
}

export function layoutLadderPixels(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model
  const maxWidth = metrics.maxCols
  const maxIndent = Math.floor(maxWidth * 0.18)

  let row = 0
  let x = 0
  let indent = 0

  for (const w of words) {
    const width = Math.max(1, w.pixelWidth)
    if (x === 0) x = indent

    if (x > 0 && x + width > maxWidth) {
      row++
      x = indent
    }

    map.set(w.id, { col: Math.round(x), row })
    x += width

    if (w.breakAfter) {
      row += Math.max(1, w.breakAfterRows)
      x = 0
      if (!w.imageUrl) indent = indent === 0 ? maxIndent : 0
    }
  }

  return map
}
