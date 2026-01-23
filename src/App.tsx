import { useRef } from 'preact/hooks'
import { useComputed, useSignalEffect, batch, untracked } from '@preact/signals'
import { ControlPanel } from './components/ControlPanel'
import { CenterIndicator } from './components/Indicator'
import { DebugPanel } from './components/DebugPanel'
import { ArticleHeader } from './components/ArticleHeader'
import { PasteToast } from './components/PasteToast'
import { createEngine } from './syntaxExploder/engine'
import { stripJinaPreamble, stripInlineMarkers } from './syntaxExploder/document'
import {
  text$,
  currentPara$,
  controlsOpen$,
  activeTab$,
  markdownMode$,
  debug$,
  viewMode$,
  maxWidth$,
  fullPush$,
  isAutoFont$,
  beat$,
  focusStyle$,
  moveSpeed$,
  panSpeed$,
  focusSpeed$,
  sentence$,
  globalSentence$,
  layoutVersion$,
  fontSize$,
  paragraphs$,
  baseParagraphs$,
  document$,
  sentenceCounts$,
  getSentenceOffset,
  mapSentenceToParagraph,
  READER_FONT,
} from './state/signals'
import { useEngineInput } from './hooks/useEngineInput'

// Default monospace font (matches engine default)
export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

type Engine = ReturnType<typeof createEngine>

interface AppProps {
  engine: Engine
}

export function App({ engine }: AppProps) {
  const engineRef = useRef(engine)
  const skipInitialSync = useRef(true)

  // Input handling
  useEngineInput({
    canvas: engine.canvas,
    engineRef,
    fontSize$,
    nextParagraph: () => nextParagraph(engineRef.current ?? undefined),
    prevParagraph: () => prevParagraph(engineRef.current ?? undefined),
    goToParagraph,
    toggleViewMode,
    openInput: () => {
      batch(() => {
        if (controlsOpen$.value) {
          controlsOpen$.value = false
        } else {
          controlsOpen$.value = true
          activeTab$.value = 'library'
        }
      })
    },
  })

  // Sync fullPush with engine
  useSignalEffect(() => {
    engineRef.current?.setFullFocusPush(fullPush$.value)
  })

  // Sync debug with engine
  useSignalEffect(() => {
    engineRef.current?.commit({ debug: debug$.value })
  })

  // Sync motion speeds with engine
  useSignalEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setMoveSpeed(moveSpeed$.value)
    engine.setPanSpeed(panSpeed$.value)
    engine.setFocusSpeed(focusSpeed$.value)
  })

  // Sync beat with engine
  useSignalEffect(() => {
    engineRef.current?.setBeat(beat$.value)
  })

  // Sync focus style with engine
  useSignalEffect(() => {
    engineRef.current?.setFocusStyle(focusStyle$.value)
  })

  // Sync font size with engine
  useSignalEffect(() => {
    engineRef.current?.setFontSize(fontSize$.value)
  })

  // Sync max width with engine
  useSignalEffect(() => {
    engineRef.current?.setMaxWidth(maxWidth$.value)
  })

  // Sync scope with engine
  useSignalEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    void document$.value
    void viewMode$.value
    void markdownMode$.value
    if (skipInitialSync.current) {
      skipInitialSync.current = false
      return
    }
    applyEngineScope(engine, { snap: true })
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

  const debugData = useComputed(() => {
    void layoutVersion$.value
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
      perfMetrics: engineRef.current?.getPerfMetrics(),
      fontSize: fontSize$.value,
    }
  })

  return (
    <>
      <CenterIndicator
        atEnd={isAtEnd.value}
        current={(globalSentence$.value ?? 0) + 1}
        total={document$.value.sentenceCount}
      />
      <ArticleHeader />
      <ControlPanel />
      {debug$.value && <DebugPanel active data={debugData.value} />}
      <PasteToast />
    </>
  )
}

export function applyEngineScope(engine: Engine, opts: { snap?: boolean } = { snap: true }) {
  const counts = sentenceCounts$.value
  const paragraphIndex = currentPara$.value
  const view = viewMode$.value
  const isMarkdown = markdownMode$.value
  const nextDoc = document$.value
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

function nextParagraph(engine?: Engine): boolean {
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

function prevParagraph(engine?: Engine): boolean {
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
