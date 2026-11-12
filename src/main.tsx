import './index.css'
import { render } from 'preact'
import { batch } from '@preact/signals'
import { App, applyEngineScope, MONO_FONT } from './App'
import { fetchUrlToEntry, getBootUrl } from './state/library'
import { createEngine } from './syntaxExploder/engine'
import type { BeatId, FocusStyleId } from './syntaxExploder/experiments'
import {
  viewMode$,
  markdownMode$,
  maxWidth$,
  fontSizing$,
  fittedFontSize$,
  beat$,
  focusStyle$,
  sentence$,
  sentenceCount$,
  sentenceOnlyMode$,
  layoutVersion$,
  moveSpeed$,
  panSpeed$,
  focusSpeed$,
  fullPush$,
  document$,
  globalSentence$,
  setReadingSentence,
  firstWordY$,
  sentenceCounts$,
  mapSentenceToParagraph,
  flushPrefs,
  isMobile,
  liteMode$,
  READER_FONT,
} from './state/signals'
import { LiteApp } from './lite/LiteApp'

window.addEventListener('pagehide', flushPrefs)

const bootUrl = getBootUrl(location)
if (bootUrl) {
  fetchUrlToEntry(bootUrl, { showLoading: true }).catch(console.error)
  // Keep the URL in the address bar for shareability
}

const root = document.querySelector<HTMLDivElement>('#app')!
const isLite = isMobile() && liteMode$.value

if (isLite) {
  // --- Lite mode: DOM-only, no canvas/engine ---
  const uiContainer = document.createElement('div')
  uiContainer.id = 'ui'
  root.appendChild(uiContainer)

  render(
    <LiteApp />,
    uiContainer
  )
} else {
  // --- Canvas mode ---
  const canvas = document.createElement('canvas')
  canvas.id = 'canv'
  root.appendChild(canvas)

  // Capture persisted values before engine init can overwrite signals
  const initBeat = beat$.value
  const initFocusStyle = focusStyle$.value

  const engine = createEngine({
    canvas,
    words: document$.value,
    fontFamily: markdownMode$.value ? READER_FONT : MONO_FONT,
    maxContentWidth: maxWidth$.value,
    fontSizing: fontSizing$.value,
  })

  engine.onLayout = () => {
    layoutVersion$.value++
  }

  engine.onFrame = (y) => {
    firstWordY$.value = y
  }

  // Apply initial scope (after viewMode/para are set)
  if (isMobile()) {
    viewMode$.value = 'paragraph'
  }
  const initialSentence = globalSentence$.value
  const localSentence = initialSentence !== null && viewMode$.value === 'paragraph'
    ? mapSentenceToParagraph(initialSentence, sentenceCounts$.value).localSentence
    : initialSentence
  applyEngineScope(engine)

  // Connect state change callback before start()
  engine.onStateChange = (b: BeatId, f: FocusStyleId, s: number | null, total: number, sOnly: boolean) => {
    batch(() => {
      beat$.value = b
      focusStyle$.value = f
      sentence$.value = s
      sentenceCount$.value = total
      sentenceOnlyMode$.value = sOnly
      fittedFontSize$.value = engine.getFontSize()
      if (engine.getModel() === document$.peek()) setReadingSentence(engine.getGlobalSentence())
    })
  }

  if (isMobile()) {
    engine.setSentenceFollowMode('reveal')
    engine.setBeat(initBeat)
    engine.setFocusStyle(initFocusStyle)
  } else {
    engine.setBeat(initBeat)
    engine.setFocusStyle(initFocusStyle)
    engine.setMoveSpeed(moveSpeed$.value)
    engine.setPanSpeed(panSpeed$.value)
    engine.setFocusSpeed(focusSpeed$.value)
    engine.setFullFocusPush(fullPush$.value)
  }
  engine.start(localSentence ?? undefined)

  // --- Preact render ---
  const uiContainer = document.createElement('div')
  uiContainer.id = 'ui'
  root.appendChild(uiContainer)

  render(
    <App engine={engine} />,
    uiContainer
  )

  // HMR cleanup
  if (import.meta.hot) {
    import.meta.hot.dispose(() => engine.destroy())
  }
}
