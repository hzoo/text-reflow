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
  const { onPointerDown, active } = useScrubber({
    min,
    max,
    step,
    getValue: () => value,
    setValue: onChange,
    defaultVal: defaultValue,
  })

  const displayValue = step < 1 ? value.toFixed(1) : String(Math.round(value))

  return (
    <div 
      onPointerDown={onPointerDown}
      class={`
        group flex items-center gap-2.5 h-8 px-3 rounded-full
        bg-btn-bg/60 hover:bg-btn-bg/90 cursor-ew-resize select-none touch-none transition-all
        ${active ? 'bg-btn-bg shadow-md scale-105' : ''}
        ${className}
      `}
    >
      <span class={`
        text-[12px] font-black tabular-nums leading-none min-w-[26px] text-center transition-all
        ${active ? 'text-accent scale-110' : 'text-accent'}
      `}>
        {displayValue}
      </span>
      <div class="flex-1 h-[3px] bg-accent/15 relative rounded-full overflow-hidden">
        <div 
          class="absolute inset-y-0 left-0 bg-accent transition-all duration-75" 
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
      </div>
      <div 
        class="w-3.5 h-3.5 rounded-full bg-accent shadow-md border-2 border-bg transition-transform duration-150" 
        style={{ 
          transform: `scale(${active ? 1.3 : 1})`,
        }}
      />
    </div>
  )
}
