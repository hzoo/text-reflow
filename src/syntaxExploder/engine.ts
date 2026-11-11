import { BEATS, type BeatId, type FocusStyleId, type Metrics } from './experiments'
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
  fontSizing?: FontSizing
}

export type FontSizing = { kind: 'manual'; size: number } | { kind: 'auto' }

type EngineStateUpdate = {
  model?: DocumentModel
  scope?: LayoutScope
  fontFamily?: string
  maxContentWidth?: number
  fontSizing?: FontSizing
  beat?: BeatId
  bottomReserve?: number
  debug?: boolean
}

type LayoutScope =
  | { mode: 'full'; paragraphBreakRows: number }
  | { mode: 'paragraph'; paragraphIndex: number; sentenceOffset: number; sentenceCount: number }

function clampFontSize(size: number): number {
  return Number.isFinite(size) ? Math.max(10, Math.min(128, size)) : 18
}

function sameScope(a: LayoutScope, b: LayoutScope): boolean {
  if (a.mode === 'full') return b.mode === 'full' && a.paragraphBreakRows === b.paragraphBreakRows
  return b.mode === 'paragraph' && a.paragraphIndex === b.paragraphIndex
    && a.sentenceOffset === b.sentenceOffset && a.sentenceCount === b.sentenceCount
}

