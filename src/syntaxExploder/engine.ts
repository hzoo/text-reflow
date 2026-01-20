import { BEATS, type BeatId, type FocusStyleId, type LayoutMap, type Metrics } from './experiments'
import { createRenderer } from './engine-render'
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
  const fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  const SCALE_EPS = 1.01

  // Cached font string to avoid allocation in hot loop
  let fontString = ''
  const fontCache = new Map<number, string>()

  // Cached sentence centers for magnify mode
  const sentenceCenterCache = new Map<number, { centerCol: number; centerRow: number }>()

  let needsRedraw = true
  let rafId = 0

  function notifyStateChange() {
    onStateChange?.(beat, focusStyle, hoveredSentence, model.sentenceCount, sentenceOnlyMode)
  }

  function requestFrame() {
    if (!running || rafId) return
    last = performance.now()
    rafId = requestAnimationFrame(frame)
  }

  function invalidate() {
    needsRedraw = true
    requestFrame()
  }

  const metrics: Metrics = {
    charW: 10,
    lineH: 18,
    maxCols: 80, // recalculated in measureFont
    padX: 24,
    padY: 24,
  }

  const EPS = 0.001
  const LN_0_0001 = Math.log(0.0001)
  const LN_0_001 = Math.log(0.001)
  const LN_0_01 = Math.log(0.01)
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
    needsRedraw = true
  }

  function measureFont() {
    ctx.textBaseline = 'top'
    fontString = `${fontSize}px ${fontFamily}`
    ctx.font = fontString
    fontCache.clear()
    fontCache.set(fontSize, fontString)

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
    const words = model.words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (w.targetRow > maxRow) maxRow = w.targetRow
    }
    const blockH = (maxRow + 1) * metrics.lineH
    metrics.padY = Math.max(16, Math.floor((availableHeight - blockH) / 2))
  }

  /** Get words for a specific sentence */
  function getSentenceWords(sentenceIndex: number): Word[] {
    return model.wordsBySentence[sentenceIndex] || []
  }

  const { drawWord, drawWordPlain, drawWordRedactRect, wordIndexUnder } = createRenderer({
    ctx,
    model,
    metrics,
    fontFamily,
    fontCache,
    sentenceCenterCache,
    scaleEps: SCALE_EPS,
    getSentenceWords,
    get animPadY() { return animPadY },
    get fontString() { return fontString },
    get fontSize() { return fontSize },
    get hoveredSentence() { return hoveredSentence },
    get focusStyle() { return focusStyle },
  })

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
      layoutCurrentBeat(false)

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
      layoutCurrentBeat(false)

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

  function layoutCurrentBeat(invalidateLayout = true) {
    const layout = BEATS[beat].layout({ model, metrics })
    applyTargets(model.words, layout)
    sentenceCenterCache.clear()
    // Re-measure after layout to update vertical padding
    measureFont()
    if (invalidateLayout) invalidate()
  }

  function applyTargets(words: Word[], targets: LayoutMap) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const t = targets.get(w.id)
      if (!t) continue
      w.targetCol = t.col
      w.targetRow = t.row
    }
  }

  function stepWordAnimation(dt: number): boolean {
    // smoothing factor; dt-normalized
    const k = -Math.expm1(LN_0_0001 * dt)
    let active = false

    const words = model.words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const dCol = w.targetCol - w.animCol
      const dRow = w.targetRow - w.animRow
      const dScale = w.targetScale - w.animScale
      if (Math.abs(dCol) > EPS || Math.abs(dRow) > EPS || Math.abs(dScale) > EPS) active = true
      w.animCol += dCol * k
      w.animRow += dRow * k
      w.animScale += dScale * k
    }

    // smooth padY transition
    const kPad = -Math.expm1(LN_0_001 * dt)
    const dPad = metrics.padY - animPadY
    if (Math.abs(dPad) > EPS) active = true
    animPadY += dPad * kPad
    return active
  }

  function sentenceYOffset(sentenceIndex: number): number {
    if (hoveredSentence == null) return 0
    
    const baseGap = beat === 'magnify' ? 80 : 48
    
    if (sentenceIndex < hoveredSentence) return -baseGap / 2
    if (sentenceIndex > hoveredSentence) return baseGap / 2
    return 0
  }

  function stepFocus(dt: number): boolean {
    const k = -Math.expm1(LN_0_01 * dt)
    const isMagnifyBeat = beat === 'magnify'
    let active = false

    const words = model.words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const isHoveredSent = hoveredSentence !== null && w.sentenceIndex === hoveredSentence
      
      // Update target scale (reduced from 1.8 to 1.35)
      if (isMagnifyBeat && isHoveredSent) {
        w.targetScale = 1.35
      } else {
        w.targetScale = 1.0
      }

      const targetDy = sentenceYOffset(w.sentenceIndex)
      const dDy = targetDy - w.focusDy
      if (Math.abs(dDy) > EPS) active = true
      w.focusDy += dDy * k
    }
    return active
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  canvas.addEventListener('mousemove', (e) => {
    const x = e.offsetX
    const y = e.offsetY
    const idx = wordIndexUnder(x, y)

    const prev = hoveredSentence

    if (idx == null) {
      hoveredSentence = null
      document.body.style.cursor = 'default'
    } else {
      hoveredSentence = model.words[idx].sentenceIndex
      document.body.style.cursor = 'pointer'
    }

    if (hoveredSentence !== prev) {
      notifyStateChange()
      invalidate()
    }
  })

  window.addEventListener('resize', () => {
    applyDPR()
    measureFont()
    layoutCurrentBeat()
  })

  let last = performance.now()
  function frame(now: number) {
    if (!running) return
    rafId = 0

    const dtMs = now - last
    last = now
    const dt = Math.min(0.05, dtMs / 1000)

    const animating = stepWordAnimation(dt) || stepFocus(dt)
    if (!needsRedraw && !animating) return
    needsRedraw = false

    clear()
    ctx.font = fontString
    ctx.fillStyle = '#111'
    ctx.globalAlpha = 1

    // In sentence-only mode, only draw the current sentence
    if (sentenceOnlyMode && hoveredSentence !== null) {
      const words = getSentenceWords(hoveredSentence)
      for (let i = 0; i < words.length; i++) drawWordPlain(words[i])
    } else {
      const words = model.words
      if (hoveredSentence !== null && focusStyle !== 'none') {
        if (focusStyle === 'gray') {
          ctx.globalAlpha = 0.2
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredSentence) drawWordPlain(w)
          }
          ctx.globalAlpha = 1
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredSentence) drawWordPlain(w)
          }
        } else if (focusStyle === 'redact') {
          ctx.fillStyle = 'rgba(0,0,0,0.1)'
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredSentence) drawWordRedactRect(w)
          }
          ctx.fillStyle = '#111'
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredSentence) drawWordPlain(w)
          }
        } else {
          for (let i = 0; i < words.length; i++) drawWord(words[i])
        }
      } else {
        for (let i = 0; i < words.length; i++) drawWordPlain(words[i])
      }
    }

    if (animating) requestFrame()
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
    needsRedraw = true
    hoveredSentence = 0 // auto-focus first sentence
    notifyStateChange()
    requestFrame()
  }

  function setBeat(next: BeatId) {
    beat = next
    layoutCurrentBeat()
    notifyStateChange()
  }

  function setFocusStyle(next: FocusStyleId) {
    focusStyle = next
    notifyStateChange()
    invalidate()
  }

  function cycleFocusStyle() {
    const ids: FocusStyleId[] = ['dither', 'gray', 'redact', 'none']
    const idx = ids.indexOf(focusStyle)
    focusStyle = ids[(idx + 1) % ids.length]
    notifyStateChange()
    invalidate()
  }

  /** Returns 'wrap' if at end and should go to next paragraph */
  function nextSentence(): 'ok' | 'wrap' {
    if (hoveredSentence === null) {
      hoveredSentence = 0
      if (sentenceOnlyMode) fitCurrentSentence()
      notifyStateChange()
      invalidate()
      return 'ok'
    }
    if (hoveredSentence >= model.sentenceCount - 1) {
      return 'wrap'
    }
    hoveredSentence++
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  /** Returns 'wrap' if at start and should go to prev paragraph */
  function prevSentence(): 'ok' | 'wrap' {
    if (hoveredSentence === null) {
      hoveredSentence = model.sentenceCount - 1
      if (sentenceOnlyMode) fitCurrentSentence()
      notifyStateChange()
      invalidate()
      return 'ok'
    }
    if (hoveredSentence <= 0) {
      return 'wrap'
    }
    hoveredSentence--
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  function goToLastSentence() {
    hoveredSentence = model.sentenceCount - 1
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
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
