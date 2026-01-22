import { IconButton } from './Button'
import type { BeatId } from '../syntaxExploder/experiments'

const LAYOUT_ICONS: Record<BeatId, { svg: string; label: string; kbd: string }> = {
  reader: {
    label: 'Reader',
    kbd: '1',
    svg: `<svg viewBox="0 0 24 24" class="w-[18px] h-[18px] stroke-accent stroke-[1.5] fill-none max-sm:w-5 max-sm:h-5"><path d="M4 6h16M4 10h16M4 14h12M4 18h8"/></svg>`,
  },
  ladder: {
    label: 'Ladder',
    kbd: '2',
    svg: `<svg viewBox="0 0 24 24" class="w-[18px] h-[18px] stroke-accent stroke-[1.5] fill-none max-sm:w-5 max-sm:h-5"><path d="M4 6h10M8 10h12M4 14h10M8 18h12"/></svg>`,
  },
}

interface LayoutPickerProps {
  value: BeatId
  onChange: (beat: BeatId) => void
}

export function LayoutPicker({ value, onChange }: LayoutPickerProps) {
  return (
    <div class="flex gap-1">
      {(Object.keys(LAYOUT_ICONS) as BeatId[]).map(id => (
        <IconButton
          key={id}
          active={value === id}
          onClick={() => onChange(id)}
          title={LAYOUT_ICONS[id].label}
          kbd={LAYOUT_ICONS[id].kbd}
          svg={LAYOUT_ICONS[id].svg}
        />
      ))}
    </div>
  )
}
