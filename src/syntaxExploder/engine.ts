import { BEATS, type BeatId, type FocusStyleId, type LayoutMap, type Metrics } from './experiments'
import type { DocumentModel, Word } from './model'

type EngineOpts = {
  canvas: HTMLCanvasElement
  words: DocumentModel
}

export function createEngine({ canvas, words: model }: EngineOpts) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D context not available')
  const ctx = context

  let running = false
  let beat: BeatId = 'plain'
  let focusStyle: FocusStyleId = 'dither'

  let hoveredSentence: number | null = null

  let onStateChange: ((beat: BeatId, focusStyle: FocusStyleId, sentence: number | null, total: number, sentenceOnlyMode: boolean) => void) | null = null
  let maxContentWidth = 800
  let fontSize = 20
  let bottomReserve = 0 // Space to reserve at bottom (for HUD on mobile)
  let sentenceOnlyMode = false // When true, only show current sentence (for mobile overflow)

  // Cached font string to avoid allocation in hot loop
  let fontString = ''

  // Cached sentence centers for magnify mode
  const sentenceCenterCache = new Map<number, { centerCol: number; centerRow: number }>()

  function notifyStateChange() {
    onStateChange?.(beat, focusStyle, hoveredSentence, model.sentenceCount, sentenceOnlyMode)
  }

  const metrics: Metrics = {
    charW: 10,
    lineH: 18,
    maxCols: 80, // recalculated in measureFont
    padX: 24,
    padY: 24,
  }

  let animPadY = 24

  function applyDPR() {
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = Math.floor(window.innerWidth)
    const h = Math.floor(window.innerHeight)

    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function measureFont() {
    ctx.textBaseline = 'top'
    fontString = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
    ctx.font = fontString
    sentenceCenterCache.clear()

    const m = ctx.measureText('M')
    metrics.charW = m.width || fontSize * 0.6
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.75
    const descent = m.actualBoundingBoxDescent || fontSize * 0.25
    metrics.lineH = Math.max(fontSize, (ascent + descent) * 1.35)

    // Responsive: always fit within viewport
    const minPad = Math.max(16, Math.min(32, window.innerWidth * 0.04))
    const viewportWidth = window.innerWidth - minPad * 2

    // Cap content width to viewport
    const effectiveMaxWidth = Math.min(viewportWidth, maxContentWidth)

    // Calculate cols that fit
    const maxPossibleCols = Math.floor(effectiveMaxWidth / metrics.charW)
    metrics.maxCols = Math.max(20, Math.min(100, maxPossibleCols))

    // Center block horizontally
    const blockW = metrics.maxCols * metrics.charW
    metrics.padX = Math.max(minPad, Math.floor((window.innerWidth - blockW) / 2))

    // Estimate vertical height based on current targets to center vertically
    // Account for bottomReserve (HUD on mobile)
    const availableHeight = window.innerHeight - bottomReserve
    let maxRow = 0
    for (const w of model.words) {
      if (w.targetRow > maxRow) maxRow = w.targetRow
    }
    const blockH = (maxRow + 1) * metrics.lineH
    metrics.padY = Math.max(16, Math.floor((availableHeight - blockH) / 2))
  }

  /** Get words for a specific sentence */
  function getSentenceWords(sentenceIndex: number): Word[] {
    return model.words.filter(w => w.sentenceIndex === sentenceIndex)
  }

  /** Calculate content bounds for given words */
  function getContentBounds(words: Word[]): { maxRow: number; maxCol: number } {
    let maxRow = 0
    let maxCol = 0
    for (const w of words) {
      if (w.targetRow > maxRow) maxRow = w.targetRow
      if (w.targetCol + w.cols > maxCol) maxCol = w.targetCol + w.cols
    }
    return { maxRow, maxCol }
  }

  /** Check if content fits in available space */
  function contentFits(words: Word[]): boolean {
    const availableHeight = window.innerHeight - bottomReserve - 32
    const availableWidth = window.innerWidth - 32
    const { maxRow } = getContentBounds(words)
    const contentHeight = (maxRow + 1) * metrics.lineH + 32
    const contentWidth = metrics.maxCols * metrics.charW
    return contentHeight <= availableHeight && contentWidth <= availableWidth
  }

  /** Auto-fit font size. Returns true if paragraph fits, false if switched to sentence-only mode */
  function autoFitFontSize(): boolean {
    sentenceOnlyMode = false

    // Binary search for optimal font size for full paragraph
    let minSize = 14
    let maxSize = 48
    let bestSize = minSize

    while (minSize <= maxSize) {
      const testSize = Math.floor((minSize + maxSize) / 2)
      fontSize = testSize
      measureFont()
      layoutCurrentBeat()

      if (contentFits(model.words)) {
        bestSize = testSize
        minSize = testSize + 1
      } else {
        maxSize = testSize - 1
      }
    }

    // Apply best size
    fontSize = bestSize
    measureFont()
    layoutCurrentBeat()

    // Check if even minimum doesn't fit - switch to sentence-only mode
    if (!contentFits(model.words)) {
      sentenceOnlyMode = true
      fitCurrentSentence()
      notifyStateChange()
      return false
    }

    notifyStateChange()
    return true
  }

  /** Fit just the current sentence to screen */
  function fitCurrentSentence() {
    if (hoveredSentence === null) return

    const sentenceWords = getSentenceWords(hoveredSentence)
    if (sentenceWords.length === 0) return

    // Binary search for optimal font size for this sentence
    let minSize = 16
    let maxSize = 64
    let bestSize = minSize

    while (minSize <= maxSize) {
      const testSize = Math.floor((minSize + maxSize) / 2)
      fontSize = testSize
      measureFont()
      layoutCurrentBeat()

      if (contentFits(sentenceWords)) {
        bestSize = testSize
        minSize = testSize + 1
      } else {
        maxSize = testSize - 1
      }
    }

    fontSize = bestSize
    measureFont()
    layoutCurrentBeat()
  }

  function layoutCurrentBeat() {
    const layout = BEATS[beat].layout({ model, metrics })
    applyTargets(model.words, layout)
    // Re-measure after layout to update vertical padding
    measureFont()
  }

  function applyTargets(words: Word[], targets: LayoutMap) {
    for (const w of words) {
      const t = targets.get(w.id)
      if (!t) continue
      w.targetCol = t.col
      w.targetRow = t.row
    }
  }

  function stepWordAnimation(dt: number) {
    // smoothing factor; dt-normalized
    const k = 1 - Math.pow(0.0001, dt)

    for (const w of model.words) {
      w.animCol += (w.targetCol - w.animCol) * k
      w.animRow += (w.targetRow - w.animRow) * k
      w.animScale += (w.targetScale - w.animScale) * k
    }

    // smooth padY transition
    const kPad = 1 - Math.pow(0.001, dt)
    animPadY += (metrics.padY - animPadY) * kPad
  }

  function sentenceYOffset(sentenceIndex: number): number {
    if (hoveredSentence == null) return 0
    
    const baseGap = beat === 'magnify' ? 80 : 48
    
    if (sentenceIndex < hoveredSentence) return -baseGap / 2
    if (sentenceIndex > hoveredSentence) return baseGap / 2
    return 0
  }

  function stepFocus(dt: number) {
    const k = 1 - Math.pow(0.01, dt)
    const isMagnifyBeat = beat === 'magnify'

    for (const w of model.words) {
      const isHoveredSent = hoveredSentence !== null && w.sentenceIndex === hoveredSentence
      
      // Update target scale (reduced from 1.8 to 1.35)
      if (isMagnifyBeat && isHoveredSent) {
        w.targetScale = 1.35
      } else {
        w.targetScale = 1.0
      }

      const targetDy = sentenceYOffset(w.sentenceIndex)
      w.focusDy += (targetDy - w.focusDy) * k
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function getSentenceCenter(sentenceIndex: number): { centerCol: number; centerRow: number } {
    const cached = sentenceCenterCache.get(sentenceIndex)
    if (cached) return cached

    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity
    for (let i = 0; i < model.words.length; i++) {
      const other = model.words[i]
      if (other.sentenceIndex === sentenceIndex) {
        minCol = Math.min(minCol, other.targetCol)
        maxCol = Math.max(maxCol, other.targetCol + other.cols)
        minRow = Math.min(minRow, other.targetRow)
        maxRow = Math.max(maxRow, other.targetRow + 1)
      }
    }
    const result = {
      centerCol: (minCol + maxCol) / 2,
      centerRow: (minRow + maxRow) / 2,
    }
    sentenceCenterCache.set(sentenceIndex, result)
    return result
  }

  function drawWord(w: Word) {
    const s = w.animScale
    const isScaled = s > 1.01

    // Base position (unscaled)
    const baseX = metrics.padX + w.animCol * metrics.charW
    const baseY = animPadY + w.animRow * metrics.lineH + w.focusDy

    let x = baseX
    let y = baseY

    // For magnified words, zoom from the sentence center
    if (isScaled) {
      const { centerCol, centerRow } = getSentenceCenter(w.sentenceIndex)
      const centerX = metrics.padX + centerCol * metrics.charW
      const centerY = animPadY + centerRow * metrics.lineH + w.focusDy
      x = centerX + (baseX - centerX) * s
      y = centerY + (baseY - centerY) * s
    }

    // hover highlight
    const isHover = hoveredSentence != null && w.sentenceIndex === hoveredSentence
    const isDimmed = !isHover && hoveredSentence != null

    // Redact style: draw rect and return early
    if (isDimmed && focusStyle === 'redact') {
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.fillRect(x, y + 2 * s, w.cols * metrics.charW * s - 2 * s, metrics.lineH * s - 4 * s)
      return
    }

    // Set font only if scaled (otherwise use pre-set font from frame)
    if (isScaled) {
      ctx.font = `${(fontSize * s).toFixed(0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
    }

    // Set alpha based on focus style
    if (isDimmed) {
      if (focusStyle === 'gray') {
        ctx.globalAlpha = 0.2
      } else if (focusStyle === 'dither') {
        const on = ((x / (metrics.charW * s) | 0) + (y / (metrics.lineH * s) | 0)) & 1
        ctx.globalAlpha = on ? 0.16 : 0.32
      }
    }

    ctx.fillText(w.spaceAfter ? w.text + ' ' : w.text, x, y)

    // Reset alpha if changed
    if (isDimmed && focusStyle !== 'none') {
      ctx.globalAlpha = 1
    }
    // Reset font if scaled
    if (isScaled) {
      ctx.font = fontString
    }
  }


  function wordIndexUnder(px: number, py: number): number | null {
    // iterate; ok for a single paragraph; optimize later
    for (let i = 0; i < model.words.length; i++) {
      const w = model.words[i]
      const s = w.animScale
      
      // Base position (unscaled)
      const baseX = metrics.padX + w.animCol * metrics.charW
      const baseY = animPadY + w.animRow * metrics.lineH + w.focusDy

      let x = baseX
      let y = baseY
      let width = Math.max(1, w.cols) * metrics.charW
      let height = metrics.lineH

      // For magnified words, compute actual position from center zoom
      if (s > 1.01) {
        const { centerCol, centerRow } = getSentenceCenter(w.sentenceIndex)
        const centerX = metrics.padX + centerCol * metrics.charW
        const centerY = animPadY + centerRow * metrics.lineH + w.focusDy
        x = centerX + (baseX - centerX) * s
        y = centerY + (baseY - centerY) * s
        width *= s
        height *= s
      }

      if (x <= px && px <= x + width && y <= py && py <= y + height) return i
    }
    return null
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const idx = wordIndexUnder(x, y)

    const prev = hoveredSentence

    if (idx == null) {
      hoveredSentence = null
      document.body.style.cursor = 'default'
    } else {
      hoveredSentence = model.words[idx].sentenceIndex
      document.body.style.cursor = 'pointer'
    }

    if (hoveredSentence !== prev) notifyStateChange()
  })

  window.addEventListener('resize', () => {
    applyDPR()
    measureFont()
    layoutCurrentBeat()
  })

  let last = performance.now()
  function frame(now: number) {
    if (!running) return

    const dtMs = now - last
    last = now
    const dt = Math.min(0.05, dtMs / 1000)

    stepWordAnimation(dt)
    stepFocus(dt)

    clear()
    ctx.font = fontString
    ctx.fillStyle = '#111'
    ctx.globalAlpha = 1

    // In sentence-only mode, only draw the current sentence
    if (sentenceOnlyMode && hoveredSentence !== null) {
      for (const w of model.words) {
        if (w.sentenceIndex === hoveredSentence) drawWord(w)
      }
    } else {
      const words = model.words
      for (let i = 0; i < words.length; i++) drawWord(words[i])
    }

    requestAnimationFrame(frame)
  }

  function start() {
    applyDPR()
    measureFont()

    // init anim state to targets
    layoutCurrentBeat()
    animPadY = metrics.padY
    for (const w of model.words) {
      w.animCol = w.targetCol
      w.animRow = w.targetRow
    }

    running = true
    last = performance.now()
    hoveredSentence = 0 // auto-focus first sentence
    notifyStateChange()
    requestAnimationFrame(frame)
  }

  function setBeat(next: BeatId) {
    beat = next
    layoutCurrentBeat()
    notifyStateChange()
  }

  function setFocusStyle(next: FocusStyleId) {
    focusStyle = next
    notifyStateChange()
  }

  function cycleFocusStyle() {
    const ids: FocusStyleId[] = ['dither', 'gray', 'redact', 'none']
    const idx = ids.indexOf(focusStyle)
    focusStyle = ids[(idx + 1) % ids.length]
    notifyStateChange()
  }

  /** Returns 'wrap' if at end and should go to next paragraph */
  function nextSentence(): 'ok' | 'wrap' {
    if (hoveredSentence === null) {
      hoveredSentence = 0
      if (sentenceOnlyMode) fitCurrentSentence()
      notifyStateChange()
      return 'ok'
    }
    if (hoveredSentence >= model.sentenceCount - 1) {
      return 'wrap'
    }
    hoveredSentence++
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    return 'ok'
  }

  /** Returns 'wrap' if at start and should go to prev paragraph */
  function prevSentence(): 'ok' | 'wrap' {
    if (hoveredSentence === null) {
      hoveredSentence = model.sentenceCount - 1
      if (sentenceOnlyMode) fitCurrentSentence()
      notifyStateChange()
      return 'ok'
    }
    if (hoveredSentence <= 0) {
      return 'wrap'
    }
    hoveredSentence--
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    return 'ok'
  }

  function goToLastSentence() {
    hoveredSentence = model.sentenceCount - 1
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
  }

  function setMaxWidth(w: number) {
    maxContentWidth = Math.max(300, Math.min(1200, w))
    measureFont()
    layoutCurrentBeat()
  }

  function getMaxWidth() {
    return maxContentWidth
  }

  function setFontSize(size: number) {
    fontSize = Math.max(12, Math.min(40, size))
    measureFont()
    layoutCurrentBeat()
  }

  function getFontSize() {
    return fontSize
  }

  function setBottomReserve(h: number) {
    bottomReserve = h
    measureFont()
    layoutCurrentBeat()
  }

  return {
    start,
    setBeat,
    setFocusStyle,
    cycleFocusStyle,
    nextSentence,
    prevSentence,
    goToLastSentence,
    setMaxWidth,
    getMaxWidth,
    setFontSize,
    getFontSize,
    setBottomReserve,
    autoFitFontSize,
    isSentenceOnlyMode: () => sentenceOnlyMode,
    set onStateChange(fn: typeof onStateChange) { onStateChange = fn },
  }
}
