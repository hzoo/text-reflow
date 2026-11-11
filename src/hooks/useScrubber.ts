import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'

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
  const lastTapRef = useRef<number | null>(null)
  const endDragRef = useRef<(() => void) | null>(null)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => () => endDragRef.current?.(), [])

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || endDragRef.current) return
    e.preventDefault()

    const previousTap = lastTapRef.current
    lastTapRef.current = null
    if (previousTap !== null && Date.now() - previousTap < DOUBLE_TAP_MS) {
      setValue(defaultVal)
      return
    }

    const { pointerId, clientX: startX } = e
    const startValue = getValue()
    let moved = false

    function onMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) return
      const dx = event.clientX - startX
      moved ||= dx !== 0
      let newVal = startValue + dx * (max - min) / 200
      newVal = Math.round(newVal / step) * step
      newVal = Math.max(min, Math.min(max, newVal))
      setValue(newVal)
    }

    function endDrag() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('blur', onBlur)
      endDragRef.current = null
    }

    function onEnd(event: PointerEvent) {
      if (event.pointerId !== pointerId) return
      if (event.type === 'pointerup' && !moved && event.clientX === startX) {
        lastTapRef.current = Date.now()
      }
      onBlur()
    }

    function onBlur() {
      endDrag()
      setActive(false)
    }

    endDragRef.current = endDrag
    setActive(true)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onEnd)
    document.addEventListener('pointercancel', onEnd)
    window.addEventListener('blur', onBlur)
  }, [min, max, step, getValue, setValue, defaultVal])

  return { onPointerDown, active }
}
