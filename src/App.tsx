import { useEffect, useRef, useCallback } from 'preact/hooks'
import { useSignal, useComputed, useSignalEffect, batch, untracked } from '@preact/signals'
import { HUD } from './components/HUD'
import { InputPanel } from './components/InputPanel'
import { CenterIndicator } from './components/Indicator'
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
  READER_FONT,
} from './state/signals'

// Default monospace font (matches engine default)
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

interface AppProps {
  canvas: HTMLCanvasElement
}

export function App({ canvas }: AppProps) {
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null)

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

    const stepByDelta = (deltaY: number, acc: { value: number }, threshold: number) => {
      acc.value += deltaY
      while (acc.value >= threshold) {
        stepNextSentence()
        acc.value -= threshold
      }
      while (acc.value <= -threshold) {
        stepPrevSentence()
        acc.value += threshold
      }
    }

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      if (inputMode$.value) return
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return
      }

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

    // Wheel/trackpad: scroll scrubs sentences
    const wheelAccum = { value: 0 }
    const handleWheel = (e: WheelEvent) => {
      if (inputMode$.value) return
      if (Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      stepByDelta(e.deltaY, wheelAccum, 60)
    }

    // Touch handlers for mobile
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0
    let touchMode: 'tap' | 'scrub' | 'none' = 'none'
    let touchLastY = 0
    const touchAccum = { value: 0 }
    const getTouchCenterY = (touches: TouchList) => {
      if (touches.length === 0) return 0
      if (touches.length === 1) return touches[0].clientY
      return (touches[0].clientY + touches[1].clientY) / 2
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX
        touchStartY = e.touches[0].clientY
        touchStartTime = Date.now()
        touchMode = 'tap'
      } else if (e.touches.length === 2) {
        touchMode = 'scrub'
        touchLastY = getTouchCenterY(e.touches)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touchMode !== 'scrub' || e.touches.length < 2) return
      e.preventDefault()
      const currentY = getTouchCenterY(e.touches)
      const delta = touchLastY - currentY
      touchLastY = currentY
      if (Math.abs(delta) < 0.5) return
      stepByDelta(delta, touchAccum, 120)
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchMode !== 'tap') {
        touchMode = 'none'
        return
      }
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
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
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

  const isAtEnd = useComputed(() => {
    const total = document$.value.sentenceCount
    const global = globalSentence$.value
    if (total <= 0 || global == null) return false
    return global >= total - 1
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
        inputOpen={inputMode$.value}
        onCollapseToggle={() => { hudCollapsed$.value = !hudCollapsed$.value }}
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

      <CenterIndicator atEnd={isAtEnd.value} />

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
  if (inputMode$.value) {
    inputMode$.value = false
    const active = document.activeElement as HTMLElement | null
    active?.blur()
    return
  }
  inputMode$.value = true
  inputTab$.value = 'url'
}
