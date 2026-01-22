import type { FocusStyleId, Metrics } from './experiments'
import type { DocumentModel, Word } from './document'

export type CanvasTheme = {
  text: string
  link: string
  redacted: string
  highlight: string
  imageBg: string
  imageBorder: string
  imageText: string
}

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
  getVisibleWords: () => Word[]
  readonly animPadY: number
  readonly animPadX: number
  readonly animPanY: number
  readonly fontString: string
  readonly fontSize: number
  readonly hoveredSentence: number | null
  readonly focusStyle: FocusStyleId
  theme: CanvasTheme
}

type WordPos = { x: number; y: number; s: number }

/**
 * Binary search to find the range of words visible in the viewport.
 * Returns { start, end } indices for iterating [start, end).
 */
export function findVisibleRange(
  words: Word[],
  state: RenderState,
  margin = 0
): { start: number; end: number } {
  const { metrics } = state
  const viewportTop = -margin
  const viewportBottom = window.innerHeight + margin

  if (words.length === 0) return { start: 0, end: 0 }

  // Compute approximate Y for binary search (animY * lineH + padding)
  const getWordTop = (w: Word) => {
    return state.animPadY + state.animPanY + w.animY * metrics.lineH + w.focusDy
  }

  const getWordBottom = (w: Word) => {
    const height = w.imageH ?? metrics.lineH
    return getWordTop(w) + height * w.animScale * w.baseScale
  }

  // Binary search for first visible word (bottom >= viewportTop)
  let lo = 0
  let hi = words.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (getWordBottom(words[mid]) < viewportTop) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  const start = lo

  // Binary search for last visible word (top <= viewportBottom)
  lo = start
  hi = words.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (getWordTop(words[mid]) <= viewportBottom) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  const end = lo

  return { start, end }
}

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
    const baseY = state.animPadY + state.animPanY + w.animY * metrics.lineH + w.focusDy + w.baselineShift * metrics.lineH

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
    if (w.linkUrl) ctx.fillStyle = state.theme.link
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
    ctx.fillStyle = state.theme.imageBg
    ctx.strokeStyle = state.theme.imageBorder
    ctx.lineWidth = 1
    ctx.fillRect(pos.x, pos.y, width, height)
    ctx.strokeRect(pos.x + 0.5, pos.y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1))
    ctx.fillStyle = state.theme.imageText
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
      ctx.fillStyle = state.theme.redacted
      const width = Math.max(1, w.pixelWidth) * pos.s
      ctx.fillRect(pos.x, pos.y + 2 * pos.s, width - 2 * pos.s, metrics.lineH * pos.s - 4 * pos.s)
      ctx.fillStyle = state.theme.text
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

  function wordUnder(px: number, py: number): Word | null {
    const words = state.getVisibleWords()
    // Use viewport culling to limit search (click can only hit visible words)
    const { start, end } = findVisibleRange(words, state, metrics.lineH)
    for (let i = start; i < end; i++) {
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

      if (x <= px && px <= x + width && y <= py && py <= y + height) return w
    }
    return null
  }

  return {
    drawWord,
    drawWordPlain,
    drawWordRedactRect,
    wordUnder,
  }
}
