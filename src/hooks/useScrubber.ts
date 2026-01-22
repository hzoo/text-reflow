import { useRef, useCallback } from 'preact/hooks'

const DOUBLE_TAP_MS = 350

interface ScrubberOptions {
  min: number
  max: number
  step: number
  getValue: () => number
  setValue: (v: number) => void
  defaultVal: number
}

export function useScrubber({ min, max, step, getValue, setValue, defaultVal }: ScrubberOptions) {
  const lastTapRef = useRef(0)
  const startXRef = useRef(0)
  const startValRef = useRef(0)
  const activeRef = useRef(false)

  const onPointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault()
    const now = Date.now()

    // Double-tap to reset
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      setValue(defaultVal)
      lastTapRef.current = 0
      return
    }

    lastTapRef.current = now
    startXRef.current = e.clientX
    startValRef.current = getValue()
    activeRef.current = true

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startXRef.current
      let newVal = startValRef.current + dx * (max - min) / 200
      newVal = Math.round(newVal / step) * step
      newVal = Math.max(min, Math.min(max, newVal))
      setValue(newVal)
    }

    const onUp = () => {
      activeRef.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [min, max, step, getValue, setValue, defaultVal])

  return { onPointerDown, isActive: () => activeRef.current }
}
