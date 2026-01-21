import type { FocusStyleId, Metrics } from './experiments'
import type { DocumentModel, Word } from './model'

export type RenderState = {
  ctx: CanvasRenderingContext2D
  model: DocumentModel
  metrics: Metrics
  fontFamily: string
  fontCache: Map<string, string>
  sentenceCenterCache: Map<number, { centerCol: number; centerRow: number }>
  imageCache: Map<string, { img: CanvasImageSource; status: 'loading' | 'loaded' | 'error' }>
  ensureImage: (url: string) => void
  scaleEps: number
  getSentenceWords: (sentenceIndex: number) => Word[]
  readonly animPadY: number
  readonly animPadX: number
  readonly animPanY: number
  readonly fontString: string
  readonly fontSize: number
  readonly hoveredSentence: number | null
  readonly focusStyle: FocusStyleId
}

type WordPos = { x: number; y: number; s: number }

export function createRenderer(state: RenderState) {
  const { ctx, metrics } = state

  function fontForScale(scale: number, fontStyle: 'normal' | 'italic', fontWeight: 'normal' | 'bold'): string {
    const px = Math.max(1, Math.round(state.fontSize * scale))
    const key = `${fontStyle}|${fontWeight}|${px}`
    const cached = state.fontCache.get(key)
    if (cached) return cached
    const stylePart = fontStyle === 'normal' ? '' : fontStyle
    const weightPart = fontWeight === 'normal' ? '' : fontWeight
    const next = `${stylePart} ${weightPart} ${px}px ${state.fontFamily}`.replace(/\s+/g, ' ').trim()
    state.fontCache.set(key, next)
    return next
  }

  function getSentenceCenter(sentenceIndex: number): { centerX: number; centerRow: number } {
    const cached = state.sentenceCenterCache.get(sentenceIndex)
    if (cached) return { centerX: cached.centerCol, centerRow: cached.centerRow }

    let minX = Infinity, maxX = -Infinity, minRow = Infinity, maxRow = -Infinity
    const words = state.getSentenceWords(sentenceIndex)
    for (let i = 0; i < words.length; i++) {
      const other = words[i]
      minX = Math.min(minX, other.targetX)
      maxX = Math.max(maxX, other.targetX + other.pixelWidth)
      minRow = Math.min(minRow, other.targetY)
      maxRow = Math.max(maxRow, other.targetY + 1)
    }
    if (words.length === 0) {
      return { centerX: 0, centerRow: 0 }
    }
    const result = {
      centerX: (minX + maxX) / 2,
      centerRow: (minRow + maxRow) / 2,
    }
    state.sentenceCenterCache.set(sentenceIndex, { centerCol: result.centerX, centerRow: result.centerRow })
    return result
  }

  function computeWordPosition(w: Word): WordPos {
    const s = w.animScale * w.baseScale

    // Base position (unscaled)
    const baseX = state.animPadX + w.animX
    const baseY = state.animPadY + state.animPanY + w.animY * metrics.lineH + w.focusDy

    let x = baseX
    let y = baseY

    // For magnified words, zoom from the sentence center
    if (s > state.scaleEps) {
      const { centerX, centerRow } = getSentenceCenter(w.sentenceIndex)
      const centerXPos = state.animPadX + centerX
      const centerY = state.animPadY + state.animPanY + centerRow * metrics.lineH + w.focusDy
      x = centerXPos + (baseX - centerXPos) * s
      y = centerY + (baseY - centerY) * s
    }
    return { x, y, s }
  }

  function wordWidth(w: Word): number {
    return Math.max(1, w.imageW ?? w.pixelWidth)
  }

  function wordHeight(w: Word): number {
    return w.imageH ?? metrics.lineH
  }

  const IMAGE_PRELOAD_MARGIN = 480
  function isWordNearViewport(w: Word, pos: WordPos, margin = IMAGE_PRELOAD_MARGIN): boolean {
    const height = wordHeight(w) * pos.s
    const top = pos.y
    const bottom = pos.y + height
    const viewportTop = -margin
    const viewportBottom = window.innerHeight + margin
    return bottom >= viewportTop && top <= viewportBottom
  }

  function isWordVisible(w: Word, pos: WordPos): boolean {
    const height = wordHeight(w) * pos.s
    const top = pos.y
    const bottom = pos.y + height
    const viewportTop = -metrics.lineH
    const viewportBottom = window.innerHeight + metrics.lineH
    return bottom >= viewportTop && top <= viewportBottom
  }

  function drawWordText(w: Word, pos: WordPos) {
    if (pos.s > state.scaleEps || w.fontStyle !== 'normal' || w.fontWeight !== 'normal') {
      ctx.font = fontForScale(pos.s, w.fontStyle, w.fontWeight)
    }
    const prevFill = ctx.fillStyle
    if (w.linkUrl) ctx.fillStyle = '#1a5fb4'
    ctx.fillText(w.displayText, pos.x, pos.y)
    if (w.linkUrl) {
      const width = ctx.measureText(w.displayText).width
      ctx.fillRect(pos.x, pos.y + metrics.lineH * pos.s - 2, width, 1)
      ctx.fillStyle = prevFill
    }
    if (pos.s > state.scaleEps || w.fontStyle !== 'normal' || w.fontWeight !== 'normal') {
      ctx.font = state.fontString
    }
  }

  function drawWordImage(w: Word, pos: WordPos) {
    const width = wordWidth(w) * pos.s
    const height = wordHeight(w) * pos.s
    const entry = w.imageUrl ? state.imageCache.get(w.imageUrl) : undefined
    if (entry?.status === 'loaded') {
      ctx.drawImage(entry.img, pos.x, pos.y, width, height)
      return
    }
    ctx.save()
    ctx.fillStyle = '#f1f1f1'
    ctx.strokeStyle = '#c9c9c9'
    ctx.lineWidth = 1
    ctx.fillRect(pos.x, pos.y, width, height)
    ctx.strokeRect(pos.x + 0.5, pos.y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1))
    ctx.fillStyle = '#666'
    const label = entry?.status === 'error'
      ? 'Image failed to load'
      : (w.imageAlt ? `Image: ${w.imageAlt}` : 'Image')
    const labelSize = Math.max(10, Math.round(state.fontSize * 0.7 * pos.s))
    ctx.font = `${labelSize}px ${state.fontFamily}`
    ctx.fillText(label, pos.x + 8, pos.y + 8)
    ctx.restore()
  }

  function maybePreloadImage(w: Word, pos: WordPos) {
    if (!w.imageUrl) return
    const entry = state.imageCache.get(w.imageUrl)
    if (entry) return
    if (isWordNearViewport(w, pos)) state.ensureImage(w.imageUrl)
  }

  function drawWordPlain(w: Word) {
    const pos = computeWordPosition(w)
    if (w.imageUrl) maybePreloadImage(w, pos)
    if (!isWordVisible(w, pos)) return
    if (w.imageUrl) {
      drawWordImage(w, pos)
      return
    }
    drawWordText(w, pos)
  }

  function drawWordRedactRect(w: Word) {
    const pos = computeWordPosition(w)
    if (w.imageUrl) maybePreloadImage(w, pos)
    if (!isWordVisible(w, pos)) return
    const width = wordWidth(w) * pos.s
    const height = wordHeight(w) * pos.s
    ctx.fillRect(
      pos.x,
      pos.y + 2 * pos.s,
      Math.max(0, width - 2 * pos.s),
      Math.max(0, height - 4 * pos.s)
    )
  }

  function drawWord(w: Word) {
    const pos = computeWordPosition(w)
    if (w.imageUrl) maybePreloadImage(w, pos)
    if (!isWordVisible(w, pos)) return

    if (w.imageUrl) {
      drawWordImage(w, pos)
      return
    }

    // hover highlight
    const isHover = state.hoveredSentence != null && w.sentenceIndex === state.hoveredSentence
    const isDimmed = !isHover && state.hoveredSentence != null

    // Redact style: draw rect and return early
    if (isDimmed && state.focusStyle === 'redact') {
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      const width = Math.max(1, w.pixelWidth) * pos.s
      ctx.fillRect(pos.x, pos.y + 2 * pos.s, width - 2 * pos.s, metrics.lineH * pos.s - 4 * pos.s)
      ctx.fillStyle = '#111'
      return
    }

    // Set font only if scaled (otherwise use pre-set font from frame)
    if (pos.s > state.scaleEps || w.fontStyle !== 'normal' || w.fontWeight !== 'normal') {
      ctx.font = fontForScale(pos.s, w.fontStyle, w.fontWeight)
    }

    // Set alpha based on focus style
    if (isDimmed) {
      if (state.focusStyle === 'gray') {
        ctx.globalAlpha = 0.2
      }
    }

    ctx.fillText(w.displayText, pos.x, pos.y)

    // Reset alpha if changed
    if (isDimmed && state.focusStyle !== 'none') {
      ctx.globalAlpha = 1
    }
    // Reset font if scaled
    if (pos.s > state.scaleEps || w.fontStyle !== 'normal' || w.fontWeight !== 'normal') {
      ctx.font = state.fontString
    }
  }

  function wordIndexUnder(px: number, py: number): number | null {
    // iterate; ok for a single paragraph; optimize later
    const words = state.model.words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const s = w.animScale * w.baseScale

      // Base position (unscaled)
      const baseX = state.animPadX + w.animX
    const baseY = state.animPadY + state.animPanY + w.animY * metrics.lineH + w.focusDy

      let x = baseX
      let y = baseY
      let width = wordWidth(w)
      let height = wordHeight(w)

      // For magnified words, compute actual position from center zoom
      if (s > state.scaleEps) {
        const { centerX, centerRow } = getSentenceCenter(w.sentenceIndex)
        const centerXPos = state.animPadX + centerX
        const centerY = state.animPadY + state.animPanY + centerRow * metrics.lineH + w.focusDy
        x = centerXPos + (baseX - centerXPos) * s
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
