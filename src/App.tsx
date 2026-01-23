import { useRef, useCallback } from 'preact/hooks'
import { useComputed, useSignalEffect, batch, untracked } from '@preact/signals'
import { HUD } from './components/HUD'
import { InputPanel } from './components/InputPanel'
import { CenterIndicator } from './components/Indicator'
import { DebugPanel } from './components/DebugPanel'
import { PasteToast } from './components/PasteToast'
import { createEngine } from './syntaxExploder/engine'
import { stripJinaPreamble, stripInlineMarkers } from './syntaxExploder/document'
import type { BeatId, FocusStyleId } from './syntaxExploder/experiments'
import { addEntry, fetchUrlToEntry } from './state/library'
import { useEngineInput } from './hooks/useEngineInput'
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
  isAutoFont$,
  beat$,
  focusStyle$,
  sentence$,
  globalSentence$,
  layoutVersion$,
  fontSize$,
  moveSpeed$,
  panSpeed$,
  focusSpeed$,
  paragraphs$,
  baseParagraphs$,
  document$,
  sentenceCounts$,
  getSentenceOffset,
  mapSentenceToParagraph,
  READER_FONT,
} from './state/signals'

// Default monospace font (matches engine default)
export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

type Engine = ReturnType<typeof createEngine>

interface AppProps {
  engine: Engine
}

export function App({ engine }: AppProps) {
  const engineRef = useRef(engine)
  const skipInitialSync = useRef(true)

  // Input handling (keyboard, wheel, touch, paste, drag/drop)
  useEngineInput({
    canvas: engine.canvas,
    engineRef,
    fontSize$,
    nextParagraph: () => nextParagraph(engineRef.current ?? undefined),
    prevParagraph: () => prevParagraph(engineRef.current ?? undefined),
    goToParagraph,
    toggleViewMode,
    openInput,
  })

  // Sync fullPush with engine
  useSignalEffect(() => {
    engineRef.current?.setFullFocusPush(fullPush$.value)
  })

  // Sync scope with engine when document/view/markdown changes (snaps)
  useSignalEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    // Read signals to establish subscriptions
    void document$.value
    void viewMode$.value
    void markdownMode$.value
    // Skip the initial fire — engine.start() already positioned everything
    if (skipInitialSync.current) {
      skipInitialSync.current = false
      return
    }
    applyEngineScope(engine, { snap: true })
    // Re-fit font if auto mode is on
    if (isAutoFont$.value) {
      engine.autoFitFontSize()
      fontSize$.value = engine.getFontSize()
    }
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
    void layoutVersion$.value // Force re-eval on layout
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

    const perfMetrics = engineRef.current?.getPerfMetrics()

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
      perfMetrics,
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
    isAutoFont$.value = false
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

  const handleAutoFont = useCallback(() => {
    isAutoFont$.value = !isAutoFont$.value
    if (isAutoFont$.value && engineRef.current) {
      engineRef.current.autoFitFontSize()
      fontSize$.value = engineRef.current.getFontSize()
    }
  }, [])

  const handleLoadUrl = useCallback(async (url: string) => {
    await fetchUrlToEntry(url)
  }, [])

  const handleSubmitText = useCallback((newText: string) => {
    addEntry({ content: newText, isMarkdown: false })
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
        isAutoFont={isAutoFont$.value}
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
        onAutoFont={handleAutoFont}
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
        atEnd={isAtEnd.value}
        current={(globalSentence$.value ?? 0) + 1}
        total={document$.value.sentenceCount}
      />

      {debug$.value && <DebugPanel active data={debugData.value} />}
      <PasteToast />
    </>
  )
}

// Helper functions
export function applyEngineScope(engine: Engine, opts: { snap?: boolean } = { snap: true }) {
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
