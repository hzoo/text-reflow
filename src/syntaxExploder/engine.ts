import { BEATS, type BeatId, FOCUS_STYLES, type FocusStyleId, type LayoutMap, type Metrics } from './experiments'
import type { DocumentModel, Word } from './model'

type EngineOpts = {
  canvas: HTMLCanvasElement
  words: DocumentModel
}

export function createEngine({ canvas, words: model }: EngineOpts) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D context not available')
  const ctx = context

  let running = false
  let beat: BeatId = 'plain'
  let focusStyle: FocusStyleId = 'dither'
  let showHud = true

  let hoveredSentence: number | null = null

  const metrics: Metrics = {
    charW: 10,
    lineH: 18,
    maxCols: 80,
    padX: 24,
    padY: 24,
  }

  let animPadY = 24

  function applyDPR() {
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = Math.floor(window.innerWidth)
    const h = Math.floor(window.innerHeight)

    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function measureFont() {
    ctx.textBaseline = 'top'
    ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

    const m = ctx.measureText('M')
    metrics.charW = m.width || 10
    const ascent = m.actualBoundingBoxAscent || 12
    const descent = m.actualBoundingBoxDescent || 4
    metrics.lineH = Math.max(14, (ascent + descent) * 1.35)

    // center block horizontally for fixed width
    const blockW = metrics.maxCols * metrics.charW
    metrics.padX = Math.max(16, Math.floor((window.innerWidth - blockW) / 2))

    // Estimate vertical height based on current targets to center vertically
    let maxRow = 0
    for (const w of model.words) {
      if (w.targetRow > maxRow) maxRow = w.targetRow
    }
    const blockH = (maxRow + 1) * metrics.lineH
    metrics.padY = Math.max(24, Math.floor((window.innerHeight - blockH) / 2))
  }

  function layoutCurrentBeat() {
    const layout = BEATS[beat].layout({ model, metrics })
    applyTargets(model.words, layout)
    // Re-measure after layout to update vertical padding
    measureFont()
  }

  function applyTargets(words: Word[], targets: LayoutMap) {
    for (const w of words) {
      const t = targets.get(w.id)
      if (!t) continue
      w.targetCol = t.col
      w.targetRow = t.row
    }
  }

  function stepWordAnimation(dt: number) {
    // smoothing factor; dt-normalized
    const k = 1 - Math.pow(0.0001, dt)

    for (const w of model.words) {
      w.animCol += (w.targetCol - w.animCol) * k
      w.animRow += (w.targetRow - w.animRow) * k
      w.animScale += (w.targetScale - w.animScale) * k
    }

    // smooth padY transition
    const kPad = 1 - Math.pow(0.001, dt)
    animPadY += (metrics.padY - animPadY) * kPad
  }

  function sentenceYOffset(sentenceIndex: number): number {
    if (hoveredSentence == null) return 0
    
    const baseGap = beat === 'magnify' ? 80 : 48
    
    if (sentenceIndex < hoveredSentence) return -baseGap / 2
    if (sentenceIndex > hoveredSentence) return baseGap / 2
    return 0
  }

  function stepFocus(dt: number) {
    const k = 1 - Math.pow(0.01, dt)
    const isMagnifyBeat = beat === 'magnify'

    for (const w of model.words) {
      const isHoveredSent = hoveredSentence !== null && w.sentenceIndex === hoveredSentence
      
      // Update target scale (reduced from 1.8 to 1.35)
      if (isMagnifyBeat && isHoveredSent) {
        w.targetScale = 1.35
      } else {
        w.targetScale = 1.0
      }

      const targetDy = sentenceYOffset(w.sentenceIndex)
      w.focusDy += (targetDy - w.focusDy) * k
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // Cache sentence center for center-zoom (computed once per frame would be better, but this works)
  function getSentenceCenter(sentenceIndex: number): { centerCol: number; centerRow: number } {
    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity
    for (const other of model.words) {
      if (other.sentenceIndex === sentenceIndex) {
        minCol = Math.min(minCol, other.targetCol)
        maxCol = Math.max(maxCol, other.targetCol + other.cols)
        minRow = Math.min(minRow, other.targetRow)
        maxRow = Math.max(maxRow, other.targetRow + 1)
      }
    }
    return {
      centerCol: (minCol + maxCol) / 2,
      centerRow: (minRow + maxRow) / 2,
    }
  }

  function drawWord(w: Word) {
    const s = w.animScale
    const fontSize = 16 * s
    
    // Base position (unscaled)
    const baseX = metrics.padX + w.animCol * metrics.charW
    const baseY = animPadY + w.animRow * metrics.lineH + w.focusDy

    let x = baseX
    let y = baseY

    // For magnified words, zoom from the sentence center
    if (s > 1.01) {
      const { centerCol, centerRow } = getSentenceCenter(w.sentenceIndex)
      
      // Pixel position of sentence center at scale 1.0
      const centerX = metrics.padX + centerCol * metrics.charW
      const centerY = animPadY + centerRow * metrics.lineH + w.focusDy

      // Scale position relative to the center
      x = centerX + (baseX - centerX) * s
      y = centerY + (baseY - centerY) * s
    }

    // in monospace, we can just draw the token and let cols account for spacing
    const drawText = w.spaceAfter ? `${w.text} ` : w.text

    // hover highlight
    const isHover = hoveredSentence != null && w.sentenceIndex === hoveredSentence

    ctx.save()
    ctx.font = `${fontSize.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

    if (!isHover && hoveredSentence != null) {
      if (focusStyle === 'redact') {
        ctx.fillStyle = 'rgba(0,0,0,0.1)'
        ctx.fillRect(x, y + 2 * s, w.cols * metrics.charW * s - 2 * s, metrics.lineH * s - 4 * s)
        ctx.restore()
        return // Don't draw text
      }

      if (focusStyle === 'gray') {
        ctx.globalAlpha = 0.2
        ctx.fillStyle = '#111'
      } else if (focusStyle === 'dither') {
        const on = (Math.floor(x / (metrics.charW * s)) + Math.floor(y / (metrics.lineH * s))) % 2 === 0
        ctx.globalAlpha = on ? 0.16 : 0.32
        ctx.fillStyle = '#111'
      } else {
        // 'none'
        ctx.globalAlpha = 1
        ctx.fillStyle = '#111'
      }
    } else {
      ctx.globalAlpha = 1
      ctx.fillStyle = '#111'
    }

    ctx.fillText(drawText, x, y)
    ctx.globalAlpha = 1
    ctx.restore()
  }

  function drawHud(fps: number) {
    if (!showHud) return

    const lines = [
      `beat: ${beat} (${BEATS[beat].name})`,
      `focus: ${focusStyle} (${FOCUS_STYLES[focusStyle].name})`,
      `sent: ${hoveredSentence !== null ? hoveredSentence + 1 : '-'}/${model.sentenceCount}`,
      `words: ${model.words.length}`,
      `fps: ${fps.toFixed(0)}`,
      'keys: 1-6 beats  j/k: nav  f: focus  h: hud',
    ]

    ctx.save()
    ctx.globalAlpha = 0.9

    const pad = 8
    const boxW = 240
    const boxH = lines.length * 16 + pad * 2
    const x = window.innerWidth - boxW - 14
    const y = 14

    ctx.fillStyle = 'rgba(250,247,240,0.92)'
    ctx.fillRect(x, y, boxW, boxH)
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'
    ctx.strokeRect(x, y, boxW, boxH)

    ctx.fillStyle = '#111'
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    let textY = y + pad
    for (const line of lines) {
      ctx.fillText(line, x + pad, textY)
      textY += 16
    }

    ctx.restore()
  }

  function wordIndexUnder(px: number, py: number): number | null {
    // iterate; ok for a single paragraph; optimize later
    for (let i = 0; i < model.words.length; i++) {
      const w = model.words[i]
      const s = w.animScale
      
      // Base position (unscaled)
      const baseX = metrics.padX + w.animCol * metrics.charW
      const baseY = animPadY + w.animRow * metrics.lineH + w.focusDy

      let x = baseX
      let y = baseY
      let width = Math.max(1, w.cols) * metrics.charW
      let height = metrics.lineH

      // For magnified words, compute actual position from center zoom
      if (s > 1.01) {
        const { centerCol, centerRow } = getSentenceCenter(w.sentenceIndex)
        const centerX = metrics.padX + centerCol * metrics.charW
        const centerY = animPadY + centerRow * metrics.lineH + w.focusDy
        x = centerX + (baseX - centerX) * s
        y = centerY + (baseY - centerY) * s
        width *= s
        height *= s
      }

      if (x <= px && px <= x + width && y <= py && py <= y + height) return i
    }
    return null
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const idx = wordIndexUnder(x, y)

    if (idx == null) {
      hoveredSentence = null
      document.body.style.cursor = 'default'
      return
    }

    hoveredSentence = model.words[idx].sentenceIndex
    document.body.style.cursor = 'pointer'
  })

  window.addEventListener('resize', () => {
    applyDPR()
    measureFont()
    layoutCurrentBeat()
  })

  let last = performance.now()
  let fps = 60
  function frame(now: number) {
    if (!running) return

    const dtMs = now - last
    last = now

    const dt = Math.min(0.05, dtMs / 1000)
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1

    stepWordAnimation(dt)
    stepFocus(dt)

    clear()
    ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    for (const w of model.words) drawWord(w)

    drawHud(fps)

    requestAnimationFrame(frame)
  }

  function start() {
    applyDPR()
    measureFont()

    // init anim state to targets
    layoutCurrentBeat()
    animPadY = metrics.padY
    for (const w of model.words) {
      w.animCol = w.targetCol
      w.animRow = w.targetRow
    }

    running = true
    last = performance.now()
    requestAnimationFrame(frame)
  }

  function setBeat(next: BeatId) {
    beat = next
    layoutCurrentBeat()
  }

  function setFocusStyle(next: FocusStyleId) {
    focusStyle = next
  }

  function cycleFocusStyle() {
    const ids: FocusStyleId[] = ['dither', 'gray', 'redact', 'none']
    const idx = ids.indexOf(focusStyle)
    focusStyle = ids[(idx + 1) % ids.length]
  }

  function nextSentence() {
    if (hoveredSentence === null) {
      hoveredSentence = 0
    } else {
      hoveredSentence = (hoveredSentence + 1) % model.sentenceCount
    }
  }

  function prevSentence() {
    if (hoveredSentence === null) {
      hoveredSentence = model.sentenceCount - 1
    } else {
      hoveredSentence = (hoveredSentence - 1 + model.sentenceCount) % model.sentenceCount
    }
  }

  function toggleHud() {
    showHud = !showHud
  }

  return { start, setBeat, setFocusStyle, cycleFocusStyle, nextSentence, prevSentence, toggleHud }
}
