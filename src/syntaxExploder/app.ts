import { signal, computed, effect, batch, untracked } from '@preact/signals-core'
import { createWords, createWordsMarkdown, splitParagraphs, DEFAULT_TEXT } from './model'
import { type BeatId, BEATS, type FocusStyleId } from './experiments'
import { createEngine } from './engine'
import { markdownToParagraphs, markdownToReadingText, stripInlineMarkers, stripJinaPreamble } from './markdown'

// SVG icons for layout buttons
const LAYOUT_ICONS: Record<BeatId, { svg: string; label: string }> = {
  reader: {
    label: 'Reader',
    svg: `<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h12M4 18h8"/></svg>`,
  },
  ladder: {
    label: 'Ladder',
    svg: `<svg viewBox="0 0 24 24"><path d="M4 6h10M8 10h12M4 14h10M8 18h12"/></svg>`,
  },
}

const FOCUS_LABELS: Record<FocusStyleId, string> = {
  gray: 'Dim',
  redact: 'Hide',
  none: 'Off',
}

const STORAGE_KEY = 'reflow-text'
const STORAGE_MARKDOWN_KEY = 'reflow-markdown'
const DEFAULT_WIDTH = 800
const READER_WIDTH = 680
const MOBILE_BOTTOM_RESERVE = 60
const isMobile = () => window.innerWidth <= 600
const READER_FONT = '"Iowan Old Style", "Palatino", "Book Antiqua", "Georgia", serif'

