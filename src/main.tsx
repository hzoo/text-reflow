import './index.css'
import { render } from 'preact'
import { batch } from '@preact/signals'
import { App, applyEngineScope, MONO_FONT } from './App'
import { Agentation } from 'agentation'
import { fetchUrlToEntry, addEntry } from './state/library'
import { createEngine } from './syntaxExploder/engine'
import type { BeatId, FocusStyleId } from './syntaxExploder/experiments'
import {
  currentPara$,
  viewMode$,
  markdownMode$,
  maxWidth$,
  isAutoFont$,
  beat$,
  focusStyle$,
  sentence$,
  sentenceCount$,
  sentenceOnlyMode$,
  layoutVersion$,
  fontSize$,
  moveSpeed$,
  panSpeed$,
  focusSpeed$,
  fullPush$,
  document$,
  sentenceCounts$,
  mapSentenceToParagraph,
  prefs,
  isMobile,
  READER_FONT,
} from './state/signals'

// URL param ingest: ?url= or ?text=
const params = new URLSearchParams(location.search)
const paramUrl = params.get('url')
const paramText = params.get('text')
if (paramUrl) {
  fetchUrlToEntry(paramUrl).catch(() => {})
  history.replaceState(null, '', location.pathname)
} else if (paramText) {
  addEntry({ content: paramText, isMarkdown: false })
  history.replaceState(null, '', location.pathname)
}

const root = document.querySelector<HTMLDivElement>('#app')!

// Create canvas outside Preact tree to prevent unmounting
const canvas = document.createElement('canvas')
canvas.id = 'canv'
root.appendChild(canvas)

// --- Engine init (before Preact render) ---

// Capture persisted values before engine init can overwrite signals
const initBeat = beat$.value
const initFocusStyle = focusStyle$.value
const initFontSize = fontSize$.value

const engine = createEngine({
  canvas,
  words: document$.value,
  fontFamily: markdownMode$.value ? READER_FONT : MONO_FONT,
  maxContentWidth: maxWidth$.value,
})

engine.onLayout = () => {
  layoutVersion$.value++
}

// Compute initial sentence from saved prefs
const totalSentences = document$.value.sentenceCount
let initSentence: number | undefined
if (prefs.sentence > 0 && totalSentences > 0) {
  const target = Math.min(prefs.sentence, totalSentences - 1)
  if (isMobile() || viewMode$.value === 'paragraph') {
    const counts = sentenceCounts$.value
    const { paragraphIndex, localSentence } = mapSentenceToParagraph(target, counts)
    currentPara$.value = paragraphIndex
    viewMode$.value = 'paragraph'
    initSentence = localSentence
  } else {
    initSentence = target
  }
}

// Apply initial scope (after viewMode/para are set)
if (isMobile()) {
  viewMode$.value = 'paragraph'
}
applyEngineScope(engine)

// Connect state change callback before start()
engine.onStateChange = (b: BeatId, f: FocusStyleId, s: number | null, total: number, sOnly: boolean) => {
  batch(() => {
    beat$.value = b
    focusStyle$.value = f
    sentence$.value = s
    sentenceCount$.value = total
    sentenceOnlyMode$.value = sOnly
  })
}

if (isMobile()) {
  isAutoFont$.value = true
  engine.setSentenceFollowMode('reveal')
  engine.setBeat(initBeat)
  engine.setFocusStyle(initFocusStyle)
  engine.start(initSentence)
  engine.autoFitFontSize()
  fontSize$.value = engine.getFontSize()
} else {
  engine.setFontSize(initFontSize)
  engine.setBeat(initBeat)
  engine.setFocusStyle(initFocusStyle)
  engine.setMoveSpeed(moveSpeed$.value)
  engine.setPanSpeed(panSpeed$.value)
  engine.setFocusSpeed(focusSpeed$.value)
  engine.setFullFocusPush(fullPush$.value)
  engine.start(initSentence)
}

// --- Preact render ---

const uiContainer = document.createElement('div')
uiContainer.id = 'ui'
root.appendChild(uiContainer)

render(
  <>
    <App engine={engine} />
    {import.meta.env.DEV && <Agentation />}
  </>,
  uiContainer
)

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.destroy())
}
