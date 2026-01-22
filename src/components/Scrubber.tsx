import { useScrubber } from '../hooks/useScrubber'

interface ScrubberProps {
  min: number
  max: number
  step: number
  value: number
  defaultValue: number
  onChange: (v: number) => void
  class?: string
}

export function Scrubber({ min, max, step, value, defaultValue, onChange, class: className = '' }: ScrubberProps) {
  const { onPointerDown } = useScrubber({
    min,
    max,
    step,
    getValue: () => value,
    setValue: onChange,
    defaultVal: defaultValue,
  })

  const displayValue = step < 1 ? value.toFixed(1) : String(Math.round(value))

  return (
    <span
      onPointerDown={onPointerDown}
      class={`
        cursor-ew-resize px-1 py-0.5 rounded
        bg-btn-bg hover:bg-btn-hover
        min-w-7 text-center select-none touch-none
        text-accent font-medium
        max-sm:min-h-11 max-sm:min-w-11 max-sm:px-2.5 max-sm:flex max-sm:items-center max-sm:justify-center
        ${className}
      `}
    >
      {displayValue}
    </span>
  )
}