export function start(root: HTMLElement) {
  root.innerHTML = ''

  // ═══════════════════════════════════════════════════════════
  // Signals
  // ═══════════════════════════════════════════════════════════

  const savedText = localStorage.getItem(STORAGE_KEY)
  const savedMarkdown = localStorage.getItem(STORAGE_MARKDOWN_KEY)
  const text$ = signal(savedText || DEFAULT_TEXT)
  const currentPara$ = signal(0)
  const inputMode$ = signal(false)
  const hudCollapsed$ = signal(isMobile())
  const initialMarkdown = savedMarkdown === '1' || looksLikeMarkdown(savedText || '')
  if (initialMarkdown) localStorage.setItem(STORAGE_MARKDOWN_KEY, '1')
  const markdownMode$ = signal(initialMarkdown)
  const debug$ = signal(Boolean((window as any).__reflowDebug))
  const viewMode$ = signal<'paragraph' | 'full'>('paragraph')
  const extraOpen$ = signal(false)
  const maxWidth$ = signal(initialMarkdown ? READER_WIDTH : DEFAULT_WIDTH)
  const moveSpeed$ = signal(1)
  const panSpeed$ = signal(1)
  const focusSpeed$ = signal(1)

  // Engine state (from engine callbacks)
  const beat$ = signal<BeatId>('reader')
  const focusStyle$ = signal<FocusStyleId>('gray')
  const sentence$ = signal<number | null>(0)
  const globalSentence$ = signal<number | null>(0)
  const sentenceCount$ = signal(1)
  const sentenceOnlyMode$ = signal(false)

  // Derived
  const fullText$ = computed(() => markdownMode$.value
    ? markdownToReadingText(text$.value)
    : text$.value)
  const baseParagraphs$ = computed(() => markdownMode$.value
    ? markdownToParagraphs(text$.value)
    : splitParagraphs(text$.value))
  const paragraphs$ = computed(() => {
    if (viewMode$.value === 'full') {
      const full = fullText$.value.trim()
      return full ? [full] : []
    }
    const rawParas = baseParagraphs$.value
    return rawParas.map(p => p.trim()).filter(Boolean)
  })
  const currentParaText$ = computed(() => paragraphs$.value[currentPara$.value] || '')
  const words$ = computed(() => markdownMode$.value
    ? createWordsMarkdown(currentParaText$.value)
    : createWords(currentParaText$.value))
  const sentenceCounts$ = computed(() => getSentenceCounts(baseParagraphs$.value, markdownMode$.value))

  // ═══════════════════════════════════════════════════════════
  // DOM Setup
  // ═══════════════════════════════════════════════════════════

  const canvas = document.createElement('canvas')
  canvas.id = 'canv'
  root.appendChild(canvas)

  const hud = document.createElement('div')
  hud.id = 'hud'
  hud.innerHTML = `
    <div class="hud-handle"></div>
    <div class="hud-progress">
      <div class="progress-dots" id="progress-dots"></div>
      <span class="para-label" id="para-label"></span>
    </div>
    <div class="layout-picker" id="layout-picker">
      ${(Object.keys(LAYOUT_ICONS) as BeatId[])
        .map(id => `<button class="layout-btn" data-beat="${id}" title="${LAYOUT_ICONS[id].label}">${LAYOUT_ICONS[id].svg}</button>`)
        .join('')}
    </div>
    <div class="focus-picker" id="focus-picker">
      <button class="focus-btn" id="focus-toggle" type="button">Dim</button>
    </div>
    <div class="hud-scrubbers">
      <span class="scrub-row">A <span class="scrub" id="size-scrub" data-min="12" data-max="48" data-step="1">20</span></span>
      <span class="scrub-row">· W <span class="scrub" id="width-scrub" data-min="300" data-max="1200" data-step="50">800</span></span>
    </div>
    <div class="hud-keys">
      <span>↑↓ nav · ←→ para · v view · f focus · esc hide</span>
      <div class="hud-toggles">
        <button class="hud-toggle" id="more-toggle" type="button">⋯</button>
      </div>
    </div>
    <div class="hud-extra" id="hud-extra">
      <button class="hud-toggle" id="view-toggle" type="button">Full</button>
      <button class="hud-toggle" id="debug-toggle" type="button">Debug</button>
      <div class="hud-speeds">
        <span class="scrub-row">Mv <span class="scrub" id="move-scrub" data-min="0.5" data-max="2" data-step="0.1">1</span></span>
        <span class="scrub-row">Pn <span class="scrub" id="pan-scrub" data-min="0.5" data-max="2" data-step="0.1">1</span></span>
        <span class="scrub-row">Fc <span class="scrub" id="focus-scrub" data-min="0.5" data-max="2" data-step="0.1">1</span></span>
      </div>
    </div>
  `
  root.appendChild(hud)

  const inputPanel = document.createElement('div')
  inputPanel.id = 'input-panel'
  inputPanel.innerHTML = `
    <div class="url-row">
      <input id="url-input" type="url" placeholder="paste a url..." autocomplete="off" />
      <button id="url-load" type="button">Load</button>
    </div>
    <div class="url-status" id="url-status"></div>
    <textarea id="text-input" placeholder="paste or type text..."></textarea>
    <div class="input-hint">Esc to render · Cmd+Enter to render</div>
  `
  root.appendChild(inputPanel)

  const centerIndicator = document.createElement('div')
  centerIndicator.id = 'center-indicator'
  root.appendChild(centerIndicator)

  const debugPanel = document.createElement('div')
  debugPanel.id = 'debug-panel'
  root.appendChild(debugPanel)

  const progressDots = hud.querySelector('#progress-dots') as HTMLElement
  const paraLabel = hud.querySelector('#para-label') as HTMLElement
  const layoutPicker = hud.querySelector('#layout-picker') as HTMLElement
  const focusPicker = hud.querySelector('#focus-picker') as HTMLElement
  const focusToggle = hud.querySelector('#focus-toggle') as HTMLButtonElement
  const sizeScrub = hud.querySelector('#size-scrub') as HTMLSpanElement
  const widthScrub = hud.querySelector('#width-scrub') as HTMLSpanElement
  const textInput = inputPanel.querySelector('#text-input') as HTMLTextAreaElement
  const urlInput = inputPanel.querySelector('#url-input') as HTMLInputElement
  const urlLoad = inputPanel.querySelector('#url-load') as HTMLButtonElement
  const urlStatus = inputPanel.querySelector('#url-status') as HTMLDivElement
  const moreToggle = hud.querySelector('#more-toggle') as HTMLButtonElement
  const hudExtra = hud.querySelector('#hud-extra') as HTMLDivElement
  const debugToggle = hud.querySelector('#debug-toggle') as HTMLButtonElement
  const viewToggle = hud.querySelector('#view-toggle') as HTMLButtonElement
  const moveScrub = hud.querySelector('#move-scrub') as HTMLSpanElement
  const panScrub = hud.querySelector('#pan-scrub') as HTMLSpanElement
  const focusScrub = hud.querySelector('#focus-scrub') as HTMLSpanElement

  // ═══════════════════════════════════════════════════════════
  // Engine
  // ═══════════════════════════════════════════════════════════

  let engine = createEngine({ canvas, words: words$.value })

  function syncEngineState(b: BeatId, f: FocusStyleId, s: number | null, total: number, sOnly: boolean) {
    batch(() => {
      beat$.value = b
      focusStyle$.value = f
      sentence$.value = s
      sentenceCount$.value = total
      sentenceOnlyMode$.value = sOnly
    })
  }

  function initEngine() {
    engine.destroy?.()
    engine = createEngine({
      canvas,
      words: words$.value,
      fontFamily: markdownMode$.value ? READER_FONT : undefined,
      maxContentWidth: maxWidth$.value,
      pixelLayout: true,
    })
    engine.onStateChange = syncEngineState

    if ((window as any).__reflowDebug) {
      const sample = words$.value.words.slice(0, 6).map(w => w.text).join(' ')
      console.debug('[reflow] initEngine', 'paras', paragraphs$.value.length, 'idx', currentPara$.value, 'words', words$.value.words.length, 'sample', sample)
    }

    if (isMobile()) {
      engine.setBottomReserve(MOBILE_BOTTOM_RESERVE)
      engine.setBeat('reader')
      engine.start()
      engine.autoFitFontSize()
    } else {
      engine.setBeat('reader')
      engine.start()
    }
  }

  // Reinit engine when paragraph changes
  effect(() => {
    const savedSentence = untracked(() => {
      const global = globalSentence$.value
      if (global == null) return null
      if (viewMode$.value === 'full') return global
      const mapping = mapSentenceToParagraph(global, sentenceCounts$.value)
      return mapping.localSentence
    })
    void currentParaText$.value // subscribe
    initEngine()
    if (savedSentence != null) {
      requestAnimationFrame(() => {
        engine.setSentence(savedSentence)
      })
    }
  })

  // Keep global sentence index in sync with engine state
  effect(() => {
    const localSentence = sentence$.value
    if (localSentence == null) {
      globalSentence$.value = null
      return
    }
    const view = untracked(() => viewMode$.value)
    if (view === 'full') {
      globalSentence$.value = localSentence
      return
    }
    const paraIndex = untracked(() => currentPara$.value)
    const counts = untracked(() => sentenceCounts$.value)
    const offset = getSentenceOffset(counts, paraIndex)
    globalSentence$.value = offset + localSentence
  })

  // ═══════════════════════════════════════════════════════════
  // Scrubbers
  // ═══════════════════════════════════════════════════════════

  const DOUBLE_TAP_MS = 350
  function initScrubber(el: HTMLSpanElement, getValue: () => number, setValue: (v: number) => void, defaultVal: number) {
    const min = parseFloat(el.dataset.min || '0')
    const max = parseFloat(el.dataset.max || '100')
    const step = parseFloat(el.dataset.step || '1')
    let startX = 0, startVal = 0, lastTap = 0

    const updateDisplay = () => { el.textContent = String(Math.round(getValue())) }

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX
      let newVal = startVal + dx * (max - min) / 200
      newVal = Math.round(newVal / step) * step
      newVal = Math.max(min, Math.min(max, newVal))
      setValue(newVal)
      updateDisplay()
    }

    const onUp = () => {
      el.classList.remove('active')
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastTap < DOUBLE_TAP_MS) {
        setValue(defaultVal)
        updateDisplay()
        lastTap = 0
        return
      }
      lastTap = now
      startX = e.clientX
      startVal = getValue()
      el.classList.add('active')
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    })

    return updateDisplay
  }

  const updateSizeDisplay = initScrubber(sizeScrub, () => engine.getFontSize(), v => engine.setFontSize(v), 20)
  const updateWidthDisplay = initScrubber(widthScrub, () => engine.getMaxWidth(), v => {
    maxWidth$.value = v
    engine.setMaxWidth(v)
  }, DEFAULT_WIDTH)
  const updateMoveDisplay = initScrubber(moveScrub, () => engine.getMoveSpeed(), v => {
    moveSpeed$.value = v
    engine.setMoveSpeed(v)
  }, 1)
  const updatePanDisplay = initScrubber(panScrub, () => engine.getPanSpeed(), v => {
    panSpeed$.value = v
    engine.setPanSpeed(v)
  }, 1)
  const updateFocusDisplay = initScrubber(focusScrub, () => engine.getFocusSpeed(), v => {
    focusSpeed$.value = v
    engine.setFocusSpeed(v)
  }, 1)

  // ═══════════════════════════════════════════════════════════
  // Effects (reactive UI updates)
  // ═══════════════════════════════════════════════════════════

  // Progress dots
  effect(() => {
    const paras = paragraphs$.value
    const current = currentPara$.value
    const maxDots = Math.min(paras.length, 10)

    if (paras.length > 1) {
      progressDots.innerHTML = Array.from({ length: maxDots }, (_, i) => {
        const classes = ['progress-dot']
        if (i <= current) classes.push('active')
        if (i === current) classes.push('current')
        return `<div class="${classes.join(' ')}"></div>`
      }).join('')
      paraLabel.textContent = paras.length > 10 ? `¶ ${current + 1}/${paras.length}` : ''
    } else {
      progressDots.innerHTML = ''
      paraLabel.textContent = ''
    }
  })

  // Layout buttons
  effect(() => {
    const active = beat$.value
    layoutPicker.querySelectorAll('.layout-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-beat') === active)
    })
  })

  // Focus buttons
  effect(() => {
    const active = focusStyle$.value
    focusPicker.querySelectorAll('.focus-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-focus') === active)
    })
  })

  // Center indicator
  let indicatorTimeout: ReturnType<typeof setTimeout> | null = null
  effect(() => {
    const paraNum = currentPara$.value + 1
    const paraTotal = paragraphs$.value.length
    const sentNum = sentence$.value !== null ? sentence$.value + 1 : null
    const sentTotal = sentenceCount$.value
    const sOnly = sentenceOnlyMode$.value
    const isAtEnd = paraNum === paraTotal && sentNum === sentTotal

    if (isAtEnd) {
      centerIndicator.textContent = '✓ end · r to restart'
      centerIndicator.classList.add('visible', 'at-end')
      if (indicatorTimeout) clearTimeout(indicatorTimeout)
      return
    }

    centerIndicator.classList.remove('at-end')
    const parts: string[] = []
    if (paraTotal > 1) parts.push(`¶${paraNum}/${paraTotal}`)
    if (sentNum !== null) parts.push(sOnly ? `sentence ${sentNum}/${sentTotal}` : `${sentNum}/${sentTotal}`)
    centerIndicator.textContent = parts.join(' · ')
    centerIndicator.classList.add('visible')

    if (indicatorTimeout) clearTimeout(indicatorTimeout)
    indicatorTimeout = setTimeout(() => centerIndicator.classList.remove('visible'), 1200)
  })

  // HUD collapsed state
  effect(() => {
    hud.classList.toggle('collapsed', hudCollapsed$.value && isMobile())
    hud.classList.toggle('hidden', !isMobile() && hudCollapsed$.value)
  })

  // Input mode
  effect(() => {
    inputPanel.classList.toggle('open', inputMode$.value)
  })

  // Debug paragraph changes
  effect(() => {
    const paras = paragraphs$.value
    const idx = currentPara$.value
    if (debug$.value) {
      const preview = paras[idx]?.slice(0, 140).replace(/\s+/g, ' ')
      console.debug('[reflow] paras', paras.length, 'idx', idx, 'preview', preview)
    }
  })

  // Debug panel (in-app)
  effect(() => {
    const isDebug = debug$.value
    debugPanel.classList.toggle('active', isDebug)
    if (!isDebug) return

    const paras = paragraphs$.value
    const idx = currentPara$.value
    const raw = paras[idx] || ''
    const plain = stripInlineMarkers(raw)
    const mode = markdownMode$.value ? 'markdown' : 'plain'
    const view = viewMode$.value
    const sentenceId = sentence$.value
    let paraId = 0
    let paraRange = '—'
    if (sentenceId !== null) {
      const words = words$.value.words
      const word = words.find((w) => w.sentenceIndex === sentenceId)
      if (word) paraId = word.paragraphIndex
      const matches = words.filter((w) => w.paragraphIndex === paraId)
      if (matches.length > 0) {
        const minRow = Math.min(...matches.map((w) => w.targetY))
        const maxRow = Math.max(...matches.map((w) => w.targetY))
        paraRange = `${minRow}-${maxRow}`
      }
    }
    debugPanel.innerHTML = `
      <div><strong>mode</strong> ${mode}</div>
      <div><strong>view</strong> ${view}</div>
      <div><strong>para</strong> ${idx + 1}/${paras.length}</div>
      <div><strong>sent</strong> ${sentenceId ?? '—'}</div>
      <div><strong>pid</strong> ${paraId}</div>
      <div><strong>rows</strong> ${paraRange}</div>
      <div><strong>raw</strong> ${raw.replace(/\n/g, ' ')}</div>
      <div><strong>plain</strong> ${plain.replace(/\n/g, ' ')}</div>
    `
  })

  // Focus label
  effect(() => {
    focusToggle.textContent = FOCUS_LABELS[focusStyle$.value]
  })

  // Scrubber displays
  effect(() => {
    void currentPara$.value // rerun when para changes
    updateSizeDisplay()
    updateWidthDisplay()
    updateMoveDisplay()
    updatePanDisplay()
    updateFocusDisplay()
  })

  effect(() => {
    const label = viewMode$.value === 'full' ? 'Split' : 'Full'
    viewToggle.textContent = label
  })

  effect(() => {
    hudExtra.classList.toggle('active', extraOpen$.value)
  })

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  function goToParagraph(index: number) {
    const paras = paragraphs$.value
    if (index < 0 || index >= paras.length) return
    currentPara$.value = index
  }

  function nextParagraph(): boolean {
    if (currentPara$.value < paragraphs$.value.length - 1) {
      currentPara$.value++
      return true
    }
    return false
  }

  function prevParagraph(): boolean {
    if (currentPara$.value > 0) {
      currentPara$.value--
      return true
    }
    return false
  }

  function toggleHud() {
    hudCollapsed$.value = !hudCollapsed$.value
  }

  function openInput() {
    inputMode$.value = true
    textInput.value = ''
    urlStatus.textContent = ''
    urlStatus.dataset.state = ''
    requestAnimationFrame(() => textInput.focus())
  }

  function closeInput(submit: boolean) {
    inputMode$.value = false
    urlStatus.textContent = ''
    urlStatus.dataset.state = ''
    if (submit && textInput.value.trim()) {
      const newText = textInput.value.trim()
      localStorage.setItem(STORAGE_KEY, newText)
      localStorage.setItem(STORAGE_MARKDOWN_KEY, '0')
      batch(() => {
        text$.value = newText
        currentPara$.value = 0
        markdownMode$.value = false
      })
    }
  }

  function normalizeUrl(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
      const url = new URL(withScheme)
      return `${url.origin}${url.pathname}`
    } catch {
      return null
    }
  }

  function looksLikeMarkdown(text: string): boolean {
    if (!text) return false
    return /\[\[(strong|em|link|image)/.test(text) || /^#{1,6}\s+/m.test(text) || /^-\s+/.test(text)
  }

  async function loadFromUrl() {
    const normalized = normalizeUrl(urlInput.value)
    if (!normalized) {
      urlStatus.textContent = 'Invalid URL.'
      urlStatus.dataset.state = 'error'
      return
    }

    urlStatus.textContent = 'Loading...'
    urlStatus.dataset.state = 'loading'
    urlLoad.disabled = true

    try {
      const response = await fetch(`https://r.jina.ai/${normalized}`)
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
      urlStatus.textContent = 'Loaded.'
      urlStatus.dataset.state = 'ok'
      closeInput(false)
    } catch (err) {
      urlStatus.textContent = err instanceof Error ? err.message : 'Failed to load URL.'
      urlStatus.dataset.state = 'error'
    } finally {
      urlLoad.disabled = false
    }
  }


  // ═══════════════════════════════════════════════════════════
  // Event Handlers
  // ═══════════════════════════════════════════════════════════

  layoutPicker.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.layout-btn')
    if (!btn) return
    const beat = btn.getAttribute('data-beat') as BeatId
    if (beat) engine.setBeat(beat)
  })

  focusToggle.addEventListener('click', () => {
    engine.cycleFocusStyle()
  })

  debugToggle.addEventListener('click', () => {
    debug$.value = !debug$.value
    ;(window as any).__reflowDebug = debug$.value
  })

  moreToggle.addEventListener('click', () => {
    extraOpen$.value = !extraOpen$.value
  })

  function toggleViewMode() {
    const nextMode = viewMode$.value === 'full' ? 'paragraph' : 'full'
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

  viewToggle.addEventListener('click', () => {
    toggleViewMode()
  })

  textInput.addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      closeInput(true)
    }
  })

  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void loadFromUrl()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeInput(false)
    }
  })

  urlLoad.addEventListener('click', () => {
    void loadFromUrl()
  })

  window.addEventListener('keydown', e => {
    if (inputMode$.value) return

    const key = e.key.toLowerCase()
    if (key === '1') engine.setBeat('reader')
    else if (key === '2') engine.setBeat('ladder')
    else if (key === 'j' || e.key === 'ArrowDown') {
      if (engine.nextSentence() === 'wrap') nextParagraph()
    }
    else if (key === 'k' || e.key === 'ArrowUp') {
      if (engine.prevSentence() === 'wrap') {
        if (prevParagraph()) engine.goToLastSentence()
      }
    }
    else if (key === 'l' || e.key === 'ArrowRight') nextParagraph()
    else if (key === 'h' || e.key === 'ArrowLeft') prevParagraph()
    else if (key === 'f') engine.cycleFocusStyle()
    else if (key === 'v') toggleViewMode()
    else if (key === 'r') goToParagraph(0)
    else if (key === 'i') { e.preventDefault(); openInput() }
    else if (e.key === 'Escape') toggleHud()
  })

  // Mobile swipes
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0

  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      touchStartTime = Date.now()
    }
  }, { passive: true })

  canvas.addEventListener('touchend', e => {
    if (e.changedTouches.length !== 1) return
    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = e.changedTouches[0].clientY - touchStartY
    const dt = Date.now() - touchStartTime
    if (dt > 300) return

    const absX = Math.abs(dx), absY = Math.abs(dy)
    if (absX < 50 && absY < 50) { toggleHud(); return }

    if (absX > absY) {
      if (dx > 50) prevParagraph()
      else if (dx < -50) nextParagraph()
    } else {
      if (dy > 50) {
        if (engine.prevSentence() === 'wrap' && prevParagraph()) engine.goToLastSentence()
      } else if (dy < -50) {
        if (engine.nextSentence() === 'wrap') nextParagraph()
      }
    }
  }, { passive: true })

  hud.addEventListener('click', e => {
    if (!isMobile()) return
    const target = e.target as HTMLElement
    if (target.closest('.layout-picker') || target.closest('.focus-picker') || target.closest('.hud-scrubbers')) return
    hudCollapsed$.value = !hudCollapsed$.value
  })

  // ═══════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════

  initEngine()
  updateSizeDisplay()
  updateWidthDisplay()

  // Expose for debugging
  ;(window as any).syntaxExploder = { engine, paragraphs$, currentPara$, BEATS }
}

function getSentenceCounts(paragraphs: string[], useMarkdown: boolean): number[] {
  const create = useMarkdown ? createWordsMarkdown : createWords
  return paragraphs.map((paragraph) => create(paragraph).sentenceCount)
}

function getSentenceOffset(counts: number[], paragraphIndex: number): number {
  let offset = 0
  for (let i = 0; i < paragraphIndex; i++) offset += counts[i] || 0
  return offset
}

function mapSentenceToParagraph(sentenceIndex: number, counts: number[]): { paragraphIndex: number; localSentence: number } {
  if (counts.length === 0) {
    return { paragraphIndex: 0, localSentence: 0 }
  }
  let offset = 0
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i]
    if (sentenceIndex < offset + count) {
      return { paragraphIndex: i, localSentence: sentenceIndex - offset }
    }
    offset += count
  }
  const lastIndex = Math.max(0, counts.length - 1)
  return { paragraphIndex: lastIndex, localSentence: Math.max(0, (counts[lastIndex] || 1) - 1) }
}
