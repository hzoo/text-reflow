import { BEATS, type BeatId, type FocusStyleId, type LayoutMap, type Metrics } from './experiments'
import { createRenderer } from './engine-render'
import type { DocumentModel, Word } from './model'

type ImageCacheEntry = {
  img: HTMLImageElement
  status: 'loading' | 'loaded' | 'error'
  naturalWidth: number
  naturalHeight: number
}

type EngineOpts = {
  canvas: HTMLCanvasElement
  words: DocumentModel
  fontFamily?: string
  maxContentWidth?: number
  pixelLayout?: boolean
}

export function createEngine({ canvas, words: model, fontFamily: fontOverride, maxContentWidth: maxWidthOverride, pixelLayout: pixelLayoutOverride }: EngineOpts) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D context not available')
  const ctx = context

  let running = false
  let destroyed = false
  let beat: BeatId = 'reader'
  let focusStyle: FocusStyleId = 'gray'

  let hoveredSentence: number | null = null

  let onStateChange: ((beat: BeatId, focusStyle: FocusStyleId, sentence: number | null, total: number, sentenceOnlyMode: boolean) => void) | null = null
  let maxContentWidth = maxWidthOverride ?? 800
  let pixelLayout = pixelLayoutOverride ?? false
  let fontSize = 20
  let bottomReserve = 0 // Space to reserve at bottom (for HUD on mobile)
  let sentenceOnlyMode = false // When true, only show current sentence (for mobile overflow)
  const fontFamily = fontOverride || 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  const SCALE_EPS = 1.01

  // Cached font string to avoid allocation in hot loop
  let fontString = ''
  const fontCache = new Map<string, string>()

  // Cached sentence centers for magnify mode
  const sentenceCenterCache = new Map<number, { centerCol: number; centerRow: number }>()
  const imageCache = new Map<string, ImageCacheEntry>()
  let imageRelayoutPending = false

  let needsRedraw = true
  let rafId = 0

  function notifyStateChange() {
    onStateChange?.(beat, focusStyle, hoveredSentence, model.sentenceCount, sentenceOnlyMode)
    if ((window as any).__reflowDebug) {
      console.debug('[reflow] sentence', hoveredSentence, 'count', model.sentenceCount)
    }
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

  function scheduleImageRelayout() {
    if (destroyed || imageRelayoutPending) return
    imageRelayoutPending = true
    requestAnimationFrame(() => {
      imageRelayoutPending = false
      if (destroyed) return
      layoutCurrentBeat()
    })
  }

  function ensureImage(url: string): ImageCacheEntry {
    const existing = imageCache.get(url)
    if (existing) return existing
    const img = new Image()
    const entry: ImageCacheEntry = {
      img,
      status: 'loading',
      naturalWidth: 0,
      naturalHeight: 0,
    }
    imageCache.set(url, entry)
    img.decoding = 'async'
    img.onload = () => {
      entry.status = 'loaded'
      entry.naturalWidth = img.naturalWidth || 0
      entry.naturalHeight = img.naturalHeight || 0
      scheduleImageRelayout()
    }
    img.onerror = () => {
      entry.status = 'error'
      scheduleImageRelayout()
    }
    img.src = url
    return entry
  }

  const metrics: Metrics = {
    charW: 10,
    lineH: 18,
    maxCols: 80, // recalculated in measureFont
    padX: 24,
    padY: 24,
  }

  const EPS = 0.001
  const LN_0_0001 = Math.log(0.0003)
  const LN_0_001 = Math.log(0.002)
  const LN_0_01 = Math.log(0.01)
  let animPadY = 24
  let animPadX = 24
  let panY = 0
  let animPanY = 0
  let moveSpeed = 1
  let panSpeed = 1
  let focusSpeed = 1

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
    fontCache.set(`normal|normal|${fontSize}`, fontString)

    const sample = 'abcdefghijklmnopqrstuvwxyz'
    const sampleWidth = ctx.measureText(sample).width
    metrics.charW = sampleWidth ? sampleWidth / sample.length : fontSize * 0.6
    const m = ctx.measureText('M')
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.75
    const descent = m.actualBoundingBoxDescent || fontSize * 0.25
    metrics.lineH = Math.max(fontSize, (ascent + descent) * 1.35)

    // Responsive: always fit within viewport
    const minPad = Math.max(16, Math.min(32, window.innerWidth * 0.04))
    const viewportWidth = window.innerWidth - minPad * 2

    // Cap content width to viewport
    const effectiveMaxWidth = Math.min(viewportWidth, maxContentWidth)

    // Calculate cols that fit
    if (pixelLayout) {
      metrics.charW = 1
      metrics.maxCols = Math.max(200, Math.floor(effectiveMaxWidth))
    } else {
      const maxPossibleCols = Math.floor(effectiveMaxWidth / metrics.charW)
      metrics.maxCols = Math.max(20, Math.min(100, maxPossibleCols))
    }

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
      if (w.targetY > maxRow) maxRow = w.targetY
    }
    const blockH = (maxRow + 1) * metrics.lineH
    metrics.padY = Math.max(16, Math.floor((availableHeight - blockH) / 2))
  }

  function updateWordCols() {
    const words = model.words
    const blockW = metrics.maxCols * metrics.charW
    const fallbackW = Math.max(1, Math.min(blockW, 360))
    const fallbackH = Math.max(metrics.lineH, Math.round(fallbackW * 0.6))
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (w.imageUrl) {
        const entry = imageCache.get(w.imageUrl)
        let drawW = fallbackW
        let drawH = fallbackH
        if (entry && entry.status === 'loaded' && entry.naturalWidth > 0 && entry.naturalHeight > 0) {
          const scale = Math.min(1, blockW / entry.naturalWidth)
          drawW = Math.round(entry.naturalWidth * scale)
          drawH = Math.round(entry.naturalHeight * scale)
        }
        w.imageW = drawW
        w.imageH = drawH
        w.pixelWidth = Math.max(1, drawW)
        w.breakAfter = true
        w.breakAfterRows = Math.max(1, Math.ceil(drawH / metrics.lineH))
        continue
      }
      const scaleSize = Math.max(1, Math.round(fontSize * w.baseScale))
      const fontKey = `${w.fontStyle}|${w.fontWeight}|${scaleSize}`
      let font = fontCache.get(fontKey)
      if (!font) {
        const stylePart = w.fontStyle === 'normal' ? '' : w.fontStyle
        const weightPart = w.fontWeight === 'normal' ? '' : w.fontWeight
        font = `${stylePart} ${weightPart} ${scaleSize}px ${fontFamily}`.replace(/\s+/g, ' ').trim()
        fontCache.set(fontKey, font)
      }
      ctx.font = font
      const width = ctx.measureText(w.displayText).width
      w.pixelWidth = width
    }
    ctx.font = fontString
  }

  /** Get words for a specific sentence */
  function getSentenceWords(sentenceIndex: number): Word[] {
    return model.wordsBySentence[sentenceIndex] || []
  }

  function wordRowSpan(w: Word): number {
    if (!w.imageH) return 1
    return Math.max(1, Math.ceil(w.imageH / metrics.lineH))
  }

  const { drawWord, drawWordPlain, drawWordRedactRect, wordIndexUnder } = createRenderer({
    ctx,
    model,
    metrics,
    fontFamily,
    fontCache,
    sentenceCenterCache,
    imageCache,
    ensureImage: (url: string) => { ensureImage(url) },
    scaleEps: SCALE_EPS,
    getSentenceWords,
    get animPadY() { return animPadY },
    get animPadX() { return animPadX },
    get animPanY() { return animPanY },
    get fontString() { return fontString },
    get fontSize() { return fontSize },
    get hoveredSentence() { return hoveredSentence },
    get focusStyle() { return focusStyle },
  })

  /** Calculate content bounds for given words */
  function getContentBounds(words: Word[]): { maxRow: number; maxX: number } {
    let maxRow = 0
    let maxX = 0
    for (const w of words) {
      const span = wordRowSpan(w)
      const endRow = w.targetY + span - 1
      if (endRow > maxRow) maxRow = endRow
      const endX = w.targetX + Math.max(1, w.pixelWidth)
      if (endX > maxX) maxX = endX
    }
    return { maxRow, maxX }
  }

  /** Check if content fits in available space */
  function contentFits(words: Word[]): boolean {
    const availableHeight = window.innerHeight - bottomReserve - 32
    const availableWidth = window.innerWidth - 32
    const { maxRow, maxX } = getContentBounds(words)
    const contentHeight = (maxRow + 1) * metrics.lineH + 32
    return contentHeight <= availableHeight && maxX <= availableWidth
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
    measureFont()
    updateWordCols()
    const layout = BEATS[beat].layout({ model, metrics })
    applyTargets(model.words, layout)
    sentenceCenterCache.clear()
    // Re-measure after layout to update vertical padding
    measureFont()
    updatePanForSentence()
    if (invalidateLayout) invalidate()
  }

  function applyTargets(words: Word[], targets: LayoutMap) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const t = targets.get(w.id)
      if (!t) continue
      w.targetX = t.col
      w.targetY = t.row
    }
  }

  function stepWordAnimation(dt: number): boolean {
    // smoothing factor; dt-normalized
    const k = -Math.expm1(LN_0_0001 * dt * moveSpeed)
    let active = false

    const words = model.words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const dCol = w.targetX - w.animX
      const dRow = w.targetY - w.animY
      const dScale = w.targetScale - w.animScale
      if (Math.abs(dCol) > EPS || Math.abs(dRow) > EPS || Math.abs(dScale) > EPS) active = true
      w.animX += dCol * k
      w.animY += dRow * k
      w.animScale += dScale * k
    }

    // smooth padY transition
    const kPad = -Math.expm1(LN_0_001 * dt * panSpeed)
    const dPad = metrics.padY - animPadY
    if (Math.abs(dPad) > EPS) active = true
    animPadY += dPad * kPad

    const dPadX = metrics.padX - animPadX
    if (Math.abs(dPadX) > EPS) active = true
    animPadX += dPadX * kPad

    const dPan = panY - animPanY
    if (Math.abs(dPan) > EPS) active = true
    animPanY += dPan * kPad
    return active
  }

  function updatePanForSentence() {
    if (hoveredSentence == null) {
      panY = 0
      return
    }
    const words = model.words
    let startIdx = -1
    let endIdx = -1
    for (let i = 0; i < words.length; i++) {
      if (words[i].sentenceIndex !== hoveredSentence) continue
      if (startIdx === -1) startIdx = i
      endIdx = i
    }
    if (startIdx === -1 || endIdx === -1) return

    const paragraphId = words[startIdx].paragraphIndex
    let paraStart = startIdx
    let paraEnd = endIdx
    for (let i = startIdx; i >= 0; i--) {
      if (words[i].paragraphIndex !== paragraphId) {
        paraStart = i + 1
        break
      }
      if (i === 0) paraStart = 0
    }
    for (let i = endIdx; i < words.length; i++) {
      if (words[i].paragraphIndex !== paragraphId) {
        paraEnd = i - 1
        break
      }
      if (i === words.length - 1) paraEnd = words.length - 1
    }

    let minRow = Infinity
    let maxRow = -Infinity
    for (let i = paraStart; i <= paraEnd; i++) {
      const w = words[i]
      const span = wordRowSpan(w)
      minRow = Math.min(minRow, w.targetY)
      maxRow = Math.max(maxRow, w.targetY + span - 1)
    }

    const top = metrics.padY + minRow * metrics.lineH + panY
    const bottom = metrics.padY + (maxRow + 1) * metrics.lineH + panY
    const viewportTop = 16
    const viewportBottom = window.innerHeight - bottomReserve - 16
    const centerY = (viewportTop + viewportBottom) / 2
    const midY = (top + bottom) / 2
    panY += centerY - midY
  }

  function sentenceYOffset(sentenceIndex: number): number {
    if (hoveredSentence == null) return 0
    
    const baseGap = 48
    
    if (sentenceIndex < hoveredSentence) return -baseGap / 2
    if (sentenceIndex > hoveredSentence) return baseGap / 2
    return 0
  }

  function stepFocus(dt: number): boolean {
    const k = -Math.expm1(LN_0_01 * dt * focusSpeed)
    const isMagnifyBeat = false
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

  const onMouseMove = () => {
    if (document.body.style.cursor !== 'default') {
      document.body.style.cursor = 'default'
    }
  }

  const onClick = (e: MouseEvent) => {
    const idx = wordIndexUnder(e.offsetX, e.offsetY)
    if (idx == null) return
    const w = model.words[idx]
    if (w.linkUrl) window.open(w.linkUrl, '_blank', 'noopener')
  }

  const onResize = () => {
    applyDPR()
    measureFont()
    layoutCurrentBeat()
  }

  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('click', onClick)
  window.addEventListener('resize', onResize)

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
    animPadX = metrics.padX
    animPanY = panY
    for (const w of model.words) {
      w.animX = w.targetX
      w.animY = w.targetY
      w.animScale = w.targetScale
    }

    running = true
    needsRedraw = true
    if (hoveredSentence === null) {
      hoveredSentence = 0 // auto-focus first sentence
    }
    notifyStateChange()
    requestFrame()
  }

  function setBeat(next: BeatId) {
    beat = next
    pixelLayout = true
    layoutCurrentBeat()
    notifyStateChange()
  }

  function setFocusStyle(next: FocusStyleId) {
    focusStyle = next
    notifyStateChange()
    invalidate()
  }

  function cycleFocusStyle() {
    const ids: FocusStyleId[] = ['gray', 'redact', 'none']
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
    updatePanForSentence()
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
    updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  function goToLastSentence() {
    hoveredSentence = model.sentenceCount - 1
    updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
  }

  function setSentence(index: number | null) {
    if (index === null) {
      hoveredSentence = null
    } else {
      hoveredSentence = Math.max(0, Math.min(model.sentenceCount - 1, index))
    }
    updatePanForSentence()
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

  function destroy() {
    destroyed = true
    running = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('click', onClick)
    window.removeEventListener('resize', onResize)
    onStateChange = null
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
    setMoveSpeed: (value: number) => { moveSpeed = Math.max(0.2, Math.min(3, value)) },
    setPanSpeed: (value: number) => { panSpeed = Math.max(0.2, Math.min(3, value)) },
    setFocusSpeed: (value: number) => { focusSpeed = Math.max(0.2, Math.min(3, value)) },
    getMoveSpeed: () => moveSpeed,
    getPanSpeed: () => panSpeed,
    getFocusSpeed: () => focusSpeed,
    setBottomReserve,
    autoFitFontSize,
    isSentenceOnlyMode: () => sentenceOnlyMode,
    setSentence,
    destroy,
    set onStateChange(fn: typeof onStateChange) { onStateChange = fn },
  }
}
