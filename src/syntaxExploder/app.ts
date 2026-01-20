import { createWords, splitParagraphs, DEFAULT_TEXT } from './model'
import { type BeatId, BEATS, type FocusStyleId } from './experiments'
import { createEngine } from './engine'

export function start(root: HTMLElement) {
  root.innerHTML = ''

  const canvas = document.createElement('canvas')
  canvas.id = 'canv'
  root.appendChild(canvas)

  // HUD element (outside canvas)
  const hud = document.createElement('div')
  hud.id = 'hud'
  hud.innerHTML = `
    <div class="hud-line" id="hud-status"></div>
    <div class="hud-line" id="hud-para"></div>
    <div class="hud-line hud-keys">1-6: layout  hjkl/arrows: nav  f: focus  i: input  esc: hide</div>
    <div class="hud-scrubber">
      <label>size</label>
      <input type="range" id="size-scrubber" min="12" max="40" value="20">
    </div>
    <div class="hud-scrubber">
      <label>width</label>
      <input type="range" id="width-scrubber" min="300" max="1200" value="800">
    </div>
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

  const hudStatus = hud.querySelector('#hud-status') as HTMLElement
  const hudPara = hud.querySelector('#hud-para') as HTMLElement
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
    if (paragraphs.length <= 1) {
      hudPara.textContent = ''
    } else {
      hudPara.textContent = `para ${currentPara + 1}/${paragraphs.length}`
    }
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
    hudStatus.textContent = `${beat} · ${focusStyle} · ${sentence !== null ? sentence + 1 : '-'}/${total}`
    showIndicator(currentPara + 1, paragraphs.length, sentence !== null ? sentence + 1 : null, total)
  }

  engine.onStateChange = updateHud

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
