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

export function start(root: HTMLElement) {
  root.innerHTML = ''

  const canvas = document.createElement('canvas')
  canvas.id = 'canv'
  root.appendChild(canvas)

  // HUD element (outside canvas)
  const hud = document.createElement('div')
  hud.id = 'hud'
  hud.innerHTML = `
    <div class="hud-progress">
      <div class="progress-dots" id="progress-dots"></div>
      <span class="para-label" id="para-label"></span>
    </div>
    <div class="layout-picker" id="layout-picker">
      ${(Object.keys(LAYOUT_ICONS) as BeatId[])
        .map(
          (id) =>
            `<button class="layout-btn" data-beat="${id}" title="${LAYOUT_ICONS[id].label}" aria-label="${LAYOUT_ICONS[id].label}">${LAYOUT_ICONS[id].svg}</button>`
        )
        .join('')}
    </div>
    <div class="focus-picker" id="focus-picker">
      ${(Object.keys(FOCUS_LABELS) as FocusStyleId[])
        .map(
          (id) =>
            `<button class="focus-btn" data-focus="${id}">${FOCUS_LABELS[id]}</button>`
        )
        .join('')}
    </div>
    <div class="hud-slider">
      <span class="slider-label">Aa</span>
      <input type="range" id="size-scrubber" min="12" max="40" value="20">
    </div>
    <div class="hud-slider">
      <span class="slider-label">↔</span>
      <input type="range" id="width-scrubber" min="300" max="1200" value="800">
    </div>
    <div class="hud-keys">↑↓ nav · ← → para · esc hide</div>
  `
  root.appendChild(hud)

  // Input panel (bottom sheet)
  const inputPanel = document.createElement('div')
  inputPanel.id = 'input-panel'
  inputPanel.innerHTML = `
    <textarea id="text-input" placeholder="paste or type text..."></textarea>
    <div class="input-hint">Esc to render · Cmd+Enter to render</div>
  `
  root.appendChild(inputPanel)

  // Center position indicator
  const centerIndicator = document.createElement('div')
  centerIndicator.id = 'center-indicator'
  root.appendChild(centerIndicator)

  let indicatorTimeout: ReturnType<typeof setTimeout> | null = null
  function showIndicator(paraNum: number, paraTotal: number, sentNum: number | null, sentTotal: number) {
    const isAtEnd = paraNum === paraTotal && sentNum === sentTotal

    if (isAtEnd) {
      centerIndicator.textContent = '✓ end · r to restart'
      centerIndicator.classList.add('visible', 'at-end')
      if (indicatorTimeout) clearTimeout(indicatorTimeout)
      // Don't auto-hide at end
      return
    }

    centerIndicator.classList.remove('at-end')
    const parts: string[] = []
    if (paraTotal > 1) parts.push(`¶${paraNum}/${paraTotal}`)
    if (sentNum !== null) parts.push(`${sentNum}/${sentTotal}`)
    centerIndicator.textContent = parts.join(' · ')
    centerIndicator.classList.add('visible')

    if (indicatorTimeout) clearTimeout(indicatorTimeout)
    indicatorTimeout = setTimeout(() => {
      centerIndicator.classList.remove('visible')
    }, 1200)
  }

  const progressDots = hud.querySelector('#progress-dots') as HTMLElement
  const paraLabel = hud.querySelector('#para-label') as HTMLElement
  const layoutPicker = hud.querySelector('#layout-picker') as HTMLElement
  const focusPicker = hud.querySelector('#focus-picker') as HTMLElement
  const sizeScrubber = hud.querySelector('#size-scrubber') as HTMLInputElement
  const widthScrubber = hud.querySelector('#width-scrubber') as HTMLInputElement
  const textInput = inputPanel.querySelector('#text-input') as HTMLTextAreaElement

  const STORAGE_KEY = 'reflow-text'
  const savedText = localStorage.getItem(STORAGE_KEY)
  const initialText = savedText || DEFAULT_TEXT

  let paragraphs = splitParagraphs(initialText)
  let currentPara = 0
  let words = createWords(paragraphs[currentPara] || '')
  let engine = createEngine({ canvas, words })

  function updateParaIndicator() {
    // Update progress dots (max 10 dots for readability)
    const maxDots = Math.min(paragraphs.length, 10)
    const showDots = paragraphs.length > 1

    if (showDots) {
      progressDots.innerHTML = Array.from({ length: maxDots }, (_, i) => {
        const classes = ['progress-dot']
        if (i <= currentPara) classes.push('active')
        if (i === currentPara) classes.push('current')
        return `<div class="${classes.join(' ')}"></div>`
      }).join('')
      paraLabel.textContent = paragraphs.length > 10
        ? `¶ ${currentPara + 1}/${paragraphs.length}`
        : ''
    } else {
      progressDots.innerHTML = ''
      paraLabel.textContent = ''
    }
  }

  function updateLayoutButtons(activeBeat: BeatId) {
    layoutPicker.querySelectorAll('.layout-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-beat') === activeBeat)
    })
  }

  function updateFocusButtons(activeStyle: FocusStyleId) {
    focusPicker.querySelectorAll('.focus-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-focus') === activeStyle)
    })
  }

  function goToParagraph(index: number) {
    if (index < 0 || index >= paragraphs.length) return
    currentPara = index
    words = createWords(paragraphs[currentPara])
    engine = createEngine({ canvas, words })
    engine.onStateChange = updateHud
    engine.setBeat('plain')
    engine.start()
    updateParaIndicator()
  }

  function nextParagraph(): boolean {
    if (currentPara < paragraphs.length - 1) {
      goToParagraph(currentPara + 1)
      return true
    }
    return false
  }

  function prevParagraph(): boolean {
    if (currentPara > 0) {
      goToParagraph(currentPara - 1)
      return true
    }
    return false
  }

  function restart() {
    goToParagraph(0)
  }

  function updateHud(beat: BeatId, focusStyle: FocusStyleId, sentence: number | null, total: number) {
    updateLayoutButtons(beat)
    updateFocusButtons(focusStyle)
    showIndicator(currentPara + 1, paragraphs.length, sentence !== null ? sentence + 1 : null, total)
  }

  engine.onStateChange = updateHud

  // Layout picker clicks
  layoutPicker.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.layout-btn')
    if (!btn) return
    const beat = btn.getAttribute('data-beat') as BeatId
    if (beat) engine.setBeat(beat)
  })

  // Focus picker clicks
  focusPicker.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.focus-btn')
    if (!btn) return
    const focus = btn.getAttribute('data-focus') as FocusStyleId
    if (focus) engine.setFocusStyle(focus)
  })

  sizeScrubber.addEventListener('input', () => {
    engine.setFontSize(parseInt(sizeScrubber.value, 10))
  })

  widthScrubber.addEventListener('input', () => {
    engine.setMaxWidth(parseInt(widthScrubber.value, 10))
  })

  function setBeat(beat: BeatId) {
    engine.setBeat(beat)
  }

  function toggleHud() {
    hud.classList.toggle('hidden')
  }

  let inputMode = false

  function openInput() {
    inputMode = true
    inputPanel.classList.add('open')
    textInput.value = ''
    // Delay focus to avoid 'i' being typed
    requestAnimationFrame(() => textInput.focus())
  }

  function closeInput(submit: boolean) {
    inputMode = false
    inputPanel.classList.remove('open')

    if (submit && textInput.value.trim()) {
      const newText = textInput.value.trim()
      localStorage.setItem(STORAGE_KEY, newText)
      paragraphs = splitParagraphs(newText)
      currentPara = 0
      words = createWords(paragraphs[0] || '')
      engine = createEngine({ canvas, words })
      engine.onStateChange = updateHud
      engine.setBeat('plain')
      engine.start()
      updateParaIndicator()
    }
  }

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeInput(true)
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      closeInput(true)
    }
  })

  window.addEventListener('keydown', (e) => {
    if (inputMode) return // don't handle keys when input is open

    const key = e.key.toLowerCase()
    if (key === '1') setBeat('plain')
    else if (key === '2') setBeat('cascade')
    else if (key === '3') setBeat('tree')
    else if (key === '4') setBeat('list')
    else if (key === '5') setBeat('magnify')
    else if (key === '6') setBeat('radial')
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
    else if (key === 'r') restart()
    else if (key === 'i') { e.preventDefault(); openInput() }
    else if (e.key === 'Escape') toggleHud()
  })

  // Mobile: swipe gestures
  let touchStartX = 0
  let touchStartY = 0
  let touchStartTime = 0

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      touchStartTime = Date.now()
    }
  }, { passive: true })

  canvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return

    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = e.changedTouches[0].clientY - touchStartY
    const dt = Date.now() - touchStartTime

    // Must be a quick swipe (< 300ms) with enough distance (> 50px)
    if (dt > 300) return

    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    if (absX < 50 && absY < 50) {
      // Tap - toggle HUD
      toggleHud()
      return
    }

    if (absX > absY) {
      // Horizontal swipe
      if (dx > 50) prevParagraph()
      else if (dx < -50) nextParagraph()
    } else {
      // Vertical swipe
      if (dy > 50) {
        if (engine.prevSentence() === 'wrap') {
          if (prevParagraph()) engine.goToLastSentence()
        }
      } else if (dy < -50) {
        if (engine.nextSentence() === 'wrap') nextParagraph()
      }
    }
  }, { passive: true })

  // Mobile: nav buttons
  const mobileNav = document.createElement('div')
  mobileNav.id = 'mobile-nav'
  mobileNav.innerHTML = `
    <button class="nav-btn" data-action="prev-para">←</button>
    <button class="nav-btn" data-action="prev-sent">↑</button>
    <button class="nav-btn" data-action="next-sent">↓</button>
    <button class="nav-btn" data-action="next-para">→</button>
  `
  root.appendChild(mobileNav)

  mobileNav.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.nav-btn')
    if (!btn) return
    const action = btn.getAttribute('data-action')
    if (action === 'prev-para') prevParagraph()
    else if (action === 'next-para') nextParagraph()
    else if (action === 'prev-sent') {
      if (engine.prevSentence() === 'wrap') {
        if (prevParagraph()) engine.goToLastSentence()
      }
    }
    else if (action === 'next-sent') {
      if (engine.nextSentence() === 'wrap') nextParagraph()
    }
  })

  // initial
  engine.setBeat('plain')
  engine.start()
  updateParaIndicator()

  // expose for REPL tinkering
  ;(window as any).syntaxExploder = {
    engine,
    words,
    BEATS,
    setBeat,
  }
}
