import { useEffect } from 'preact/hooks'
import type { createEngine } from '../syntaxExploder/engine'
import {
  controlsOpen$,
  fontSize$,
  setManualFontSize,
} from '../state/signals'
import { pasteToast$ } from '../components/PasteToast'
import { readFileToEntry, fetchUrlToEntry, normalizeUrlForJina } from '../state/library'

type Engine = ReturnType<typeof createEngine>

interface UseEngineInputDeps {
  canvas: HTMLCanvasElement
  engineRef: { current: Engine | null }
  nextParagraph: () => boolean
  prevParagraph: () => boolean
  jumpParagraph: (engine: Engine, direction: -1 | 1) => void
  restartReading: (engine: Engine) => void
  toggleViewMode: () => void
  openInput: () => void
}

export function useEngineInput(deps: UseEngineInputDeps) {
  useEffect(() => {
    const { canvas, engineRef } = deps

    const stepNextSentence = () => {
      const engine = engineRef.current
      if (!engine) return
      if (engine.nextSentence() === 'wrap') deps.nextParagraph()
    }

    const stepPrevSentence = () => {
      const engine = engineRef.current
      if (!engine) return
      if (engine.prevSentence() === 'wrap') {
        if (deps.prevParagraph()) engine.goToLastSentence()
      }
    }

    const stepByDelta = (deltaY: number, acc: { value: number }, threshold: number) => {
      const engine = engineRef.current
      if (!engine) return

      acc.value += deltaY
      engine.batch(() => {
        while (acc.value >= threshold) {
          if (engine.nextSentence() === 'wrap') deps.nextParagraph()
          acc.value -= threshold
        }
        while (acc.value <= -threshold) {
          if (engine.prevSentence() === 'wrap') {
            if (deps.prevParagraph()) engine.goToLastSentence()
          }
          acc.value += threshold
        }
      })
    }

    // --- Keyboard ---
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return
      }

      // Ignore app keybinds when using OS/browser shortcuts (paste, copy, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const engine = engineRef.current
      if (!engine) return

      engine.batch(() => {
        const key = e.key.toLowerCase()
        if (key === '1') engine.setBeat('reader')
        else if (key === '2') engine.setBeat('ladder')
        else if (e.key === 'ArrowDown' || key === 'j') stepNextSentence()
        else if (e.key === 'ArrowUp' || key === 'k') stepPrevSentence()
        else if (e.key === 'ArrowRight' || key === 'l') stepNextSentence()
        else if (e.key === 'ArrowLeft' || key === 'h') stepPrevSentence()
        else if (key === 'f') engine.cycleFocusStyle()
        else if (key === 'v') deps.toggleViewMode()
        else if (key === 'r') deps.restartReading(engine)
        else if (key === 'e') engine.goToLastSentence()
        else if (key === 'i' || key === 'm') { e.preventDefault(); deps.openInput() }
        else if (key === '=' || key === '+') setManualFontSize(fontSize$.peek() + 2)
        else if (key === '-') setManualFontSize(fontSize$.peek() - 2)
        else if (key === '?') controlsOpen$.value = !controlsOpen$.value
        else if (e.key === 'Escape') { if (controlsOpen$.value) controlsOpen$.value = false }
      })
    }

    // --- Wheel ---
    const wheelAccum = { value: 0 }
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Element | null
      if (target && target.closest('[data-native-scroll="true"]')) return

      // Allow scrolling even when HUD is open
      if (Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      stepByDelta(e.deltaY, wheelAccum, 60)
    }

    // --- Touch ---
    type CanvasTouch =
      | { kind: 'tap'; id: number; x: number; y: number; startedAt: number }
      | { kind: 'scrub'; lastY: number; accumulated: { value: number } }
    let touch: CanvasTouch | null = null

    const getTouchCenterY = (touches: TouchList) => (touches[0].clientY + touches[1].clientY) / 2

    const handleTouchStart = (e: TouchEvent) => {
      const touches = e.targetTouches
      if (touches.length === 1) {
        const { identifier, clientX, clientY } = touches[0]
        touch = { kind: 'tap', id: identifier, x: clientX, y: clientY, startedAt: Date.now() }
      } else if (touches.length === 2) {
        touch = { kind: 'scrub', lastY: getTouchCenterY(touches), accumulated: { value: 0 } }
      } else {
        touch = null
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touch?.kind !== 'scrub' || e.targetTouches.length !== 2) return
      e.preventDefault()
      const currentY = getTouchCenterY(e.targetTouches)
      const delta = touch.lastY - currentY
      touch.lastY = currentY
      if (Math.abs(delta) < 0.5) return
      stepByDelta(delta, touch.accumulated, 120)
    }

    const handleTouchCancel = () => { touch = null }

    const handleTouchEnd = (e: TouchEvent) => {
      const finished = touch
      touch = null
      if (finished?.kind !== 'tap') return
      if (e.changedTouches.length !== 1) return
      const ended = e.changedTouches[0]
      if (ended.identifier !== finished.id) return
      const dx = ended.clientX - finished.x
      const dy = ended.clientY - finished.y
      const dt = Date.now() - finished.startedAt
      if (dt > 300) return

      const engine = engineRef.current
      if (!engine) return

      const absX = Math.abs(dx), absY = Math.abs(dy)
      if (absX < 50 && absY < 50) {
        controlsOpen$.value = !controlsOpen$.value
        return
      }

      if (absX > absY) {
        if (dx > 50) deps.jumpParagraph(engine, -1)
        else if (dx < -50) deps.jumpParagraph(engine, 1)
      } else {
        if (dy > 50) {
          if (engine.prevSentence() === 'wrap' && deps.prevParagraph()) engine.goToLastSentence()
        } else if (dy < -50) {
          if (engine.nextSentence() === 'wrap') deps.nextParagraph()
        }
      }
    }

    // --- Paste ---
    const handlePaste = (e: ClipboardEvent) => {
      if (controlsOpen$.value) return
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return
      }
      const text = e.clipboardData?.getData('text/plain')
      if (!text?.trim()) return
      e.preventDefault()
      const url = normalizeUrlForJina(text)
      pasteToast$.value = url
        ? { kind: 'url', value: url, preview: new URL(url).hostname }
        : { kind: 'text', value: text, preview: text.trim().slice(0, 40) }
    }

    // --- Drag & Drop ---
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      canvas.style.boxShadow = 'inset 0 0 0 2px var(--color-accent, #666)'
    }
    const handleDragLeave = () => {
      canvas.style.boxShadow = ''
    }
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      canvas.style.boxShadow = ''
      const url = e.dataTransfer?.getData('text/uri-list').split(/\r?\n/).find(line => /^https?:\/\//i.test(line.trim()))
      if (url) {
        fetchUrlToEntry(url).catch(console.error)
        return
      }
      const file = e.dataTransfer?.files?.[0]
      if (file && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
        readFileToEntry(file).catch(console.error)
      }
    }

    // --- Register ---
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('paste', handlePaste)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true })
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('wheel', handleWheel)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [deps.canvas])
}
