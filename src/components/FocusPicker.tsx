import { Button } from './Button'
import type { FocusStyleId } from '../syntaxExploder/experiments'

const FOCUS_OPTIONS: { id: FocusStyleId; label: string }[] = [
  { id: 'gray', label: 'Dim' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'redact', label: 'Hide' },
  { id: 'none', label: 'Off' },
]

interface FocusPickerProps {
  value: FocusStyleId
  onChange: (focus: FocusStyleId) => void
}

export function FocusPicker({ value, onChange }: FocusPickerProps) {
  return (
    <div class="flex gap-1">
      {FOCUS_OPTIONS.map(({ id, label }) => (
        <Button
          key={id}
          active={value === id}
          onClick={() => onChange(id)}
          class="px-2.5 max-sm:min-h-11 max-sm:text-[13px]"
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
