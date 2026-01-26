import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { addEntry, fetchUrlToEntry } from '../state/library'

export interface PasteToastData {
  kind: 'url' | 'text'
  value: string
  preview: string
}

export const pasteToast$ = signal<PasteToastData | null>(null)
export const loadingUrl$ = signal<string | null>(null)

export function PasteToast() {
  const data = pasteToast$.value
  const loadingUrl = loadingUrl$.value

  useEffect(() => {
    if (!data) return
    const timer = setTimeout(() => { pasteToast$.value = null }, 5000)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirm(data)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        pasteToast$.value = null
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKey)
    }
  }, [data])

  // Show loading toast
  if (loadingUrl) {
    let hostname = loadingUrl
    try { hostname = new URL(loadingUrl).hostname.replace(/^www\./, '') } catch {}
    return (
      <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50
        bg-hud-bg border border-hud-border backdrop-blur-xl
        rounded-lg shadow-hud px-4 py-2.5
        flex items-center gap-3 max-w-[90vw]
        animate-[slideDown_150ms_ease-out]"
      >
        <div class="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <span class="text-[13px] text-accent truncate max-w-[240px]">
          Loading {hostname}...
        </span>
      </div>
    )
  }

  if (!data) return null

  return (
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50
      bg-hud-bg border border-hud-border backdrop-blur-xl
      rounded-lg shadow-hud px-4 py-2.5
      flex items-center gap-3 max-w-[90vw]
      animate-[slideDown_150ms_ease-out]"
    >
      <span class="text-[10px] uppercase tracking-wider text-muted font-semibold shrink-0">
        {data.kind === 'url' ? 'URL' : 'Text'}
      </span>
      <span class="text-[13px] text-accent truncate max-w-[240px]">
        {data.preview}
      </span>
      <div class="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => confirm(data)}
          class="h-6 px-2 text-[11px] rounded border border-hud-border
            bg-btn-bg text-accent cursor-pointer hover:bg-btn-hover"
        >
          Load
        </button>
        <button
          type="button"
          onClick={() => { pasteToast$.value = null }}
          class="h-6 px-2 text-[11px] rounded border border-hud-border
            bg-btn-bg text-muted cursor-pointer hover:bg-btn-hover"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function confirm(data: PasteToastData) {
  pasteToast$.value = null
  if (data.kind === 'url') {
    loadingUrl$.value = data.value
    fetchUrlToEntry(data.value)
      .finally(() => { loadingUrl$.value = null })
  } else {
    addEntry({ content: data.value, isMarkdown: false })
  }
}
