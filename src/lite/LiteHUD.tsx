import { liteMode$, liteVariant$, hudCollapsed$, inputMode$, PREFS_KEY } from '../state/signals'

export function LiteHUD() {
  const variant = liteVariant$.value
  const collapsed = hudCollapsed$.value

  return (
    <div class={`lite-hud${collapsed ? ' collapsed' : ''}`}>
      <button
        class={`lite-hud-btn${variant === 'stories' ? ' active' : ''}`}
        onClick={() => { liteVariant$.value = 'stories' }}
      >
        Stories
      </button>
      <button
        class={`lite-hud-btn${variant === 'scroll' ? ' active' : ''}`}
        onClick={() => { liteVariant$.value = 'scroll' }}
      >
        Scroll
      </button>
      <button
        class="lite-hud-btn"
        onClick={() => { inputMode$.value = true }}
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
