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
  activeParagraphIndex$,
  controlsOpen$,
  activeTab$,
  markdownMode$,
  debug$,
  viewMode$,
  setViewMode,
  maxWidth$,
  fullPush$,
  fontSizing$,
  beat$,
  focusStyle$,
  moveSpeed$,
  panSpeed$,
  focusSpeed$,
  sentence$,
  globalSentence$,
  setReadingSentence,
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
import { activeEntry$ } from './state/library'

// Default monospace font (matches engine default)
export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

type Engine = ReturnType<typeof createEngine>

interface AppProps {
  engine: Engine
}

export function App({ engine }: AppProps) {
  const engineRef = useRef(engine)
  const initialScope = useRef<{
    entry: typeof activeEntry$.value
    model: typeof document$.value
    mode: typeof viewMode$.value
  } | null>({
    entry: activeEntry$.peek(),
    model: document$.peek(),
    mode: viewMode$.peek(),
  })

  // Input handling
  useEngineInput({
    canvas: engine.canvas,
    engineRef,
    nextParagraph: () => moveScopedParagraph(engineRef.current, 1),
    prevParagraph: () => moveScopedParagraph(engineRef.current, -1),
    jumpParagraph,
    restartReading,
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

  // Sync engine settings
  useSignalEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    // Commit layout properties
    engine.commit({
      debug: debug$.value,
      beat: beat$.value,
      fontSizing: fontSizing$.value,
      maxContentWidth: maxWidth$.value,
    })

    // Set runtime properties
    engine.setFocusStyle(focusStyle$.value)
    engine.setFullFocusPush(fullPush$.value)
    engine.setMoveSpeed(moveSpeed$.value)
    engine.setPanSpeed(panSpeed$.value)
    engine.setFocusSpeed(focusSpeed$.value)
  })

  // Sync scope with engine
  useSignalEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const entry = activeEntry$.value
    const model = document$.value
    const mode = viewMode$.value
    if (mode === 'paragraph') void currentPara$.value
    void markdownMode$.value
    const initial = initialScope.current
    initialScope.current = null
    if (initial?.entry === entry && initial.model === model && initial.mode === mode) return
    applyEngineScope(engine, { snap: true })
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
        current={(globalSentence$.value ?? -1) + 1}
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

  engine.batch(() => {
    if (view === 'full') {
      const breakRows = isMarkdown ? 2 : 1
      engine.commit({
        model: nextDoc,
        scope: { mode: 'full', paragraphBreakRows: breakRows },
        fontFamily,
      }, { snap })
      if (engine.getGlobalSentence() !== global) engine.setSentence(global, { snap })
      return
    }

    const offset = getSentenceOffset(counts, paragraphIndex)
    const sentenceCount = counts[paragraphIndex] ?? 0
    engine.commit({
      model: nextDoc,
      scope: { mode: 'paragraph', paragraphIndex, sentenceOffset: offset, sentenceCount },
      fontFamily,
    }, { snap })
    const local = global !== null && sentenceCount > 0
      ? Math.max(0, Math.min(sentenceCount - 1, global - offset))
      : null
    if (engine.getGlobalSentence() !== (local === null ? null : offset + local)) {
      engine.setSentence(local, { snap })
    }
  })
}

function restartReading(engine: Engine) {
  const firstSentence = document$.value.sentenceCount > 0 ? 0 : null
  batch(() => {
    setReadingSentence(firstSentence)
    if (viewMode$.value === 'paragraph' && firstSentence !== null) {
      const { paragraphIndex } = mapSentenceToParagraph(firstSentence, sentenceCounts$.value)
      if (currentPara$.value !== paragraphIndex) {
        currentPara$.value = paragraphIndex
        applyEngineScope(engine, { snap: false })
      }
    }
    engine.setSentence(firstSentence)
  })
}

function moveScopedParagraph(engine: Engine, direction: -1 | 1): boolean {
  if (viewMode$.value !== 'paragraph') return false
  const target = currentPara$.value + direction
  if (target < 0 || target >= sentenceCounts$.value.length) return false
  batch(() => {
    currentPara$.value = target
    applyEngineScope(engine, { snap: false })
  })
  return true
}

function jumpParagraph(engine: Engine, direction: -1 | 1) {
  if (viewMode$.value === 'paragraph') {
    moveScopedParagraph(engine, direction)
    return
  }
  const counts = sentenceCounts$.value
  for (let target = activeParagraphIndex$.value + direction; target >= 0 && target < counts.length; target += direction) {
    if (counts[target] > 0) {
      engine.setSentence(getSentenceOffset(counts, target))
      return
    }
  }
}

function toggleViewMode() {
  setViewMode(viewMode$.value === 'full' ? 'paragraph' : 'full')
}
