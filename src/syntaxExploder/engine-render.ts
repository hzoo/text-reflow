import type { FocusStyleId, Metrics } from './experiments'
import type { DocumentModel, Word } from './model'

export type RenderState = {
  ctx: CanvasRenderingContext2D
  model: DocumentModel
  metrics: Metrics
  fontFamily: string
  fontCache: Map<number, string>
  sentenceCenterCache: Map<number, { centerCol: number; centerRow: number }>
  scaleEps: number
  getSentenceWords: (sentenceIndex: number) => Word[]
  readonly animPadY: number
  readonly fontString: string
  readonly fontSize: number
  readonly hoveredSentence: number | null
  readonly focusStyle: FocusStyleId
}

type WordPos = { x: number; y: number; s: number }

export function createRenderer(state: RenderState) {
  const { ctx, metrics } = state

  function fontForScale(scale: number): string {
    const px = Math.max(1, Math.round(state.fontSize * scale))
    const cached = state.fontCache.get(px)
    if (cached) return cached
    const next = `${px}px ${state.fontFamily}`
    state.fontCache.set(px, next)
    return next
  }

  function getSentenceCenter(sentenceIndex: number): { centerCol: number; centerRow: number } {
    const cached = state.sentenceCenterCache.get(sentenceIndex)
    if (cached) return cached

    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity
    const words = state.getSentenceWords(sentenceIndex)
    for (let i = 0; i < words.length; i++) {
      const other = words[i]
      minCol = Math.min(minCol, other.targetCol)
      maxCol = Math.max(maxCol, other.targetCol + other.cols)
      minRow = Math.min(minRow, other.targetRow)
      maxRow = Math.max(maxRow, other.targetRow + 1)
    }
    if (words.length === 0) {
      return { centerCol: 0, centerRow: 0 }
    }
    const result = {
      centerCol: (minCol + maxCol) / 2,
      centerRow: (minRow + maxRow) / 2,
    }
    state.sentenceCenterCache.set(sentenceIndex, result)
    return result
  }

  function computeWordPosition(w: Word): WordPos {
    const s = w.animScale

    // Base position (unscaled)
    const baseX = metrics.padX + w.animCol * metrics.charW
    const baseY = state.animPadY + w.animRow * metrics.lineH + w.focusDy

    let x = baseX
    let y = baseY

    // For magnified words, zoom from the sentence center
    if (s > state.scaleEps) {
      const { centerCol, centerRow } = getSentenceCenter(w.sentenceIndex)
      const centerX = metrics.padX + centerCol * metrics.charW
      const centerY = state.animPadY + centerRow * metrics.lineH + w.focusDy
      x = centerX + (baseX - centerX) * s
      y = centerY + (baseY - centerY) * s
    }
    return { x, y, s }
  }

  function drawWordText(w: Word, pos: WordPos) {
    if (pos.s > state.scaleEps) {
      ctx.font = fontForScale(pos.s)
    }
    ctx.fillText(w.displayText, pos.x, pos.y)
    if (pos.s > state.scaleEps) {
      ctx.font = state.fontString
    }
  }

  function drawWordPlain(w: Word) {
    drawWordText(w, computeWordPosition(w))
  }

  function drawWordRedactRect(w: Word) {
    const pos = computeWordPosition(w)
    ctx.fillRect(
      pos.x,
      pos.y + 2 * pos.s,
      w.cols * metrics.charW * pos.s - 2 * pos.s,
      metrics.lineH * pos.s - 4 * pos.s
    )
  }

  function drawWord(w: Word) {
    const pos = computeWordPosition(w)

    // hover highlight
    const isHover = state.hoveredSentence != null && w.sentenceIndex === state.hoveredSentence
    const isDimmed = !isHover && state.hoveredSentence != null

    // Redact style: draw rect and return early
    if (isDimmed && state.focusStyle === 'redact') {
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.fillRect(pos.x, pos.y + 2 * pos.s, w.cols * metrics.charW * pos.s - 2 * pos.s, metrics.lineH * pos.s - 4 * pos.s)
      ctx.fillStyle = '#111'
      return
    }

    // Set font only if scaled (otherwise use pre-set font from frame)
    if (pos.s > state.scaleEps) ctx.font = fontForScale(pos.s)

    // Set alpha based on focus style
    if (isDimmed) {
      if (state.focusStyle === 'gray') {
        ctx.globalAlpha = 0.2
      } else if (state.focusStyle === 'dither') {
        const on = ((pos.x / (metrics.charW * pos.s) | 0) + (pos.y / (metrics.lineH * pos.s) | 0)) & 1
        ctx.globalAlpha = on ? 0.16 : 0.32
      }
    }

    ctx.fillText(w.displayText, pos.x, pos.y)

    // Reset alpha if changed
    if (isDimmed && state.focusStyle !== 'none') {
      ctx.globalAlpha = 1
    }
    // Reset font if scaled
    if (pos.s > state.scaleEps) {
      ctx.font = state.fontString
    }
  }

  function wordIndexUnder(px: number, py: number): number | null {
    // iterate; ok for a single paragraph; optimize later
    const words = state.model.words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const s = w.animScale

      // Base position (unscaled)
      const baseX = metrics.padX + w.animCol * metrics.charW
      const baseY = state.animPadY + w.animRow * metrics.lineH + w.focusDy

      let x = baseX
      let y = baseY
      let width = Math.max(1, w.cols) * metrics.charW
      let height = metrics.lineH

      // For magnified words, compute actual position from center zoom
      if (s > state.scaleEps) {
        const { centerCol, centerRow } = getSentenceCenter(w.sentenceIndex)
        const centerX = metrics.padX + centerCol * metrics.charW
        const centerY = state.animPadY + centerRow * metrics.lineH + w.focusDy
        x = centerX + (baseX - centerX) * s
        y = centerY + (baseY - centerY) * s
        width *= s
        height *= s
      }

      if (x <= px && px <= x + width && y <= py && py <= y + height) return i
    }
    return null
  }

  return {
    drawWord,
    drawWordPlain,
    drawWordRedactRect,
    wordIndexUnder,
  }
}
