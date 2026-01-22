import { useEffect, useRef, useCallback } from 'preact/hooks'
import { useSignal, useComputed, useSignalEffect, batch, untracked } from '@preact/signals'
import { HUD } from './components/HUD'
import { InputPanel } from './components/InputPanel'
import { ReadIndicator, CenterIndicator } from './components/Indicator'
import { DebugPanel } from './components/DebugPanel'
import { createEngine } from './syntaxExploder/engine'
import { stripJinaPreamble, stripInlineMarkers } from './syntaxExploder/markdown'
import type { BeatId, FocusStyleId } from './syntaxExploder/experiments'
import {
  text$,
  currentPara$,
  inputMode$,
  hudCollapsed$,
  markdownMode$,
  debug$,
  inputTab$,
  viewMode$,
  extraOpen$,
  maxWidth$,
  fullPush$,
  beat$,
  focusStyle$,
  sentence$,
  globalSentence$,
  sentenceCount$,
  sentenceOnlyMode$,
  paragraphs$,
  baseParagraphs$,
  document$,
  sentenceCounts$,
  getSentenceOffset,
  mapSentenceToParagraph,
  isMobile,
  STORAGE_KEY,
  STORAGE_MARKDOWN_KEY,
  MOBILE_BOTTOM_RESERVE,
  READER_FONT,
} from './state/signals'

// Default monospace font (matches engine default)
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

interface AppProps {
  canvas: HTMLCanvasElement
}

