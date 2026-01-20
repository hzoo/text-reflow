import { signal, computed, effect, batch } from '@preact/signals-core'
import { createWords, splitParagraphs, DEFAULT_TEXT } from './model'
import { type BeatId, BEATS, type FocusStyleId } from './experiments'
import { createEngine } from './engine'

// SVG icons for layout buttons
const LAYOUT_ICONS: Record<BeatId, { svg: string; label: string }> = {
  plain: {
    label: 'Flow',
    svg: `<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h12M4 18h8"/></svg>`,
  },
  cascade: {
    label: 'Build',
    svg: `<svg viewBox="0 0 24 24"><path d="M4 18h4M4 14h8M4 10h12M4 6h16"/></svg>`,
  },
  tree: {
    label: 'Spread',
    svg: `<svg viewBox="0 0 24 24"><path d="M12 4v4M12 8l-6 4M12 8l6 4M6 12l-2 4M6 12l2 4M18 12l-2 4M18 12l2 4"/></svg>`,
  },
  list: {
    label: 'Lines',
    svg: `<svg viewBox="0 0 24 24"><path d="M8 6h12M8 10h12M8 14h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="10" r="1" fill="currentColor"/><circle cx="4" cy="14" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>`,
  },
  magnify: {
    label: 'Zoom',
    svg: `<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/></svg>`,
  },
  radial: {
    label: 'Burst',
    svg: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  },
}

const FOCUS_LABELS: Record<FocusStyleId, string> = {
  dither: 'Soft',
  gray: 'Dim',
  redact: 'Hide',
  none: 'Off',
}

const STORAGE_KEY = 'reflow-text'
const MOBILE_BOTTOM_RESERVE = 60
const isMobile = () => window.innerWidth <= 600

export function start(root: HTMLElement) {
  root.innerHTML = ''

  // ═══════════════════════════════════════════════════════════
  // Signals
  // ═══════════════════════════════════════════════════════════

  const savedText = localStorage.getItem(STORAGE_KEY)
  const text$ = signal(savedText || DEFAULT_TEXT)
  const currentPara$ = signal(0)
  const inputMode$ = signal(false)
  const hudCollapsed$ = signal(isMobile())

  // Engine state (from engine callbacks)
  const beat$ = signal<BeatId>('plain')
  const focusStyle$ = signal<FocusStyleId>('dither')
  const sentence$ = signal<number | null>(0)
  const sentenceCount$ = signal(1)
  const sentenceOnlyMode$ = signal(false)

  // Derived
  const paragraphs$ = computed(() => splitParagraphs(text$.value))
  const currentParaText$ = computed(() => paragraphs$.value[currentPara$.value] || '')
  const words$ = computed(() => createWords(currentParaText$.value))

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
      ${(Object.keys(FOCUS_LABELS) as FocusStyleId[])
        .map(id => `<button class="focus-btn" data-focus="${id}">${FOCUS_LABELS[id]}</button>`)
        .join('')}
    </div>
    <div class="hud-scrubbers">
      <span class="scrub-row">Aa <span class="scrub" id="size-scrub" data-min="12" data-max="48" data-step="1">20</span></span>
      <span class="scrub-row">↔ <span class="scrub" id="width-scrub" data-min="300" data-max="1200" data-step="50">800</span></span>
    </div>
    <div class="hud-keys">↑↓ nav · ← → para · esc hide</div>
  `
  root.appendChild(hud)

  const inputPanel = document.createElement('div')
  inputPanel.id = 'input-panel'
  inputPanel.innerHTML = `
    <textarea id="text-input" placeholder="paste or type text..."></textarea>
    <div class="input-hint">Esc to render · Cmd+Enter to render</div>
  `
  root.appendChild(inputPanel)

  const centerIndicator = document.createElement('div')
  centerIndicator.id = 'center-indicator'
  root.appendChild(centerIndicator)

  const progressDots = hud.querySelector('#progress-dots') as HTMLElement
  const paraLabel = hud.querySelector('#para-label') as HTMLElement
  const layoutPicker = hud.querySelector('#layout-picker') as HTMLElement
  const focusPicker = hud.querySelector('#focus-picker') as HTMLElement
  const sizeScrub = hud.querySelector('#size-scrub') as HTMLSpanElement
  const widthScrub = hud.querySelector('#width-scrub') as HTMLSpanElement
  const textInput = inputPanel.querySelector('#text-input') as HTMLTextAreaElement

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
    engine = createEngine({ canvas, words: words$.value })
    engine.onStateChange = syncEngineState

    if (isMobile()) {
      engine.setBottomReserve(MOBILE_BOTTOM_RESERVE)
      engine.setBeat('plain')
      engine.start()
      engine.autoFitFontSize()
    } else {
      engine.setBeat('plain')
      engine.start()
    }
  }

  // Reinit engine when paragraph changes
  effect(() => {
    void currentParaText$.value // subscribe
    initEngine()
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
  const updateWidthDisplay = initScrubber(widthScrub, () => engine.getMaxWidth(), v => engine.setMaxWidth(v), 800)

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

  // Scrubber displays
  effect(() => {
    void currentPara$.value // rerun when para changes
    updateSizeDisplay()
    updateWidthDisplay()
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
    requestAnimationFrame(() => textInput.focus())
  }

  function closeInput(submit: boolean) {
    inputMode$.value = false
    if (submit && textInput.value.trim()) {
      const newText = textInput.value.trim()
      localStorage.setItem(STORAGE_KEY, newText)
      batch(() => {
        text$.value = newText
        currentPara$.value = 0
      })
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

  focusPicker.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.focus-btn')
    if (!btn) return
    const focus = btn.getAttribute('data-focus') as FocusStyleId
    if (focus) engine.setFocusStyle(focus)
  })

  textInput.addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      closeInput(true)
    }
  })

  window.addEventListener('keydown', e => {
    if (inputMode$.value) return

    const key = e.key.toLowerCase()
    if (key === '1') engine.setBeat('plain')
    else if (key === '2') engine.setBeat('cascade')
    else if (key === '3') engine.setBeat('tree')
    else if (key === '4') engine.setBeat('list')
    else if (key === '5') engine.setBeat('magnify')
    else if (key === '6') engine.setBeat('radial')
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
