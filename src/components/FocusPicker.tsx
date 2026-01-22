import { Button } from './Button'
import type { FocusStyleId } from '../syntaxExploder/experiments'

const FOCUS_OPTIONS: { id: FocusStyleId; label: string }[] = [
  { id: 'gray', label: 'Dim' },
  { id: 'redact', label: 'Hide' },
  { id: 'none', label: 'Off' },
]

interface FocusPickerProps {
  value: FocusStyleId
  onChange: (focus: FocusStyleId) => void
}

export function FocusPicker({ value, onChange }: FocusPickerProps) {
  return (
    <div class="flex items-center">
      {FOCUS_OPTIONS.map(({ id, label }) => (
        <Button
          key={id}
          active={value === id}
          onClick={() => onChange(id)}
          class="px-2 max-sm:min-h-11 max-sm:text-[13px]"
        >
          {label}
        </Button>
      ))}
      <kbd class="text-[8px] text-hint opacity-50 ml-0.5 max-sm:hidden">F</kbd>
    </div>
  )
}
