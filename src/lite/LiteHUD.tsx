import { liteMode$, liteVariant$, liteFitUnit$, controlsOpen$, activeTab$, PREFS_KEY } from '../state/signals'

export function LiteHUD() {
  const variant = liteVariant$.value
  const open = controlsOpen$.value

  return (
    <div class={`lite-hud${!open ? ' collapsed' : ''}`}>
      <button
        class={`lite-hud-btn${variant === 'poster' ? ' active' : ''}`}
        onClick={() => { liteVariant$.value = 'poster' }}
      >
        Poster
      </button>
      <button
        class={`lite-hud-btn${variant === 'scroll' ? ' active' : ''}`}
        onClick={() => { liteVariant$.value = 'scroll' }}
      >
        Scroll
      </button>
      {variant === 'poster' && (
        <>
          <button
            class={`lite-hud-btn${liteFitUnit$.value === 'sentence' ? ' active' : ''}`}
            onClick={() => { liteFitUnit$.value = 'sentence' }}
          >
            Sentence
          </button>
          <button
            class={`lite-hud-btn${liteFitUnit$.value === 'paragraph' ? ' active' : ''}`}
            onClick={() => { liteFitUnit$.value = 'paragraph' }}
          >
            Paragraph
          </button>
        </>
      )}
      <button
        class="lite-hud-btn"
        onClick={() => { 
          activeTab$.value = 'library'
          controlsOpen$.value = true 
        }}
      >
        Text
      </button>
      <button
        class="lite-hud-btn"
        onClick={() => {
          liteMode$.value = false
          try {
            const raw = localStorage.getItem(PREFS_KEY)
            const obj = raw ? JSON.parse(raw) : {}
            obj.liteMode = false
            localStorage.setItem(PREFS_KEY, JSON.stringify(obj))
          } catch {}
          location.reload()
        }}
      >
        Canvas
      </button>
    </div>
  )
}
