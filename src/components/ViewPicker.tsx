import { Button } from './Button'

type ViewMode = 'full' | 'paragraph'

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'paragraph', label: 'Split' },
]

interface ViewPickerProps {
  value: ViewMode
  onChange: (view: ViewMode) => void
}

export function ViewPicker({ value, onChange }: ViewPickerProps) {
  return (
    <div class="flex gap-1 items-center">
      {VIEW_OPTIONS.map(({ id, label }) => (
        <Button
          key={id}
          active={value === id}
          onClick={() => onChange(id)}
          class="px-2.5 max-sm:min-h-11 max-sm:px-3.5 max-sm:text-[13px]"
        >
          {label}
        </Button>
      ))}
      <kbd class="text-[8px] text-hint opacity-50 ml-0.5 max-sm:hidden">V</kbd>
    </div>
  )
}