export function App({ canvas }: AppProps) {
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null)
  const indicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const centerVisible$ = useSignal(false)

  // Local reactive values for HUD
  const fontSize$ = useSignal(20)
  const moveSpeed$ = useSignal(1)
  const panSpeed$ = useSignal(1)
  const focusSpeed$ = useSignal(1)

  // Initialize engine once
  useEffect(() => {
    const engine = createEngine({
      canvas,
      words: document$.value,
      fontFamily: markdownMode$.value ? READER_FONT : MONO_FONT,
      maxContentWidth: maxWidth$.value,
      pixelLayout: true,
    })

    engine.onStateChange = (b: BeatId, f: FocusStyleId, s: number | null, total: number, sOnly: boolean) => {
      batch(() => {
        beat$.value = b
        focusStyle$.value = f
        sentence$.value = s
        sentenceCount$.value = total
        sentenceOnlyMode$.value = sOnly
      })
    }

    engineRef.current = engine

    // Apply initial scope
    applyEngineScope(engine)

    if (isMobile()) {
      engine.setBottomReserve(MOBILE_BOTTOM_RESERVE)
      engine.setBeat('reader')
      engine.start()
      engine.autoFitFontSize()
    } else {
      engine.setBeat('reader')
      engine.start()
    }

    const stepNextSentence = () => {
      if (engine.nextSentence() === 'wrap') nextParagraph(engine)
    }

    const stepPrevSentence = () => {
      if (engine.prevSentence() === 'wrap') {
        if (prevParagraph(engine)) engine.goToLastSentence()
      }
    }

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      if (inputMode$.value) return

      const key = e.key.toLowerCase()
      if (key === '1') engine.setBeat('reader')
      else if (key === '2') engine.setBeat('ladder')
      // Arrow keys: spatial mapping (Up/Down = paragraphs, Left/Right = sentences)
      else if (e.key === 'ArrowDown' || key === 'j') stepNextSentence()
      else if (e.key === 'ArrowUp' || key === 'k') stepPrevSentence()
      else if (e.key === 'ArrowRight' || key === 'l') stepNextSentence()
      else if (e.key === 'ArrowLeft' || key === 'h') stepPrevSentence()
      else if (key === 'f') engine.cycleFocusStyle()
      else if (key === 'v') toggleViewMode()
      else if (key === 'r') {
        goToParagraph(0)
        if (viewMode$.value === 'full') {
          engine.setSentence(0)
        }
      }
      else if (key === 'i') { e.preventDefault(); openInput() }
      else if (e.key === 'Escape') hudCollapsed$.value = !hudCollapsed$.value
    }

    // Touch handlers for mobile
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX
        touchStartY = e.touches[0].clientY
        touchStartTime = Date.now()
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1) return
      const dx = e.changedTouches[0].clientX - touchStartX
      const dy = e.changedTouches[0].clientY - touchStartY
      const dt = Date.now() - touchStartTime
      if (dt > 300) return

      const absX = Math.abs(dx), absY = Math.abs(dy)
      if (absX < 50 && absY < 50) {
        hudCollapsed$.value = !hudCollapsed$.value
        return
      }

      if (absX > absY) {
        if (dx > 50) {
          if (prevParagraph(engine) && viewMode$.value === 'full') {
            engine.setSentence(getSentenceOffset(sentenceCounts$.value, currentPara$.value))
          }
        } else if (dx < -50) {
          if (nextParagraph(engine) && viewMode$.value === 'full') {
            engine.setSentence(getSentenceOffset(sentenceCounts$.value, currentPara$.value))
          }
        }
      } else {
        if (dy > 50) {
          if (engine.prevSentence() === 'wrap' && prevParagraph(engine)) engine.goToLastSentence()
        } else if (dy < -50) {
          if (engine.nextSentence() === 'wrap') nextParagraph(engine)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchend', handleTouchEnd)
      engine.destroy()
    }
  }, [canvas])

  // Sync fullPush with engine
  useSignalEffect(() => {
    engineRef.current?.setFullFocusPush(fullPush$.value)
  })

  // Sync scope with engine when document/view/markdown changes (snaps)
  useSignalEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    void document$.value
    void viewMode$.value
    void markdownMode$.value
    applyEngineScope(engine, { snap: true })
  })

  // Keep globalSentence in sync
  useSignalEffect(() => {
    const localSentence = sentence$.value
    if (localSentence == null) {
      globalSentence$.value = null
      return
    }
    if (viewMode$.value === 'full') {
      globalSentence$.value = localSentence
      return
    }
    const paraIndex = currentPara$.value
    const counts = sentenceCounts$.value
    const offset = getSentenceOffset(counts, paraIndex)
    globalSentence$.value = offset + localSentence
  })

  // Center indicator visibility
  useSignalEffect(() => {
    void sentence$.value
    void currentPara$.value
    centerVisible$.value = true
    if (indicatorTimeoutRef.current) clearTimeout(indicatorTimeoutRef.current)
    indicatorTimeoutRef.current = setTimeout(() => {
      centerVisible$.value = false
    }, 1200)
  })

  // Compute read indicator text
  const readText = useComputed(() => {
    const paras = paragraphs$.value
    const current = currentPara$.value
    if (viewMode$.value === 'full') return 'Full View'
    if (paras.length > 1) return `¶ ${current + 1}/${paras.length}`
    return ''
  })

  // Compute center indicator
  const centerText = useComputed(() => {
    const paraNum = currentPara$.value + 1
    const paraTotal = paragraphs$.value.length
    const sentNum = sentence$.value !== null ? sentence$.value + 1 : null
    const sentTotal = sentenceCount$.value
    const sOnly = sentenceOnlyMode$.value
    const isAtEnd = paraNum === paraTotal && sentNum === sentTotal

    if (isAtEnd) return '✓ end · r to restart'

    const parts: string[] = []
    if (paraTotal > 1) parts.push(`¶${paraNum}/${paraTotal}`)
    if (sentNum !== null) parts.push(sOnly ? `sentence ${sentNum}/${sentTotal}` : `${sentNum}/${sentTotal}`)
    return parts.join(' · ')
  })

  const isAtEnd = useComputed(() => {
    const paraNum = currentPara$.value + 1
    const paraTotal = paragraphs$.value.length
    const sentNum = sentence$.value !== null ? sentence$.value + 1 : null
    const sentTotal = sentenceCount$.value
    return paraNum === paraTotal && sentNum === sentTotal
  })

  // Debug panel data
  const debugData = useComputed(() => {
    const source = text$.value || ''
    const normalized = stripJinaPreamble(source)
    const baseParas = baseParagraphs$.value
    const viewParas = paragraphs$.value
    const idx = currentPara$.value
    const raw = baseParas[idx] || ''
    const viewPara = viewParas[idx] || ''
    const plain = stripInlineMarkers(viewPara)
    const gSent = globalSentence$.value
    const headings = baseParas.filter((p) => p.startsWith('# ') || p.startsWith('## '))
    const listItems = baseParas.filter((p) => /^-\s+/.test(p))
    const sourceFootnotes = normalized.match(/\[\^\d+\]/g) || []

    let paraId = 0
    let paraRange = '—'
    if (gSent !== null) {
      const words = document$.value.words
      const word = words.find((w) => w.sentenceIndex === gSent)
      if (word) paraId = word.paragraphIndex
      const matches = words.filter((w) => w.paragraphIndex === paraId)
      if (matches.length > 0) {
        const minRow = Math.min(...matches.map((w) => w.targetY))
        const maxRow = Math.max(...matches.map((w) => w.targetY))
        paraRange = `${minRow}-${maxRow}`
      }
    }

    return {
      mode: markdownMode$.value ? 'markdown' : 'plain',
      view: viewMode$.value,
      paraIndex: idx,
      paraTotal: baseParas.length,
      viewParaCount: viewParas.length,
      sentenceId: sentence$.value,
      globalSentence: gSent,
      paraId,
      paraRange,
      wordCount: document$.value.words.length,
      headingCount: headings.length,
      listCount: listItems.length,
      footnoteCount: sourceFootnotes.length,
      source,
      normalized,
      paragraph: raw,
      viewPara,
      plain,
      headings,
      listItems,
    }
  })

  // Handlers
  const handleBeatChange = useCallback((b: BeatId) => {
    engineRef.current?.setBeat(b)
  }, [])

  const handleFocusChange = useCallback((f: FocusStyleId) => {
    engineRef.current?.setFocusStyle(f)
  }, [])

  const handleViewChange = useCallback((v: 'full' | 'paragraph') => {
    setViewMode(v)
  }, [])

  const handleFontSizeChange = useCallback((size: number) => {
    fontSize$.value = size
    engineRef.current?.setFontSize(size)
  }, [])

  const handleMaxWidthChange = useCallback((w: number) => {
    maxWidth$.value = w
    engineRef.current?.setMaxWidth(w)
  }, [])

  const handleMoveSpeedChange = useCallback((s: number) => {
    moveSpeed$.value = s
    engineRef.current?.setMoveSpeed(s)
  }, [])

  const handlePanSpeedChange = useCallback((s: number) => {
    panSpeed$.value = s
    engineRef.current?.setPanSpeed(s)
  }, [])

  const handleFocusSpeedChange = useCallback((s: number) => {
    focusSpeed$.value = s
    engineRef.current?.setFocusSpeed(s)
  }, [])

  const handleLoadUrl = useCallback(async (url: string) => {
    const response = await fetch(`https://r.jina.ai/${url}`)
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Load failed: ${response.status} ${response.statusText}. ${errorText}`)
    }
    const raw = stripJinaPreamble((await response.text()).trim())
    if (!raw) throw new Error('No content returned.')
    localStorage.setItem(STORAGE_KEY, raw)
    localStorage.setItem(STORAGE_MARKDOWN_KEY, '1')
    batch(() => {
      text$.value = raw
      currentPara$.value = 0
      markdownMode$.value = true
    })
  }, [])

  const handleSubmitText = useCallback((newText: string) => {
    localStorage.setItem(STORAGE_KEY, newText)
    localStorage.setItem(STORAGE_MARKDOWN_KEY, '0')
    batch(() => {
      text$.value = newText
      currentPara$.value = 0
      markdownMode$.value = false
    })
  }, [])

  return (
    <>
      <ReadIndicator text={readText.value} />

      <HUD
        beat={beat$.value}
        focusStyle={focusStyle$.value}
        viewMode={viewMode$.value}
        fontSize={fontSize$.value}
        maxWidth={maxWidth$.value}
        extraOpen={extraOpen$.value}
        debug={debug$.value}
        fullPush={fullPush$.value}
        moveSpeed={moveSpeed$.value}
        panSpeed={panSpeed$.value}
        focusSpeed={focusSpeed$.value}
        hidden={hudCollapsed$.value}
        onBeatChange={handleBeatChange}
        onFocusChange={handleFocusChange}
        onViewChange={handleViewChange}
        onFontSizeChange={handleFontSizeChange}
        onMaxWidthChange={handleMaxWidthChange}
        onExtraToggle={() => { extraOpen$.value = !extraOpen$.value }}
        onDebugToggle={() => { debug$.value = !debug$.value }}
        onFullPushToggle={() => { fullPush$.value = !fullPush$.value }}
        onMoveSpeedChange={handleMoveSpeedChange}
        onPanSpeedChange={handlePanSpeedChange}
        onFocusSpeedChange={handleFocusSpeedChange}
        onInputOpen={openInput}
      />

      <InputPanel
        open={inputMode$.value}
        tab={inputTab$.value}
        onTabChange={(t) => { inputTab$.value = t }}
        onClose={() => { inputMode$.value = false }}
        onLoadUrl={handleLoadUrl}
        onSubmitText={handleSubmitText}
      />

      <CenterIndicator
        text={centerText.value}
        visible={centerVisible$.value}
        atEnd={isAtEnd.value}
      />

      <DebugPanel active={debug$.value} data={debugData.value} />
    </>
  )
}

// Helper functions
function applyEngineScope(engine: ReturnType<typeof createEngine>, opts: { snap?: boolean } = { snap: true }) {
  const counts = sentenceCounts$.value
  const paragraphIndex = currentPara$.value
  const view = viewMode$.value
  const isMarkdown = markdownMode$.value
  const nextDoc = document$.value
  // Use untracked to avoid creating dependency on sentence state
  const global = untracked(() => globalSentence$.value)
  const fontFamily = isMarkdown ? READER_FONT : MONO_FONT
  const snap = opts.snap ?? true

  if (view === 'full') {
    const breakRows = isMarkdown ? 2 : 1
    engine.commit({
      model: nextDoc,
      scope: { mode: 'full', paragraphBreakRows: breakRows },
      fontFamily,
    }, { snap })
    if (global != null) {
      const currentLocal = untracked(() => sentence$.value)
      if (currentLocal !== global) engine.setSentence(global, { snap })
    }
    if (isMobile()) engine.autoFitFontSize()
    return
  }

  const offset = getSentenceOffset(counts, paragraphIndex)
  const sentenceCount = counts[paragraphIndex] ?? 0
  engine.commit({
    model: nextDoc,
    scope: { mode: 'paragraph', paragraphIndex, sentenceOffset: offset, sentenceCount },
    fontFamily,
  }, { snap })
  if (global != null && sentenceCount > 0) {
    const local = Math.max(0, Math.min(sentenceCount - 1, global - offset))
    const currentLocal = untracked(() => sentence$.value)
    if (currentLocal !== local) engine.setSentence(local, { snap })
  }
  if (isMobile()) engine.autoFitFontSize()
}

function goToParagraph(index: number) {
  const paras = baseParagraphs$.value
  if (index < 0 || index >= paras.length) return
  currentPara$.value = index
}

function nextParagraph(engine?: ReturnType<typeof createEngine>): boolean {
  const paras = baseParagraphs$.value
  if (currentPara$.value < paras.length - 1) {
    currentPara$.value++
    if (engine && viewMode$.value === 'paragraph') {
      applyEngineScope(engine, { snap: false })
    }
    return true
  }
  return false
}

function prevParagraph(engine?: ReturnType<typeof createEngine>): boolean {
  if (currentPara$.value > 0) {
    currentPara$.value--
    if (engine && viewMode$.value === 'paragraph') {
      applyEngineScope(engine, { snap: false })
    }
    return true
  }
  return false
}

function setViewMode(nextMode: 'full' | 'paragraph') {
  const counts = sentenceCounts$.value
  const global = globalSentence$.value
  let nextParaIndex = currentPara$.value

  if (nextMode === 'full') {
    nextParaIndex = 0
  } else if (global != null) {
    nextParaIndex = mapSentenceToParagraph(global, counts).paragraphIndex
  }

  batch(() => {
    viewMode$.value = nextMode
    currentPara$.value = nextParaIndex
  })
}

function toggleViewMode() {
  setViewMode(viewMode$.value === 'full' ? 'paragraph' : 'full')
}

function openInput() {
  inputMode$.value = true
  inputTab$.value = 'url'
}