export function createEngine({ canvas, words: initialModel, fontFamily: fontOverride, maxContentWidth: maxWidthOverride, fontSizing }: EngineOpts) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D context not available')
  const ctx = context

  let running = false
  let destroyed = false
  let beat: BeatId = 'reader'
  let focusStyle: FocusStyleId = 'gray'
  let debug = false

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
  let     onLayout: (() => void) | null = null
  let onFrame: ((firstWordY: number) => void) | null = null
  let lastLayoutNotify = 0
  const LAYOUT_NOTIFY_THROTTLE = 200 // ms
  let maxContentWidth = maxWidthOverride ?? 720
  let fontSize = fontSizing?.kind === 'manual' ? clampFontSize(fontSizing.size) : 18
  let autoFont = fontSizing?.kind === 'auto'
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
  const WORD_WIDTH_CACHE_MAX = 25000
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

  // Cached sentence metrics for O(1) lookups
  type SentenceMetric = {
    minRow: number
    maxRow: number
    centerX: number
    centerRow: number
  }
  let sentenceMetrics: SentenceMetric[] = []

  // Metrics dirty checking
  let metricsDirty = true
  let lastFontSize = 0
  let lastFontFamily = ''
  let lastMaxWidth = 0
  let lastModel: DocumentModel | null = null

  // Cached sentence centers for magnify mode
  const imageCache = new Map<string, ImageCacheEntry>()
  let imageRelayoutPending = false

  let needsRedraw = true
  let rafId = 0
  let batchDepth = 0
  let stateDirty = false
  
  // Background warming state
  let backgroundTaskVersion = 0
  let backgroundWarmTimer: ReturnType<typeof setTimeout> | null = null
  let widthWarmComplete = false
  let layoutUsesEstimatedWidths = false
  let warnedNonFiniteWidth = false
  let warnedNonFiniteLineH = false

  function resetWidthWarm() {
    widthWarmComplete = false
    warnedNonFiniteWidth = false
    warnedNonFiniteLineH = false
    backgroundTaskVersion++
    if (backgroundWarmTimer) clearTimeout(backgroundWarmTimer)
    backgroundWarmTimer = null
  }

  function notifyStateChange() {
    if (batchDepth > 0) {
      stateDirty = true
      return
    }
    onStateChange?.(beat, focusStyle, hoveredSentence, sentenceCountInScope, sentenceOnlyMode)
    stateDirty = false
  }

  function batch(fn: () => void) {
    batchDepth++
    try {
      fn()
    } finally {
      batchDepth--
      if (batchDepth === 0 && stateDirty) {
        notifyStateChange()
      }
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
      layoutForSettings(true)
      notifyStateChange()
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
      if (imageCache.get(url) !== entry) return
      metricsDirty = true
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
    spaceW: 10,
  }

  const EPS = 0.001
  const LN_0_0001 = Math.log(0.0003)
  const LN_0_001 = Math.log(0.002)
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
    if (!Number.isFinite(fontSize)) {
      fontSize = 18
      if (!warnedNonFiniteWidth) {
        warnedNonFiniteWidth = true
        console.error('[engine] non-finite fontSize; resetting to 18')
      }
    }
    ctx.textBaseline = 'top'
    fontString = `${fontSize}px ${fontFamily}`
    ctx.font = fontString
    fontCache.clear()
    fontCache.set(`normal|normal|${fontSize}`, fontString)

    const sample = 'abcdefghijklmnopqrstuvwxyz'
    const sampleWidth = ctx.measureText(sample).width
    metrics.charW = sampleWidth ? sampleWidth / sample.length : fontSize * 0.6
    
    // Measure standard space width for body text (scale 1.0)
    metrics.spaceW = ctx.measureText(' ').width

    const m = ctx.measureText('M')
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.75
    const descent = m.actualBoundingBoxDescent || fontSize * 0.25
    const nextLineH = Math.max(fontSize, (ascent + descent) * 1.35)
    if (Number.isFinite(nextLineH) && nextLineH > 1) {
      metrics.lineH = nextLineH
    } else {
      metrics.lineH = Math.max(12, fontSize)
      if (!warnedNonFiniteLineH) {
        warnedNonFiniteLineH = true
        console.error('[engine] non-finite lineH; using fallback', { nextLineH, fontSize, fontFamily })
      }
    }

    // Responsive: always fit within viewport
    const minPad = Math.max(16, Math.min(32, window.innerWidth * 0.04))
    const viewportWidth = window.innerWidth - minPad * 2

    // Cap content width to viewport
    const safeMaxWidth = Number.isFinite(maxContentWidth) ? maxContentWidth : 720
    const effectiveMaxWidth = Math.min(viewportWidth, safeMaxWidth)

    // Layout width is in pixels (maxCols == maxWidthPx)
    const effective = Number.isFinite(effectiveMaxWidth) ? effectiveMaxWidth : 720
    const nextMaxCols = Math.max(200, Math.floor(effective))
    if (nextMaxCols !== metrics.maxCols) metricsDirty = true
    metrics.maxCols = nextMaxCols

    // Center block horizontally
    metrics.padX = Math.max(minPad, Math.floor((window.innerWidth - metrics.maxCols) / 2))

    // Vertical padding uses cached maxRow (avoids re-scanning words)
    updateVerticalPadding()
  }

  function preWarmWidthCache(startSent: number, endSent: number) {
    if (!metricsDirty && wordWidthCache.size > 0) return

    const t0 = performance.now()
    ctx.font = fontString
    const words = model.words
    const seen = new Set<string>()
    
    // Convert sentence range to word range
    // O(1) if using wordsBySentence, or just iterate words if safer
    // Let's iterate all words and filter by sentence index to be robust
    // Actually, we can use the first word of startSent and last of endSent
    
    let startIndex = 0
    let endIndex = words.length
    
    if (model.wordsBySentence[startSent] && model.wordsBySentence[startSent].length > 0) {
      startIndex = model.wordsBySentence[startSent][0].tokenIndex
    }
    if (model.wordsBySentence[endSent] && model.wordsBySentence[endSent].length > 0) {
      const s = model.wordsBySentence[endSent]
      endIndex = s[s.length - 1].tokenIndex + 1
    }
    
    // Clamp
    startIndex = Math.max(0, startIndex)
    endIndex = Math.min(words.length, endIndex)

    for (let i = startIndex; i < endIndex; i++) {
      const w = words[i]
      if (w.imageUrl) continue
      
      const scaleSize = Math.max(1, Math.round(fontSize * w.baseScale))
      const fontKey = `${w.fontStyle}|${w.fontWeight}|${scaleSize}`
      const cacheKey = `${fontKey}|${w.displayText}`
      
      if (wordWidthCache.has(cacheKey)) continue
      if (seen.has(cacheKey)) continue
      seen.add(cacheKey)

      // Measure
      let font = fontCache.get(fontKey)
      if (!font) {
        const stylePart = w.fontStyle === 'normal' ? '' : w.fontStyle
        const weightPart = w.fontWeight === 'normal' ? '' : w.fontWeight
        font = `${stylePart} ${weightPart} ${scaleSize}px ${fontFamily}`.replace(/\s+/g, ' ').trim()
        fontCache.set(fontKey, font)
      }
      ctx.font = font
      const fullWidth = ctx.measureText(w.displayText).width
      
      let pixelWidth = fullWidth
      if (w.baseScale > 1.03 && w.displayText.endsWith(' ')) {
        const textWidth = ctx.measureText(w.displayText.trimEnd()).width
        pixelWidth = textWidth + metrics.spaceW
      }
      
      if (!Number.isFinite(pixelWidth) || pixelWidth <= 0) continue
      wordWidthCache.set(cacheKey, pixelWidth)
      if (wordWidthCache.size > WORD_WIDTH_CACHE_MAX) {
        const oldest = wordWidthCache.keys().next().value
        if (oldest !== undefined) wordWidthCache.delete(oldest)
      }
      
      // Safety cap: 5ms for synchronous "Hot Zone" warming
      if (performance.now() - t0 > 5) break 
    }
    ctx.font = fontString
  }

  function scheduleBackgroundWarming(currentVersion: number, nextStartWordIndex: number) {
    if (backgroundWarmTimer) clearTimeout(backgroundWarmTimer)
    
    backgroundWarmTimer = setTimeout(() => {
      if (destroyed || currentVersion !== backgroundTaskVersion) {
        backgroundWarmTimer = null
        return
      }
      
      const t0 = performance.now()
      ctx.font = fontString
      const words = model.words
      let i = nextStartWordIndex
      let count = 0
      
      // Process chunk with strict limits: max 5ms OR max 100 words
      while (i < words.length && count < 100 && performance.now() - t0 < 5) {
        const w = words[i]
        i++
        count++
        if (w.imageUrl) continue
        
        const scaleSize = Math.max(1, Math.round(fontSize * w.baseScale))
        const fontKey = `${w.fontStyle}|${w.fontWeight}|${scaleSize}`
        const cacheKey = `${fontKey}|${w.displayText}`
        
        if (wordWidthCache.has(cacheKey)) continue

        let font = fontCache.get(fontKey)
        if (!font) {
          const stylePart = w.fontStyle === 'normal' ? '' : w.fontStyle
          const weightPart = w.fontWeight === 'normal' ? '' : w.fontWeight
          font = `${stylePart} ${weightPart} ${scaleSize}px ${fontFamily}`.replace(/\s+/g, ' ').trim()
          fontCache.set(fontKey, font)
        }
        ctx.font = font
        const fullWidth = ctx.measureText(w.displayText).width
        
        let pixelWidth = fullWidth
        if (w.baseScale > 1.03 && w.displayText.endsWith(' ')) {
          const textWidth = ctx.measureText(w.displayText.trimEnd()).width
          pixelWidth = textWidth + metrics.spaceW
        }
        
        if (!Number.isFinite(pixelWidth) || pixelWidth <= 0) continue
        wordWidthCache.set(cacheKey, pixelWidth)
        if (wordWidthCache.size > WORD_WIDTH_CACHE_MAX) {
          const oldest = wordWidthCache.keys().next().value
          if (oldest !== undefined) wordWidthCache.delete(oldest)
        }
      }
      
      // Schedule next chunk if not done
      if (i < words.length) {
        scheduleBackgroundWarming(currentVersion, i)
      } else {
        backgroundWarmTimer = null
        if (!destroyed && currentVersion === backgroundTaskVersion) {
          widthWarmComplete = true
          // A layout can use estimates even when the needed widths were already cached.
          if (layoutUsesEstimatedWidths) {
            metricsDirty = true
            layoutCurrentBeat(true, true)
          }
        }
      }
    }, 16) // Yield to main thread
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

  function updateSentenceMetrics() {
    // Allocation free if size unchanged
    const count = sentenceCountInScope
    // Allocate array if size changed, otherwise reuse
    if (sentenceMetrics.length !== count) {
      sentenceMetrics = new Array(count)
    }

    // Initialize with defaults
    for (let i = 0; i < count; i++) {
      sentenceMetrics[i] = { minRow: Infinity, maxRow: -Infinity, centerX: 0, centerRow: 0 }
    }

    const words = visibleWords
    const startOffset = sentenceOffset

    // Single pass over words to accumulate bounds
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const localIndex = w.sentenceIndex - startOffset
      if (localIndex < 0 || localIndex >= count) continue

      const m = sentenceMetrics[localIndex]
      
      const span = w.imageH ? Math.max(1, Math.ceil(w.imageH / metrics.lineH)) : 1
      const bottomRow = w.targetY + span - 1

      if (w.targetY < m.minRow) m.minRow = w.targetY
      if (bottomRow > m.maxRow) m.maxRow = bottomRow
    }

    // Second pass for centers (requires bounds for rows, but X needs words)
    // Actually we can do X in the first pass if we track minX/maxX?
    // Let's do a more robust center calc:
    // Center Row = (minRow + maxRow) / 2
    // Center X = Average of word centers? Or (minX + maxX) / 2?
    // The previous implementation used (minX + maxX) / 2. Let's replicate that.

    // Re-initialize for X bounds
    const xBounds = new Float32Array(count * 2) // [minX, maxX, minX, maxX...]
    for (let i = 0; i < count; i++) {
      xBounds[i * 2] = Infinity
      xBounds[i * 2 + 1] = -Infinity
    }

    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const localIndex = w.sentenceIndex - startOffset
      if (localIndex < 0 || localIndex >= count) continue

      const base = localIndex * 2
      if (w.targetX < xBounds[base]) xBounds[base] = w.targetX
      const right = w.targetX + w.pixelWidth
      if (right > xBounds[base + 1]) xBounds[base + 1] = right
    }

    // Finalize
    for (let i = 0; i < count; i++) {
      const m = sentenceMetrics[i]
      if (m.minRow === Infinity) {
        // Empty sentence
        m.minRow = 0
        m.maxRow = 0
        m.centerX = 0
        m.centerRow = 0
      } else {
        m.centerRow = (m.minRow + m.maxRow) / 2
        const minX = xBounds[i * 2]
        const maxX = xBounds[i * 2 + 1]
        m.centerX = (minX + maxX) / 2
      }
    }
  }

  function updateWordCols() {
    // Check dirty flags
    if (!metricsDirty && 
        fontSize === lastFontSize && 
        fontFamily === lastFontFamily && 
        maxContentWidth === lastMaxWidth && 
        model === lastModel) {
      return
    }

    lastFontSize = fontSize
    lastFontFamily = fontFamily
    lastMaxWidth = maxContentWidth
    lastModel = model
    metricsDirty = false
    layoutUsesEstimatedWidths = false

    const t0 = performance.now()
    const words = visibleWords
    const blockW = Number.isFinite(metrics.maxCols) ? metrics.maxCols : Math.max(200, window.innerWidth)
    const fallbackW = Math.max(1, Math.min(blockW, 360))
    const fallbackH = Math.max(metrics.lineH, Math.round(fallbackW * 0.6))
    // Determine hot zone for updateWordCols
    let hotStart = 0
    let hotEnd = words.length
    
    // In full mode, only strict-measure the hot zone + buffer
    // In paragraph mode, measure everything (it's small)
    if (scope.mode === 'full') {
      const allowCacheEverywhere = widthWarmComplete
      const center = hoveredSentenceGlobal() ?? 0
      // Buffer: 50 sentences above/below (covers fast scroll)
      hotStart = 0 // Start from top for accurate line breaking? 
      // Actually, if we approximate the top, the row indices shift.
      // But our anchor logic (updatePanForSentence) should handle row shifts?
      // Yes, if we anchor to "Sentence 50", it stays on screen even if it moves from Row 500 to Row 505.
      // So we CAN approximate above.
      
      // Let's use a wide buffer: ±100 sentences
      hotStart = Math.max(0, center - 100)
      hotEnd = Math.min(sentenceCountInScope, center + 100)
      
      // Convert to word indices
      let hotWordStart = 0
      let hotWordEnd = words.length
      
      if (model.wordsBySentence[hotStart] && model.wordsBySentence[hotStart].length > 0) {
        hotWordStart = model.wordsBySentence[hotStart][0].tokenIndex
      }
      if (model.wordsBySentence[hotEnd] && model.wordsBySentence[hotEnd].length > 0) {
        const s = model.wordsBySentence[hotEnd]
        hotWordEnd = s[s.length - 1].tokenIndex + 1
      }
      
      // Clamp
      hotWordStart = Math.max(0, hotWordStart)
      hotWordEnd = Math.min(words.length, hotWordEnd)
      
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
        
        // If outside hot zone, approximate immediately (skip cache lookup/string creation)
        if (!allowCacheEverywhere && (i < hotWordStart || i >= hotWordEnd)) {
           layoutUsesEstimatedWidths = true
           // Approximation: Avg char width * length
           // We use metrics.charW (measured from 'a-z')
           const len = w.displayText.length
           let estimated = len * metrics.charW
           if (len > 0 && w.displayText.endsWith(' ')) {
             estimated = (len - 1) * metrics.charW + metrics.spaceW
           }
           w.pixelWidth = Number.isFinite(estimated) && estimated > 0 ? estimated : 1
           continue
        }

        const scaleSize = Math.max(1, Math.round(fontSize * w.baseScale))
        const fontKey = `${w.fontStyle}|${w.fontWeight}|${scaleSize}`
        const cacheKey = `${fontKey}|${w.displayText}`
        const cached = wordWidthCache.get(cacheKey)
        if (cached !== undefined && Number.isFinite(cached) && cached > 0) {
          w.pixelWidth = cached
          continue
        }

        // Cache miss & inside hot zone: measure and store
        let font = fontCache.get(fontKey)
        if (!font) {
          const stylePart = w.fontStyle === 'normal' ? '' : w.fontStyle
          const weightPart = w.fontWeight === 'normal' ? '' : w.fontWeight
          font = `${stylePart} ${weightPart} ${scaleSize}px ${fontFamily}`.replace(/\s+/g, ' ').trim()
          fontCache.set(fontKey, font)
        }
        ctx.font = font
        const fullWidth = ctx.measureText(w.displayText).width
        
        // Tighten spacing for headers: use unscaled space width (Space Locking)
        if (w.baseScale > 1.03 && w.displayText.endsWith(' ')) {
          const textWidth = ctx.measureText(w.displayText.trimEnd()).width
          // Lock space width to standard body size
          const width = textWidth + metrics.spaceW
          w.pixelWidth = Number.isFinite(width) && width > 0 ? width : 1
        } else {
          w.pixelWidth = Number.isFinite(fullWidth) && fullWidth > 0 ? fullWidth : 1
        }
        // LRU eviction: delete oldest when at capacity
        if (wordWidthCache.size >= WORD_WIDTH_CACHE_MAX) {
          const oldest = wordWidthCache.keys().next().value
          if (oldest !== undefined) wordWidthCache.delete(oldest)
        }
        wordWidthCache.set(cacheKey, w.pixelWidth)
      }
    } else {
      // Paragraph mode: existing simple loop
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
        const fullWidth = ctx.measureText(w.displayText).width
  
        // Tighten spacing for headers: use unscaled space width (Space Locking)
        if (w.baseScale > 1.03 && w.displayText.endsWith(' ')) {
          const textWidth = ctx.measureText(w.displayText.trimEnd()).width
          // Lock space width to standard body size
          w.pixelWidth = textWidth + metrics.spaceW
        } else {
          w.pixelWidth = fullWidth
        }
        // LRU eviction: delete oldest when at capacity
        if (wordWidthCache.size >= WORD_WIDTH_CACHE_MAX) {
          const oldest = wordWidthCache.keys().next().value
          if (oldest !== undefined) wordWidthCache.delete(oldest)
        }
        wordWidthCache.set(cacheKey, w.pixelWidth)
      }
    }

    if (debug && !warnedNonFiniteWidth) {
      for (let i = 0; i < Math.min(visibleWords.length, 200); i++) {
        const w = visibleWords[i]
        if (!Number.isFinite(w.pixelWidth) || w.pixelWidth <= 0) {
          warnedNonFiniteWidth = true
          console.warn('[engine] non-finite pixelWidth', {
            id: w.id,
            text: w.text,
            displayText: w.displayText,
            pixelWidth: w.pixelWidth,
            fontSize,
            fontFamily,
            fontString,
            maxCols: metrics.maxCols,
            lineH: metrics.lineH,
          })
          break
        }
      }
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

    // Scope changes can swap in words whose widths were never computed
    // (e.g. starting in split mode then switching to full). Force a width
    // update so layout doesn't fall back to 1px widths and overlap text.
    metricsDirty = true

    hoveredSentence = clampIndex(hoveredSentence, sentenceCountInScope)

    addPerfSample('applyScopeMs', performance.now() - t0)
  }

  /** Get words for a specific sentence */
  function getSentenceWords(sentenceIndex: number): Word[] {
    return model.wordsBySentence[sentenceIndex] || []
  }

  /** Get row bounds for a sentence (O(1) via wordsBySentence) */
  // Optimized O(1) version using pre-calculated metrics
  function getSentenceRowBounds(sentence: number): { minRow: number; maxRow: number } {
     const local = sentence - sentenceOffset
     if (local >= 0 && local < sentenceMetrics.length) {
       const m = sentenceMetrics[local]
       return { minRow: m.minRow, maxRow: m.maxRow }
     }

    // Fallback (should rarely happen if metrics are synced)
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
    getSentenceMetrics: (index: number) => {
      // Offset global index to local scope
      const local = index - sentenceOffset
      if (local < 0 || local >= sentenceMetrics.length) return null
      return sentenceMetrics[local] || null
    },
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
    get debug() { return debug },
    theme,
  }
  const { drawWord, drawWordPlain, drawWordRedactRect, wordUnder, beginFrame } = createRenderer(renderState)

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
    const availableWidth = Math.min(metrics.maxCols, window.innerWidth - 32)
    const { maxRow, maxX } = getContentBounds(words)
    const contentHeight = (maxRow + 1) * metrics.lineH + 32
    return contentHeight <= availableHeight && maxX <= availableWidth
  }

  function layoutForSettings(useAnchor: boolean) {
    if (!autoFont || visibleWords.length === 0) {
      layoutCurrentBeat(true, useAnchor)
      return
    }

    sentenceOnlyMode = false
    const anchor = useAnchor ? captureLayoutAnchor() : null
    const previousSize = fontSize

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

    fontSize = bestSize
    if (bestSize !== previousSize) resetWidthWarm()
    layoutCurrentBeat(true, useAnchor, anchor)
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
    layoutCurrentBeat(true, true)
  }

  function captureLayoutAnchor() {
    const sentence = hoveredSentenceGlobal()
    let anchorSentence = sentence
    let anchorScreenY: number | null = null
    if (sentence !== null) {
      const { minRow, maxRow } = getSentenceRowBounds(sentence)
      if (minRow !== Infinity) {
        anchorScreenY = metrics.padY + (minRow + maxRow + 1) / 2 * metrics.lineH + panY
      }
    } else {
      const centerWord = findWordNearestViewportCenter()
      if (centerWord !== null) {
        anchorSentence = centerWord.sentenceIndex
        anchorScreenY = metrics.padY + centerWord.targetY * metrics.lineH + panY
      }
    }
    return { anchorSentence, anchorScreenY, oldLineH: metrics.lineH, oldAnimPanY: animPanY, oldAnimPadY: animPadY }
  }

  function layoutCurrentBeat(invalidateLayout = true, useAnchor = false, anchor = useAnchor ? captureLayoutAnchor() : null) {
    const t0 = performance.now()
    const { anchorScreenY, anchorSentence, oldLineH, oldAnimPanY, oldAnimPadY } = anchor ??
      { anchorScreenY: null, anchorSentence: null, oldLineH: metrics.lineH, oldAnimPanY: animPanY, oldAnimPadY: animPadY }

    measureFont()
    
    // Warm cache: Synchronously measure hot zone (e.g., ±500 words or ±20 sentences)
    // Background task: Measure the rest
    
    // Determine hot zone
    let startSent = 0
    let endSent = sentenceCountInScope
    
    // If we have an anchor/hover, center around it
    const centerSent = hoveredSentenceGlobal() ?? 0
    // Buffer of ~20 sentences should cover >500 words
    startSent = Math.max(0, centerSent - 20)
    endSent = Math.min(sentenceCountInScope, centerSent + 30) // +30 to look ahead more
    
    preWarmWidthCache(startSent, endSent) 
    
    // Background warming: run once per font/model until complete
    if (invalidateLayout && !widthWarmComplete && !backgroundWarmTimer) {
      backgroundTaskVersion++
      scheduleBackgroundWarming(backgroundTaskVersion, 0)
    }

    updateWordCols()
    const { maxRow } = BEATS[beat].layout({ model, metrics, words: visibleWords, paragraphBreakRows })
    lastLayoutMaxRow = maxRow
    
    // Eagerly update sentence metrics
    updateSentenceMetrics()
    
    // Update vertical padding using cached maxRow (no re-scan)
    updateVerticalPadding()

    const lineHChanged = Math.abs(oldLineH - metrics.lineH) > 0.5

    // AFTER: Restore anchor position (stable focus), otherwise center
    if (anchorScreenY != null && anchorSentence != null) {
      const { minRow, maxRow } = getSentenceRowBounds(anchorSentence)
      if (minRow !== Infinity) {
        const newCenterRow = (minRow + maxRow + 1) / 2
        const newScreenY = metrics.padY + newCenterRow * metrics.lineH + panY
        panY -= (newScreenY - anchorScreenY)
      } else {
        updatePanForSentence()
      }
    } else {
      updatePanForSentence()
    }

    // Rebase animY: preserve on-screen position through metric changes.
    // For font-size reflows, keep the focused sentence stable and avoid
    // hard-to-follow horizontal shuffles by snapping X for non-focused words.
    if (useAnchor && oldLineH > 0 && metrics.lineH > 0) {
      const R = oldLineH / metrics.lineH
      const C = (oldAnimPadY + oldAnimPanY - metrics.padY - panY) / metrics.lineH
      const focusGlobal = hoveredSentenceGlobal()
      let focusCenterRow: number | null = null
      if (lineHChanged && focusGlobal != null) {
        const { minRow, maxRow } = getSentenceRowBounds(focusGlobal)
        if (minRow !== Infinity) focusCenterRow = (minRow + maxRow + 1) / 2
      }
      const REFLOW_ANIM_ROW_RADIUS = 14

      // C rebases words against the new camera. Commit both vertical offsets
      // now so a separate padding animation can't move the anchor again.
      animPadY = metrics.padY
      animPanY = panY
      if (lineHChanged) animPadX = metrics.padX

      for (let i = 0, len = visibleWords.length; i < len; i++) {
        const w = visibleWords[i]
        if (!lineHChanged) {
          w.animY = C + w.animY * R
          continue
        }

        if (focusGlobal != null && w.sentenceIndex === focusGlobal) {
          // Center sentence: snap (stable anchor)
          w.animX = w.targetX
          w.animY = w.targetY
          w.animScale = w.targetScale
          continue
        }

        // Reflow animation: vertical-only glide near focus; snap farther away.
        w.animX = w.targetX
        if (focusCenterRow != null && Math.abs(w.targetY - focusCenterRow) > REFLOW_ANIM_ROW_RADIUS) {
          w.animY = w.targetY
        } else {
          w.animY = C + w.animY * R
        }
        w.animScale = w.targetScale
      }
    }

    addPerfSample('layoutMs', performance.now() - t0)

    if (debug) {
      const words = visibleWords
      if (words.length > 200) {
        let minY = Infinity
        let maxY = -Infinity
        for (let i = 0; i < Math.min(words.length, 800); i++) {
          const y = words[i].targetY
          if (!Number.isFinite(y)) continue
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        if (minY !== Infinity && maxY !== -Infinity && maxY - minY < 2) {
          console.warn('[engine] suspiciously flat layout', { wordCount: words.length, minY, maxY })
        }
      }
    }

    // Throttle layout notifications for debug panel
    const now = performance.now()
    if (invalidateLayout && now - lastLayoutNotify > LAYOUT_NOTIFY_THROTTLE) {
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

  // Like snapToTargets(), but preserves camera animation (pad/pan).
  function snapWordsToTargets() {
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
    // Scope swaps change the visible word set; avoid words flying in from (0,0).
    // Keep camera (pad/pan) animatable unless caller explicitly requests snap.
    if (opts.snap) snapToTargets()
    else snapWordsToTargets()
    notifyStateChange()
    invalidate()
  }

  function setModel(nextModel: DocumentModel, _opts: { snap?: boolean } = {}) {
    prevAnimStart = prevAnimEnd = prevFocusStart = prevFocusEnd = 0
    model = nextModel
    renderState.model = model
    imageCache.clear()
    wordWidthCache.clear()
    resetWidthWarm()
    applyScope(scope)
    layoutCurrentBeat()
    // New model: previous anim positions are meaningless; avoid stacked frames.
    snapToTargets()
    notifyStateChange()
    invalidate()
  }

  function commit(update: EngineStateUpdate, opts: { snap?: boolean; useAnchor?: boolean } = {}) {
    let needsLayout = false
    let modelChanged = false
    let scopeChanged = false
    let shouldAnchor = false

    if (update.model && update.model !== model) {
      prevAnimStart = prevAnimEnd = prevFocusStart = prevFocusEnd = 0
      model = update.model
      renderState.model = model
      imageCache.clear()
      wordWidthCache.clear()
      resetWidthWarm()
      modelChanged = true
      needsLayout = true
    }

    if (update.fontFamily !== undefined && update.fontFamily !== fontFamily) {
      fontFamily = update.fontFamily || defaultFontFamily
      renderState.fontFamily = fontFamily
      wordWidthCache.clear()
      resetWidthWarm()
      needsLayout = true
      shouldAnchor = true
    }

    if (update.maxContentWidth !== undefined) {
      const raw = update.maxContentWidth
      const next = Number.isFinite(raw) ? Math.max(200, Math.min(4000, raw)) : maxContentWidth
      if (next !== maxContentWidth) {
        maxContentWidth = next
        needsLayout = true
        shouldAnchor = true
      }
    }

    if (update.fontSizing) {
      const fitting = update.fontSizing.kind === 'auto'
      if (fitting && !autoFont) {
        needsLayout = true
        shouldAnchor = true
      }
      autoFont = fitting
      if (update.fontSizing.kind === 'manual') {
        const next = clampFontSize(update.fontSizing.size)
        if (next !== fontSize) {
          fontSize = next
          wordWidthCache.clear()
          resetWidthWarm()
          needsLayout = true
          shouldAnchor = true
        }
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

    if (update.debug !== undefined && update.debug !== debug) {
      debug = update.debug
      invalidate()
    }

    if (update.scope && (modelChanged || !sameScope(scope, update.scope))) {
      prevAnimStart = prevAnimEnd = prevFocusStart = prevFocusEnd = 0
      applyScope(update.scope)
      needsLayout = true
      scopeChanged = true
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
    if (running) layoutForSettings(useAnchor)
    else layoutCurrentBeat(true, useAnchor)
    // New model: always snap. Scope changes: snap words but preserve camera animation.
    if (modelChanged || opts.snap) snapToTargets()
    else if (scopeChanged) snapWordsToTargets()
    notifyStateChange()
    invalidate()
  }

  // Cached maxRow from last applyTargets (avoids re-scan in measureFont)
  let lastLayoutMaxRow = 0

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

      // Jump Recovery: If word is vastly off-screen (stale animY), snap it immediately
      // This happens on fast scroll or "jump to bottom"
      const distY = Math.abs(w.targetY - w.animY)
      if (distY > 50) { // threshold: 50 lines
         w.animY = w.targetY
         w.animX = w.targetX
         w.animScale = w.targetScale
         active = true
         continue
      }

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

    const baseGap = fullFocusPush ? (scope.mode === 'full' ? 24 : 32) : 0

    if (sentenceIndex < hoveredGlobal) return -baseGap / 2
    if (sentenceIndex > hoveredGlobal) return baseGap / 2
    return 0
  }

  function stepFocus(dt: number): boolean {
    const k = -Math.expm1(LN_0_0001 * dt * focusSpeed)
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
    layoutForSettings(true)
    notifyStateChange()
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

    const wordAnim = stepWordAnimation(dt)
    const focusAnim = stepFocus(dt)
    const animating = wordAnim || focusAnim
    if (!needsRedraw && !animating) return
    needsRedraw = false

    clear()
    beginFrame()
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

    // Notify frame progress (for DOM syncing)
    if (onFrame) {
      const firstWord = model.words[0]
      if (firstWord) {
        const y = animPadY + firstWord.animY * metrics.lineH + animPanY
        onFrame(y)
      }
    }
  }

  function start(initialSentence?: number) {
    applyTheme()
    applyDPR()
    measureFont()

    // Set initial sentence before layout so panY is computed correctly
    if (initialSentence !== undefined && sentenceCountInScope > 0) {
      hoveredSentence = clampIndex(initialSentence, sentenceCountInScope)
    } else if (hoveredSentence === null && sentenceCountInScope > 0) {
      hoveredSentence = 0 // auto-focus first sentence
    }

    // init anim state to targets
    layoutForSettings(false)
    animPadY = metrics.padY
    animPadX = metrics.padX
    animPanY = panY
    for (const w of visibleWords) {
      w.animX = w.targetX
      w.animY = w.targetY
      w.animScale = w.targetScale
      w.focusDy = sentenceYOffset(w.sentenceIndex)
    }

    running = true
    needsRedraw = true
    notifyStateChange()
    requestFrame()
  }

  function setBeat(next: BeatId) {
    commit({ beat: next })
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
    const step = computeNextIndex(hoveredSentence, sentenceCountInScope)
    if (step.result === 'wrap') return 'wrap'
    hoveredSentence = step.index
    if (hoveredSentence > 0) updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  /** Returns 'wrap' if at start and should go to prev paragraph */
  function prevSentence(): 'ok' | 'wrap' {
    const step = computePrevIndex(hoveredSentence, sentenceCountInScope)
    if (step.result === 'wrap') return 'wrap'
    hoveredSentence = step.index
    if (hoveredSentence < sentenceCountInScope - 1) updatePanForSentence()
    if (sentenceOnlyMode) fitCurrentSentence()
    notifyStateChange()
    invalidate()
    return 'ok'
  }

  function goToLastSentence() {
    setSentence(computeLastIndex(sentenceCountInScope))
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
    commit({ maxContentWidth: w })
  }

  function getMaxWidth() {
    return maxContentWidth
  }

  function setFontSize(size: number) {
    commit({ fontSizing: { kind: 'manual', size } })
  }

  function setFontFamily(next?: string) {
    fontFamily = next || defaultFontFamily
    renderState.fontFamily = fontFamily
    wordWidthCache.clear()
    resetWidthWarm()
    layoutCurrentBeat(true, true)
  }

  function getFontSize() {
    return fontSize
  }

  function setBottomReserve(h: number) {
    commit({ bottomReserve: h })
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
    canvas,
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
    isSentenceOnlyMode: () => sentenceOnlyMode,
    getModel: () => model,
    getGlobalSentence: hoveredSentenceGlobal,
    setSentence,
    setFullFocusPush: (next: boolean) => { fullFocusPush = next },
    setSentenceFollowMode: (mode: 'center' | 'reveal') => { sentenceFollowMode = mode },
    setScope,
    setModel,
    commit,
    destroy,
    batch,
    getPerfMetrics: () => ({
      updateWordColsMs: getPerfAvg('updateWordColsMs'),
      applyScopeMs: getPerfAvg('applyScopeMs'),
      layoutMs: getPerfAvg('layoutMs'),
    }),
    set onStateChange(fn: typeof onStateChange) { onStateChange = fn },
    set onLayout(fn: typeof onLayout) { onLayout = fn },
    set onFrame(fn: typeof onFrame) { onFrame = fn },
  }
}
