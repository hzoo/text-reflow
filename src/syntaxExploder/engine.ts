import { BEATS, type BeatId, type FocusStyleId, type LayoutMap, type Metrics } from './experiments'
import { createRenderer, type CanvasTheme } from './engine-render'
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

type EngineStateUpdate = {
  model?: DocumentModel
  scope?: LayoutScope
  fontFamily?: string
  maxContentWidth?: number
  fontSize?: number
  beat?: BeatId
  pixelLayout?: boolean
  bottomReserve?: number
}

type LayoutScope =
  | { mode: 'full'; paragraphBreakRows: number }
  | { mode: 'paragraph'; paragraphIndex: number; sentenceOffset: number; sentenceCount: number }

export function createEngine({ canvas, words: initialModel, fontFamily: fontOverride, maxContentWidth: maxWidthOverride, pixelLayout: pixelLayoutOverride }: EngineOpts) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D context not available')
  const ctx = context

  let running = false
  let destroyed = false
  let beat: BeatId = 'reader'
  let focusStyle: FocusStyleId = 'gray'

  let hoveredSentence: number | null = null
  let model = initialModel
  let scope: LayoutScope = { mode: 'full', paragraphBreakRows: 0 }
  let sentenceOffset = 0
  let sentenceCountInScope = model.sentenceCount
  let paragraphBreakRows = 0
  let visibleWords: Word[] = model.words

  const lightTheme: CanvasTheme = {
    text: '#111',
    link: '#1a5fb4',
    redacted: 'rgba(0, 0, 0, 0.1)',
    imageBg: '#f1f1f1',
    imageBorder: '#c9c9c9',
    imageText: '#666',
  }

  const darkTheme: CanvasTheme = {
    text: '#f5f2eb',
    link: '#86b7ff',
    redacted: 'rgba(255, 255, 255, 0.12)',
    imageBg: '#1b1c1f',
    imageBorder: '#3a3d44',
    imageText: '#c3c7cf',
  }

  const theme = { ...lightTheme }
  const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  const applyTheme = () => {
    Object.assign(theme, colorSchemeQuery?.matches ? darkTheme : lightTheme)
    invalidate()
  }
  const handleColorSchemeChange = () => applyTheme()

  let onStateChange: ((beat: BeatId, focusStyle: FocusStyleId, sentence: number | null, total: number, sentenceOnlyMode: boolean) => void) | null = null
  let maxContentWidth = maxWidthOverride ?? 800
  let pixelLayout = pixelLayoutOverride ?? false
  let fontSize = 20
  let bottomReserve = 0 // Space to reserve at bottom (for HUD on mobile)
  let sentenceOnlyMode = false // When true, only show current sentence (for mobile overflow)
  const defaultFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  let fontFamily = fontOverride || defaultFontFamily
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
    onStateChange?.(beat, focusStyle, hoveredSentence, sentenceCountInScope, sentenceOnlyMode)
    if ((window as any).__reflowDebug) {
      console.debug('[reflow] sentence', hoveredSentence, 'count', sentenceCountInScope)
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
  const LN_0_01 = Math.log(0.002)
  let animPadY = 24
  let animPadX = 24
  let panY = 0
  let animPanY = 0
  let moveSpeed = 1
  let panSpeed = 1
  let focusSpeed = 1
  let fullFocusPush = false

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
    const words = visibleWords
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

  function applyScope(nextScope: LayoutScope) {
    scope = nextScope
    if (scope.mode === 'full') {
      sentenceOffset = 0
      sentenceCountInScope = model.sentenceCount
      paragraphBreakRows = scope.paragraphBreakRows
      visibleWords = model.words
    } else {
      const paragraphIndex = scope.paragraphIndex
      sentenceOffset = scope.sentenceOffset
      sentenceCountInScope = scope.sentenceCount
      paragraphBreakRows = 0
      visibleWords = model.words.filter((w) => w.paragraphIndex === paragraphIndex)
    }

    if (sentenceCountInScope <= 0) {
      hoveredSentence = null
    } else if (hoveredSentence != null) {
      hoveredSentence = Math.max(0, Math.min(sentenceCountInScope - 1, hoveredSentence))
    }

    sentenceCenterCache.clear()
  }

  /** Get words for a specific sentence */
  function getSentenceWords(sentenceIndex: number): Word[] {
    return model.wordsBySentence[sentenceIndex] || []
  }

  function hoveredSentenceGlobal(): number | null {
    if (hoveredSentence == null) return null
    return sentenceOffset + hoveredSentence
  }

  function wordRowSpan(w: Word): number {
    if (!w.imageH) return 1
    return Math.max(1, Math.ceil(w.imageH / metrics.lineH))
  }

  const renderState = {
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
    getVisibleWords: () => visibleWords,
    get animPadY() { return animPadY },
    get animPadX() { return animPadX },
    get animPanY() { return animPanY },
    get fontString() { return fontString },
    get fontSize() { return fontSize },
    get hoveredSentence() { return hoveredSentenceGlobal() },
    get focusStyle() { return focusStyle },
    theme,
  }
  const { drawWord, drawWordPlain, drawWordRedactRect, wordUnder } = createRenderer(renderState)

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

      if (contentFits(visibleWords)) {
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
    if (!contentFits(visibleWords)) {
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
    const globalSentence = hoveredSentenceGlobal()
    if (globalSentence === null) return

    const sentenceWords = getSentenceWords(globalSentence)
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
    const layout = BEATS[beat].layout({ model, metrics, words: visibleWords, paragraphBreakRows })
    applyTargets(visibleWords, layout)
    sentenceCenterCache.clear()
    // Re-measure after layout to update vertical padding
    measureFont()
    updatePanForSentence()
    if (invalidateLayout) invalidate()
  }

  function snapToTargets() {
    animPadY = metrics.padY
    animPadX = metrics.padX
    animPanY = panY
    for (const w of visibleWords) {
      w.animX = w.targetX
      w.animY = w.targetY
      w.animScale = w.targetScale
    }
  }

  function setScope(nextScope: LayoutScope, opts: { snap?: boolean } = {}) {
    applyScope(nextScope)
    layoutCurrentBeat()
    if (opts.snap) {
      snapToTargets()
    }
    notifyStateChange()
    invalidate()
  }

  function setModel(nextModel: DocumentModel, opts: { snap?: boolean } = {}) {
    model = nextModel
    renderState.model = model
    applyScope(scope)
    layoutCurrentBeat()
    if (opts.snap) {
      snapToTargets()
    }
    notifyStateChange()
    invalidate()
  }

  function commit(update: EngineStateUpdate, opts: { snap?: boolean } = {}) {
    let needsLayout = false
    let modelChanged = false

    if (update.model && update.model !== model) {
      model = update.model
      renderState.model = model
      modelChanged = true
      needsLayout = true
    }

    if (update.fontFamily !== undefined && update.fontFamily !== fontFamily) {
      fontFamily = update.fontFamily || defaultFontFamily
      renderState.fontFamily = fontFamily
      needsLayout = true
    }

    if (update.maxContentWidth !== undefined) {
      const next = Math.max(300, Math.min(1200, update.maxContentWidth))
      if (next !== maxContentWidth) {
        maxContentWidth = next
        needsLayout = true
      }
    }

    if (update.fontSize !== undefined) {
      const next = Math.max(12, Math.min(40, update.fontSize))
      if (next !== fontSize) {
        fontSize = next
        needsLayout = true
      }
    }

    if (update.beat && update.beat !== beat) {
      beat = update.beat
      needsLayout = true
    }

    if (update.pixelLayout !== undefined && update.pixelLayout !== pixelLayout) {
      pixelLayout = update.pixelLayout
      needsLayout = true
    }

    if (update.bottomReserve !== undefined && update.bottomReserve !== bottomReserve) {
      bottomReserve = update.bottomReserve
      needsLayout = true
    }

    if (update.scope) {
      applyScope(update.scope)
      needsLayout = true
    } else if (modelChanged) {
      applyScope(scope)
      needsLayout = true
    }

    if (!needsLayout) return

    layoutCurrentBeat()
    if (opts.snap) {
      snapToTargets()
    }
    notifyStateChange()
    invalidate()
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

    const words = visibleWords
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
    const globalSentence = hoveredSentenceGlobal()
    if (globalSentence == null) {
      panY = 0
      return
    }
    const sentenceWords = getSentenceWords(globalSentence)
    if (sentenceWords.length === 0) return

    let minRow = Infinity
    let maxRow = -Infinity

    const paragraphId = sentenceWords[0].paragraphIndex
    const words = visibleWords
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (w.paragraphIndex !== paragraphId) continue
      const span = wordRowSpan(w)
      minRow = Math.min(minRow, w.targetY)
      maxRow = Math.max(maxRow, w.targetY + span - 1)
    }
    if (!Number.isFinite(minRow) || !Number.isFinite(maxRow)) return

    const top = metrics.padY + minRow * metrics.lineH + panY
    const bottom = metrics.padY + (maxRow + 1) * metrics.lineH + panY
    const viewportTop = 16
    const viewportBottom = window.innerHeight - bottomReserve - 16
    const centerY = (viewportTop + viewportBottom) / 2
    const midY = (top + bottom) / 2
    panY += centerY - midY
  }

  function sentenceYOffset(sentenceIndex: number): number {
    const hoveredGlobal = hoveredSentenceGlobal()
    if (hoveredGlobal == null) return 0

    const baseGap = scope.mode === 'full' ? (fullFocusPush ? 24 : 0) : 32

    if (sentenceIndex < hoveredGlobal) return -baseGap / 2
    if (sentenceIndex > hoveredGlobal) return baseGap / 2
    return 0
  }

  function stepFocus(dt: number): boolean {
    const k = -Math.expm1(LN_0_01 * dt * focusSpeed)
    const isMagnifyBeat = false
    let active = false

    const words = visibleWords
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const hoveredGlobal = hoveredSentenceGlobal()
      const isHoveredSent = hoveredGlobal !== null && w.sentenceIndex === hoveredGlobal
      
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
    const w = wordUnder(e.offsetX, e.offsetY)
    if (!w) return
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
  if (colorSchemeQuery) {
    colorSchemeQuery.addEventListener('change', handleColorSchemeChange)
  }

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
    ctx.fillStyle = theme.text
    ctx.globalAlpha = 1

    const hoveredGlobal = hoveredSentenceGlobal()

    // In sentence-only mode, only draw the current sentence
    if (sentenceOnlyMode && hoveredGlobal !== null) {
      const words = getSentenceWords(hoveredGlobal)
      for (let i = 0; i < words.length; i++) drawWordPlain(words[i])
    } else {
      const words = visibleWords
      if (hoveredGlobal !== null && focusStyle !== 'none') {
        if (focusStyle === 'gray') {
          ctx.globalAlpha = 0.2
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredGlobal) drawWordPlain(w)
          }
          ctx.globalAlpha = 1
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredGlobal) drawWordPlain(w)
          }
        } else if (focusStyle === 'redact') {
          ctx.fillStyle = theme.redacted
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredGlobal) drawWordRedactRect(w)
          }
          ctx.fillStyle = theme.text
          for (let i = 0; i < words.length; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredGlobal) drawWordPlain(w)
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
    applyTheme()
    applyDPR()
    measureFont()

    // init anim state to targets
    layoutCurrentBeat()
    animPadY = metrics.padY
    animPadX = metrics.padX
    animPanY = panY
    for (const w of visibleWords) {
      w.animX = w.targetX
      w.animY = w.targetY
      w.animScale = w.targetScale
    }

    running = true
    needsRedraw = true
    if (hoveredSentence === null && sentenceCountInScope > 0) {
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
    if (hoveredSentence >= sentenceCountInScope - 1) {
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
      hoveredSentence = Math.max(0, sentenceCountInScope - 1)
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
    hoveredSentence = Math.max(0, sentenceCountInScope - 1)
    updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
  }

  function setSentence(index: number | null, opts: { snap?: boolean } = {}) {
    if (index === null) {
      hoveredSentence = null
    } else {
      hoveredSentence = Math.max(0, Math.min(sentenceCountInScope - 1, index))
    }
    updatePanForSentence()
    if (opts.snap) {
      animPadY = metrics.padY
      animPadX = metrics.padX
      animPanY = panY
      for (const w of visibleWords) {
        w.animX = w.targetX
        w.animY = w.targetY
        w.animScale = w.targetScale
        w.focusDy = sentenceYOffset(w.sentenceIndex)
      }
    }
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

  function setFontFamily(next?: string) {
    fontFamily = next || defaultFontFamily
    renderState.fontFamily = fontFamily
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
    if (colorSchemeQuery) {
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChange)
    }
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
    setFontFamily,
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
    setFullFocusPush: (next: boolean) => { fullFocusPush = next },
    setScope,
    setModel,
    commit,
    destroy,
    set onStateChange(fn: typeof onStateChange) { onStateChange = fn },
  }
}
