import { BEATS, type BeatId, type FocusStyleId, type LayoutMap, type Metrics } from './experiments'
import { createRenderer, findVisibleRange, type CanvasTheme } from './engine-render'
import type { DocumentModel, Word } from './document'
import { computeNextIndex, computePrevIndex, computeLastIndex, clampIndex } from './engine-sentences'

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
}

type EngineStateUpdate = {
  model?: DocumentModel
  scope?: LayoutScope
  fontFamily?: string
  maxContentWidth?: number
  fontSize?: number
  beat?: BeatId
  bottomReserve?: number
}

type LayoutScope =
  | { mode: 'full'; paragraphBreakRows: number }
  | { mode: 'paragraph'; paragraphIndex: number; sentenceOffset: number; sentenceCount: number }

export function createEngine({ canvas, words: initialModel, fontFamily: fontOverride, maxContentWidth: maxWidthOverride }: EngineOpts) {
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
    highlight: '#4f46e5',
    imageBg: '#f1f1f1',
    imageBorder: '#c9c9c9',
    imageText: '#666',
  }

  const darkTheme: CanvasTheme = {
    text: '#f5f2eb',
    link: '#86b7ff',
    redacted: 'rgba(255, 255, 255, 0.12)',
    highlight: '#818cf8',
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
  let onLayout: (() => void) | null = null
  let lastLayoutNotify = 0
  const LAYOUT_NOTIFY_THROTTLE = 200 // ms
  let maxContentWidth = maxWidthOverride ?? 720
  let fontSize = 18
  let bottomReserve = 0 // Space to reserve at bottom (for HUD on mobile)
  let sentenceOnlyMode = false // When true, only show current sentence (for mobile overflow)
  // Controls both vertical block alignment and sentence-following behavior
  let sentenceFollowMode: 'center' | 'reveal' = 'center'
  const defaultFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  let fontFamily = fontOverride || defaultFontFamily
  const SCALE_EPS = 1.01
  const AUTO_FIT_MIN_PX = 10
  const AUTO_FIT_MAX_PX = 128
  const SENTENCE_FIT_MIN_PX = 16
  const SENTENCE_FIT_MAX_PX = 64

  // Cached font string to avoid allocation in hot loop
  let fontString = ''
  const fontCache = new Map<string, string>()

  // Word width cache: keyed by `fontKey|displayText` (LRU-capped)
  const WORD_WIDTH_CACHE_MAX = 10000
  const wordWidthCache = new Map<string, number>()

  // Performance timing metrics (exposed for HUD)
  // Rolling average over last N samples
  const PERF_WINDOW = 10
  const perfSamples = {
    updateWordColsMs: [] as number[],
    applyScopeMs: [] as number[],
    layoutMs: [] as number[],
  }
  function addPerfSample(key: keyof typeof perfSamples, value: number) {
    const arr = perfSamples[key]
    arr.push(value)
    if (arr.length > PERF_WINDOW) arr.shift()
  }
  function getPerfAvg(key: keyof typeof perfSamples): number {
    const arr = perfSamples[key]
    if (arr.length === 0) return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  // Cached sentence centers for magnify mode
  const sentenceCenterCache = new Map<number, { centerCol: number; centerRow: number }>()
  const imageCache = new Map<string, ImageCacheEntry>()
  let imageRelayoutPending = false

  let needsRedraw = true
  let rafId = 0

  function notifyStateChange() {
    onStateChange?.(beat, focusStyle, hoveredSentence, sentenceCountInScope, sentenceOnlyMode)
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
      layoutCurrentBeat(true, true)
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
    // Cap DPR at 2 for mobile perf (3x is 2.25x more pixels than 2x)
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2)
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
    metrics.charW = 1
    metrics.maxCols = Math.max(200, Math.floor(effectiveMaxWidth))

    // Center block horizontally
    const blockW = metrics.maxCols * metrics.charW
    metrics.padX = Math.max(minPad, Math.floor((window.innerWidth - blockW) / 2))

    // Vertical padding uses cached maxRow (avoids re-scanning words)
    updateVerticalPadding()
  }

  /** Update vertical padding using cached lastLayoutMaxRow */
  function updateVerticalPadding() {
    if (sentenceFollowMode === 'reveal') {
      metrics.padY = 16
      return
    }
    const availableHeight = window.innerHeight - bottomReserve
    const blockH = (lastLayoutMaxRow + 1) * metrics.lineH
    metrics.padY = Math.max(16, Math.floor((availableHeight - blockH) / 2))
  }

  function updateWordCols() {
    const t0 = performance.now()
    const words = visibleWords
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

      // Check word width cache first
      const cacheKey = `${fontKey}|${w.displayText}`
      const cached = wordWidthCache.get(cacheKey)
      if (cached !== undefined) {
        w.pixelWidth = cached
        continue
      }

      // Cache miss: measure and store
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
      // LRU eviction: delete oldest when at capacity
      if (wordWidthCache.size >= WORD_WIDTH_CACHE_MAX) {
        const oldest = wordWidthCache.keys().next().value
        if (oldest !== undefined) wordWidthCache.delete(oldest)
      }
      wordWidthCache.set(cacheKey, width)
    }
    ctx.font = fontString
    addPerfSample('updateWordColsMs', performance.now() - t0)
  }

  function applyScope(nextScope: LayoutScope) {
    const t0 = performance.now()
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
      // O(1) lookup via precomputed wordsByParagraph
      visibleWords = model.wordsByParagraph[paragraphIndex] || []
    }

    if (sentenceCountInScope <= 0) {
      hoveredSentence = null
    } else if (hoveredSentence != null) {
      hoveredSentence = Math.max(0, Math.min(sentenceCountInScope - 1, hoveredSentence))
    }

    sentenceCenterCache.clear()
    addPerfSample('applyScopeMs', performance.now() - t0)
  }

  /** Get words for a specific sentence */
  function getSentenceWords(sentenceIndex: number): Word[] {
    return model.wordsBySentence[sentenceIndex] || []
  }

  /** Get row bounds for a sentence (O(1) via wordsBySentence) */
  function getSentenceRowBounds(sentence: number): { minRow: number; maxRow: number } {
    const sentenceWords = model.wordsBySentence[sentence] ?? []
    let minRow = Infinity
    let maxRow = -Infinity
    for (const w of sentenceWords) {
      const span = wordRowSpan(w)
      minRow = Math.min(minRow, w.targetY)
      maxRow = Math.max(maxRow, w.targetY + span - 1)
    }
    return { minRow, maxRow }
  }

  /** Find word nearest to viewport center (for anchor fallback) */
  function findWordNearestViewportCenter(): Word | null {
    const centerScreenY = window.innerHeight / 2
    let best: Word | null = null
    let bestDist = Infinity
    for (const w of visibleWords) {
      const screenY = metrics.padY + w.targetY * metrics.lineH + panY
      const dist = Math.abs(screenY - centerScreenY)
      if (dist < bestDist) {
        bestDist = dist
        best = w
      }
    }
    return best
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

  /** Auto-fit font size for visible words (no sentence-only fallback). Returns true if content fits. */
  function autoFitFontSize(): boolean {
    sentenceOnlyMode = false

    // Binary search for optimal font size for full paragraph
    let minSize = AUTO_FIT_MIN_PX
    let maxSize = AUTO_FIT_MAX_PX
    let bestSize = minSize

    while (minSize <= maxSize) {
      const testSize = Math.floor((minSize + maxSize) / 2)
      fontSize = testSize
      layoutCurrentBeat(false)

      if (contentFits(visibleWords)) {
        bestSize = testSize
        minSize = testSize + 1
      } else {
        maxSize = testSize - 1
      }
    }

    // Apply best size with anchor
    fontSize = bestSize
    measureFont()
    layoutCurrentBeat(true, true)

    notifyStateChange()
    return contentFits(visibleWords)
  }

  /** Fit just the current sentence to screen */
  function fitCurrentSentence() {
    const globalSentence = hoveredSentenceGlobal()
    if (globalSentence === null) return

    const sentenceWords = getSentenceWords(globalSentence)
    if (sentenceWords.length === 0) return

    // Binary search for optimal font size for this sentence
    let minSize = SENTENCE_FIT_MIN_PX
    let maxSize = SENTENCE_FIT_MAX_PX
    let bestSize = minSize

    while (minSize <= maxSize) {
      const testSize = Math.floor((minSize + maxSize) / 2)
      fontSize = testSize
      layoutCurrentBeat(false)

      if (contentFits(sentenceWords)) {
        bestSize = testSize
        minSize = testSize + 1
      } else {
        maxSize = testSize - 1
      }
    }

    // Apply best size with anchor
    fontSize = bestSize
    measureFont()
    layoutCurrentBeat(true, true)
  }

  function layoutCurrentBeat(invalidateLayout = true, useAnchor = false) {
    const t0 = performance.now()

    // Capture old metrics before layout for word animation rebasing
    const oldLineH = metrics.lineH
    const oldAnimPanY = animPanY
    const oldAnimPadY = animPadY

    // BEFORE: Capture anchor position if requested
    let anchorScreenY: number | null = null
    let anchorSentence: number | null = null

    if (useAnchor) {
      const globalSentence = hoveredSentenceGlobal()
      if (globalSentence != null) {
        anchorSentence = globalSentence
        const { minRow, maxRow } = getSentenceRowBounds(globalSentence)
        if (minRow !== Infinity) {
          const centerRow = (minRow + maxRow + 1) / 2
          anchorScreenY = metrics.padY + centerRow * metrics.lineH + panY
        }
      } else {
        // No sentence selected: anchor to word nearest viewport center
        const centerWord = findWordNearestViewportCenter()
        if (centerWord != null) {
          anchorScreenY = metrics.padY + centerWord.targetY * metrics.lineH + panY
          anchorSentence = centerWord.sentenceIndex
        }
      }
    }

    measureFont()
    updateWordCols()
    const layout = BEATS[beat].layout({ model, metrics, words: visibleWords, paragraphBreakRows })
    applyTargets(visibleWords, layout)
    sentenceCenterCache.clear()
    // Update vertical padding using cached maxRow (no re-scan)
    updateVerticalPadding()

    const lineHChanged = Math.abs(oldLineH - metrics.lineH) > 0.5

    // AFTER: Restore anchor position or fallback to centering
    if (lineHChanged) {
      // Font size changed: center the sentence (like j/k)
      updatePanForSentence()
    } else if (anchorScreenY != null && anchorSentence != null) {
      const { minRow, maxRow } = getSentenceRowBounds(anchorSentence)
      if (minRow !== Infinity) {
        const newCenterRow = (minRow + maxRow + 1) / 2
        const newScreenY = metrics.padY + newCenterRow * metrics.lineH + panY
        panY -= (newScreenY - anchorScreenY)
        animPanY = panY
      } else {
        updatePanForSentence()
      }
    } else {
      updatePanForSentence()
    }

    // Rebase animY: solve oldVisualY = newVisualY
    if (useAnchor) {
      if (lineHChanged) {
        // Snap everything for instant transition
        animPadY = metrics.padY
        animPadX = metrics.padX
        animPanY = panY
        for (const w of visibleWords) {
          w.animY = w.targetY
          w.animX = w.targetX
          w.animScale = w.targetScale
        }
      } else if (oldLineH > 0 && metrics.lineH > 0) {
        // Original rebasing for non-lineH changes
        const R = oldLineH / metrics.lineH
        const C = (oldAnimPadY + oldAnimPanY - metrics.padY - panY) / metrics.lineH
        for (let i = 0, len = visibleWords.length; i < len; i++) {
          visibleWords[i].animY = C + visibleWords[i].animY * R
        }
      }
    }

    addPerfSample('layoutMs', performance.now() - t0)
    // Throttle layout notifications for debug panel
    const now = performance.now()
    if (now - lastLayoutNotify > LAYOUT_NOTIFY_THROTTLE) {
      lastLayoutNotify = now
      onLayout?.()
    }
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
    prevAnimStart = prevAnimEnd = prevFocusStart = prevFocusEnd = 0
    applyScope(nextScope)
    layoutCurrentBeat()
    if (opts.snap) {
      snapToTargets()
    }
    notifyStateChange()
    invalidate()
  }

  function setModel(nextModel: DocumentModel, opts: { snap?: boolean } = {}) {
    prevAnimStart = prevAnimEnd = prevFocusStart = prevFocusEnd = 0
    model = nextModel
    renderState.model = model
    imageCache.clear()
    wordWidthCache.clear()
    applyScope(scope)
    layoutCurrentBeat()
    if (opts.snap) {
      snapToTargets()
    }
    notifyStateChange()
    invalidate()
  }

  function commit(update: EngineStateUpdate, opts: { snap?: boolean; useAnchor?: boolean } = {}) {
    let needsLayout = false
    let modelChanged = false
    let shouldAnchor = false

    if (update.model && update.model !== model) {
      model = update.model
      renderState.model = model
      imageCache.clear()
      wordWidthCache.clear()
      modelChanged = true
      needsLayout = true
    }

    if (update.fontFamily !== undefined && update.fontFamily !== fontFamily) {
      fontFamily = update.fontFamily || defaultFontFamily
      renderState.fontFamily = fontFamily
      wordWidthCache.clear()
      needsLayout = true
      shouldAnchor = true
    }

    if (update.maxContentWidth !== undefined) {
      const next = Math.max(200, Math.min(4000, update.maxContentWidth))
      if (next !== maxContentWidth) {
        maxContentWidth = next
        needsLayout = true
        shouldAnchor = true
      }
    }

    if (update.fontSize !== undefined) {
      const next = Math.max(10, Math.min(128, update.fontSize))
      if (next !== fontSize) {
        fontSize = next
        wordWidthCache.clear()
        needsLayout = true
        shouldAnchor = true
      }
    }

    if (update.beat && update.beat !== beat) {
      beat = update.beat
      needsLayout = true
      shouldAnchor = true
    }

    if (update.bottomReserve !== undefined && update.bottomReserve !== bottomReserve) {
      bottomReserve = update.bottomReserve
      needsLayout = true
      shouldAnchor = true
    }

    if (update.scope) {
      applyScope(update.scope)
      needsLayout = true
      // scope change = intentional navigation, don't anchor
    } else if (modelChanged) {
      applyScope(scope)
      needsLayout = true
      // model change = new doc, don't anchor
      shouldAnchor = false
    }

    if (!needsLayout) return

    // Use explicit opt if provided, otherwise auto-detect
    const useAnchor = opts.useAnchor ?? shouldAnchor
    layoutCurrentBeat(true, useAnchor)
    if (opts.snap) {
      snapToTargets()
    }
    notifyStateChange()
    invalidate()
  }

  // Cached maxRow from last applyTargets (avoids re-scan in measureFont)
  let lastLayoutMaxRow = 0

  function applyTargets(words: Word[], targets: LayoutMap) {
    let maxRow = 0
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const t = targets.get(w.id)
      if (!t) continue
      w.targetX = t.col
      w.targetY = t.row
      // Track maxRow including image row span
      const span = wordRowSpan(w)
      const endRow = w.targetY + span - 1
      if (endRow > maxRow) maxRow = endRow
    }
    lastLayoutMaxRow = maxRow
  }

  // Hot-range animation: only animate words near viewport
  const HOT_RANGE_MARGIN_ROWS = 20
  let prevAnimStart = 0, prevAnimEnd = 0
  let prevFocusStart = 0, prevFocusEnd = 0

  function stepWordAnimation(dt: number): boolean {
    // smoothing factor; dt-normalized
    const k = -Math.expm1(LN_0_0001 * dt * moveSpeed)
    let active = false

    const words = visibleWords
    // Find visible range with large margin for animation
    const marginPx = HOT_RANGE_MARGIN_ROWS * metrics.lineH
    const { start, end } = findVisibleRange(words, renderState, marginPx)

    // Animate words in hot range
    for (let i = start; i < end; i++) {
      const w = words[i]
      const dCol = w.targetX - w.animX
      const dRow = w.targetY - w.animY
      const dScale = w.targetScale - w.animScale
      if (Math.abs(dCol) > EPS || Math.abs(dRow) > EPS || Math.abs(dScale) > EPS) active = true
      w.animX += dCol * k
      w.animY += dRow * k
      w.animScale += dScale * k
    }

    // Snap words newly entering hot range (were outside prev, now inside)
    for (let i = start; i < Math.min(end, prevAnimStart); i++) {
      const w = words[i]
      w.animX = w.targetX; w.animY = w.targetY; w.animScale = w.targetScale
    }
    for (let i = Math.max(start, prevAnimEnd); i < end; i++) {
      const w = words[i]
      w.animX = w.targetX; w.animY = w.targetY; w.animScale = w.targetScale
    }
    prevAnimStart = start; prevAnimEnd = end

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

  function getViewportYBounds() {
    return { top: 16, bottom: window.innerHeight - bottomReserve - 16 }
  }

  function getSentenceScreenYBounds(globalSentence: number) {
    const bounds = getSentenceRowBounds(globalSentence)
    if (bounds.minRow === Infinity) return null
    return {
      top: metrics.padY + bounds.minRow * metrics.lineH + panY,
      bottom: metrics.padY + (bounds.maxRow + 1) * metrics.lineH + panY,
    }
  }

  function updatePanForSentence() {
    const globalSentence = hoveredSentenceGlobal()
    if (globalSentence == null) {
      panY = 0
      return
    }

    const sentenceBounds = getSentenceScreenYBounds(globalSentence)
    if (!sentenceBounds) return
    const viewport = getViewportYBounds()

    if (sentenceFollowMode === 'reveal') {
      const margin = 16
      if (sentenceBounds.bottom > viewport.bottom - margin) {
        panY += (viewport.bottom - margin) - sentenceBounds.bottom
      } else if (sentenceBounds.top < viewport.top + margin) {
        panY += (viewport.top + margin) - sentenceBounds.top
      }
      return
    }

    // Center mode: sentence midpoint → viewport center
    const centerY = (viewport.top + viewport.bottom) / 2
    const midY = (sentenceBounds.top + sentenceBounds.bottom) / 2
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
    // Find visible range with margin for focus animation
    const marginPx = HOT_RANGE_MARGIN_ROWS * metrics.lineH
    const { start, end } = findVisibleRange(words, renderState, marginPx)
    const hoveredGlobal = hoveredSentenceGlobal()

    // Animate words in hot range
    for (let i = start; i < end; i++) {
      const w = words[i]
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

    // Snap words newly entering focus hot range
    for (let i = start; i < Math.min(end, prevFocusStart); i++) {
      words[i].focusDy = sentenceYOffset(words[i].sentenceIndex)
      words[i].targetScale = 1.0
    }
    for (let i = Math.max(start, prevFocusEnd); i < end; i++) {
      words[i].focusDy = sentenceYOffset(words[i].sentenceIndex)
      words[i].targetScale = 1.0
    }
    prevFocusStart = start; prevFocusEnd = end

    return active
  }

  function clear() {
    // Clear in device-pixel space to avoid transform overhead
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }

  const onClick = (e: MouseEvent) => {
    const w = wordUnder(e.offsetX, e.offsetY)
    if (!w) return
    if (w.linkUrl) window.open(w.linkUrl, '_blank', 'noopener')
  }

  const onResize = () => {
    applyDPR()
    measureFont()
    layoutCurrentBeat(true, true)
  }

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
      // Binary search for visible range (with margin for smooth scroll)
      const { start, end } = findVisibleRange(words, renderState, metrics.lineH * 2)
      if (hoveredGlobal !== null && focusStyle !== 'none') {
        if (focusStyle === 'highlight') {
          // unfocused: normal color
          for (let i = start; i < end; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredGlobal) drawWordPlain(w)
          }
          // focused: highlight color
          ctx.fillStyle = theme.highlight
          for (let i = start; i < end; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredGlobal) drawWordPlain(w)
          }
          ctx.fillStyle = theme.text
        } else if (focusStyle === 'gray') {
          ctx.globalAlpha = 0.2
          for (let i = start; i < end; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredGlobal) drawWordPlain(w)
          }
          ctx.globalAlpha = 1
          for (let i = start; i < end; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredGlobal) drawWordPlain(w)
          }
        } else if (focusStyle === 'redact') {
          ctx.fillStyle = theme.redacted
          for (let i = start; i < end; i++) {
            const w = words[i]
            if (w.sentenceIndex !== hoveredGlobal) drawWordRedactRect(w)
          }
          ctx.fillStyle = theme.text
          for (let i = start; i < end; i++) {
            const w = words[i]
            if (w.sentenceIndex === hoveredGlobal) drawWordPlain(w)
          }
        } else {
          for (let i = start; i < end; i++) drawWord(words[i])
        }
      } else {
        for (let i = start; i < end; i++) drawWordPlain(words[i])
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
    layoutCurrentBeat(true, true)
    notifyStateChange()
  }

  function setFocusStyle(next: FocusStyleId) {
    focusStyle = next
    notifyStateChange()
    invalidate()
  }

  function cycleFocusStyle() {
    const ids: FocusStyleId[] = ['gray', 'highlight', 'redact', 'none']
    const idx = ids.indexOf(focusStyle)
    focusStyle = ids[(idx + 1) % ids.length]
    notifyStateChange()
    invalidate()
  }

  /** Returns 'wrap' if at end and should go to next paragraph */
  function nextSentence(): 'ok' | 'wrap' {
    const { index, result } = computeNextIndex(hoveredSentence, sentenceCountInScope)
    if (result === 'wrap') return 'wrap'
    hoveredSentence = index
    if (hoveredSentence > 0) updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  /** Returns 'wrap' if at start and should go to prev paragraph */
  function prevSentence(): 'ok' | 'wrap' {
    const { index, result } = computePrevIndex(hoveredSentence, sentenceCountInScope)
    if (result === 'wrap') return 'wrap'
    hoveredSentence = index
    if (hoveredSentence < sentenceCountInScope - 1) updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  function goToLastSentence() {
    hoveredSentence = computeLastIndex(sentenceCountInScope)
    updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
  }

  function setSentence(index: number | null, opts: { snap?: boolean } = {}) {
    hoveredSentence = clampIndex(index, sentenceCountInScope)
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
    maxContentWidth = Math.max(200, Math.min(4000, w))
    measureFont()
    layoutCurrentBeat(true, true)
  }

  function getMaxWidth() {
    return maxContentWidth
  }

  function setFontSize(size: number) {
    fontSize = Math.max(10, Math.min(128, size))
    wordWidthCache.clear()
    measureFont()
    layoutCurrentBeat(true, true)
  }

  function setFontFamily(next?: string) {
    fontFamily = next || defaultFontFamily
    renderState.fontFamily = fontFamily
    wordWidthCache.clear()
    measureFont()
    layoutCurrentBeat(true, true)
  }

  function getFontSize() {
    return fontSize
  }

  function setBottomReserve(h: number) {
    bottomReserve = h
    measureFont()
    layoutCurrentBeat(true, true)
  }

  function destroy() {
    destroyed = true
    running = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
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
    setSentenceFollowMode: (mode: 'center' | 'reveal') => { sentenceFollowMode = mode },
    setScope,
    setModel,
    commit,
    destroy,
    getPerfMetrics: () => ({
      updateWordColsMs: getPerfAvg('updateWordColsMs'),
      applyScopeMs: getPerfAvg('applyScopeMs'),
      layoutMs: getPerfAvg('layoutMs'),
    }),
    set onStateChange(fn: typeof onStateChange) { onStateChange = fn },
    set onLayout(fn: typeof onLayout) { onLayout = fn },
  }
}
