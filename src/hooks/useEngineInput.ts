import { useEffect } from 'preact/hooks'
import type { Signal } from '@preact/signals'
import type { createEngine } from '../syntaxExploder/engine'
import {
  controlsOpen$,
  viewMode$,
  currentPara$,
  sentenceCounts$,
  getSentenceOffset,
  isAutoFont$,
} from '../state/signals'
import { pasteToast$ } from '../components/PasteToast'
import { addEntry, fetchUrlToEntry, normalizeUrlForJina } from '../state/library'

type Engine = ReturnType<typeof createEngine>

interface UseEngineInputDeps {
  canvas: HTMLCanvasElement
  engineRef: { current: Engine | null }
  fontSize$: Signal<number>
  nextParagraph: () => boolean
  prevParagraph: () => boolean
  goToParagraph: (index: number) => void
  toggleViewMode: () => void
  openInput: () => void
}

export function useEngineInput(deps: UseEngineInputDeps) {
  useEffect(() => {
    const { canvas, engineRef, fontSize$ } = deps

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
        else if (key === 'r') {
          deps.goToParagraph(0)
          if (viewMode$.value === 'full') engine.setSentence(0)
        }
        else if (key === 'e') engine.goToLastSentence()
        else if (key === 'i' || key === 'm' || key === '?') { e.preventDefault(); deps.openInput() }
        else if (key === '=' || key === '+') {
          isAutoFont$.value = false
          const next = Math.min(128, fontSize$.value + 2)
          fontSize$.value = next
          engine.setFontSize(next)
        }
        else if (key === '-') {
          isAutoFont$.value = false
          const next = Math.max(10, fontSize$.value - 2)
          fontSize$.value = next
          engine.setFontSize(next)
        }
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
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0
    let touchMode: 'tap' | 'scrub' | 'none' = 'none'
    let touchLastY = 0
    const touchAccum = { value: 0 }

    const getTouchCenterY = (touches: TouchList) => {
      if (touches.length === 0) return 0
      if (touches.length === 1) return touches[0].clientY
      return (touches[0].clientY + touches[1].clientY) / 2
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX
        touchStartY = e.touches[0].clientY
        touchStartTime = Date.now()
        touchMode = 'tap'
      } else if (e.touches.length === 2) {
        touchMode = 'scrub'
        touchLastY = getTouchCenterY(e.touches)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touchMode !== 'scrub' || e.touches.length < 2) return
      e.preventDefault()
      const currentY = getTouchCenterY(e.touches)
      const delta = touchLastY - currentY
      touchLastY = currentY
      if (Math.abs(delta) < 0.5) return
      stepByDelta(delta, touchAccum, 120)
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchMode !== 'tap') {
        touchMode = 'none'
        return
      }
      if (e.changedTouches.length !== 1) return
      const dx = e.changedTouches[0].clientX - touchStartX
      const dy = e.changedTouches[0].clientY - touchStartY
      const dt = Date.now() - touchStartTime
      if (dt > 300) return

      const engine = engineRef.current
      if (!engine) return

      const absX = Math.abs(dx), absY = Math.abs(dy)
      if (absX < 50 && absY < 50) {
        controlsOpen$.value = !controlsOpen$.value
        return
      }

      if (absX > absY) {
        if (dx > 50) {
          if (deps.prevParagraph() && viewMode$.value === 'full') {
            engine.setSentence(getSentenceOffset(sentenceCounts$.value, currentPara$.value))
          }
        } else if (dx < -50) {
          if (deps.nextParagraph() && viewMode$.value === 'full') {
            engine.setSentence(getSentenceOffset(sentenceCounts$.value, currentPara$.value))
          }
        }
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
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (!text) return
      e.preventDefault()
      const normalized = normalizeUrlForJina(text)
      const isUrl = Boolean(normalized)
      const preview = isUrl
        ? (() => { try { return new URL(normalized!).hostname } catch { return normalized!.slice(0, 40) } })()
        : text.slice(0, 40)
      pasteToast$.value = { kind: isUrl ? 'url' : 'text', value: isUrl ? normalized! : text, preview }
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
      const uriList = e.dataTransfer?.getData('text/uri-list')?.trim()
      if (uriList && /^https?:\/\//i.test(uriList)) {
        fetchUrlToEntry(uriList).catch(() => {})
        return
      }
      const file = e.dataTransfer?.files?.[0]
      if (file && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
        const isMd = file.name.endsWith('.md')
        file.text().then(content => {
          if (content.trim()) addEntry({ content: content.trim(), isMarkdown: isMd })
        })
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
    }
  }, [deps.canvas])
}
