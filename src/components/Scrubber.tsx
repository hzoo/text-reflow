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
  const { onPointerDown, isActive } = useScrubber({
    min,
    max,
    step,
    getValue: () => value,
    setValue: onChange,
    defaultVal: defaultValue,
  })

  const active = isActive()
  const displayValue = step < 1 ? value.toFixed(1) : String(Math.round(value))

  return (
    <div 
      onPointerDown={onPointerDown}
      class={`
        group flex items-center gap-1.5 h-7 px-2 rounded-full
        bg-btn-bg hover:bg-btn-hover border border-hud-border/10
        cursor-ew-resize select-none touch-none transition-all
        ${active ? 'bg-accent border-accent shadow-lg scale-[1.02]' : ''}
        ${className}
      `}
    >
      <span class={`
        text-[10px] font-black tabular-nums leading-none min-w-[22px] text-center
        ${active ? 'text-bg' : 'text-accent'}
      `}>
        {displayValue}
      </span>
      <div class={`
        flex-1 h-1 rounded-full relative overflow-hidden
        ${active ? 'bg-bg/30' : 'bg-accent/15'}
      `}>
        <div 
          class={`absolute inset-y-0 left-0 rounded-full transition-all duration-75 ${active ? 'bg-bg' : 'bg-accent'}`} 
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
      </div>
    </div>
  )
}
