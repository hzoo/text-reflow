interface ReadIndicatorProps {
  text: string
}

export function ReadIndicator({ text }: ReadIndicatorProps) {
  if (!text) return null

  return (
    <div
      class="
        fixed top-4 left-4 z-10
        py-1.5 px-3
        bg-hud-bg border border-hud-border rounded-lg
        text-[11px] font-medium text-accent
        backdrop-blur-xl shadow-hud
        max-sm:top-2.5 max-sm:left-2.5 max-sm:text-[10px] max-sm:py-1 max-sm:px-2
      "
    >
      {text}
    </div>
  )
}

interface CenterIndicatorProps {
  atEnd: boolean
}

export function CenterIndicator({ atEnd }: CenterIndicatorProps) {
  return (
    <div
      class="
        fixed bottom-8 left-1/2 -translate-x-1/2 z-[5]
        pointer-events-none
        max-sm:bottom-[60px]
      "
    >
      <div class="flex items-center gap-2">
        <div class="text-[10px] text-hint">↑↓</div>
        <div
          class={`
            py-1 px-3
            bg-hud-bg border border-hud-border rounded-full
            text-[11px] text-accent font-mono tabular-nums
            backdrop-blur-xl shadow-hud
            ${atEnd ? 'bg-btn-hover' : ''}
          `}
        >
          {atEnd ? '✓ end' : '—'}
        </div>
        <div class="text-[10px] text-hint">←→</div>
      </div>
      {atEnd && (
        <div class="mt-1 text-center text-[10px] text-hint">
          r to restart
        </div>
      )}
    </div>
  )
}
