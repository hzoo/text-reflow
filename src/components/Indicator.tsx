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
  text: string
  visible: boolean
  atEnd: boolean
}

export function CenterIndicator({ text, visible, atEnd }: CenterIndicatorProps) {
  return (
    <div
      class={`
        fixed bottom-8 left-1/2 -translate-x-1/2 z-[5]
        pointer-events-none
        transition-opacity duration-100
        max-sm:bottom-[60px]
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div
        class={`
          py-1.5 px-3.5
          bg-hud-bg border border-hud-border rounded-full
          text-xs text-accent
          backdrop-blur-xl shadow-hud
          ${atEnd ? 'bg-btn-hover' : ''}
        `}
      >
        {text}
      </div>
      {visible && !atEnd && (
        <div class="mt-1.5 text-center">
          <span class="text-[10px] text-hint">
            ↑↓ paragraphs · ←→ sentences
          </span>
        </div>
      )}
    </div>
  )
}
