import { useRef, useEffect } from 'preact/hooks'
import { library$, activeId$, setActive, deleteEntry } from '../state/library'

type TabId = 'url' | 'text'
type StatusState = '' | 'loading' | 'error' | 'ok'

interface InputPanelProps {
  open: boolean
  tab: TabId
  onTabChange: (tab: TabId) => void
  onClose: () => void
  onLoadUrl: (url: string) => Promise<void>
  onSubmitText: (text: string) => void
}

export function InputPanel({ open, tab, onTabChange, onClose, onLoadUrl, onSubmitText }: InputPanelProps) {
  const urlRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        if (tab === 'url') urlRef.current?.focus()
        else textRef.current?.focus()
      })
    } else {
      urlRef.current?.blur()
      textRef.current?.blur()
    }
  }, [open, tab])

  const setStatus = (text: string, state: StatusState) => {
    if (statusRef.current) {
      statusRef.current.textContent = text
      statusRef.current.dataset.state = state
    }
  }

  const handleLoadUrl = async () => {
    if (loadingRef.current) return
    const raw = urlRef.current?.value || ''
    const normalized = normalizeUrl(raw)
    if (!normalized) {
      setStatus('Invalid URL.', 'error')
      return
    }

    setStatus('Loading...', 'loading')
    loadingRef.current = true

    try {
      await onLoadUrl(normalized)
      setStatus('Loaded.', 'ok')
      onClose()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load URL.', 'error')
    } finally {
      loadingRef.current = false
    }
  }

  const handleUrlKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleLoadUrl()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const handleTextKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      const text = textRef.current?.value.trim() || ''
      if (text) onSubmitText(text)
      onClose()
    }
  }

  return (
    <div
      class={`
        fixed bottom-0 left-0 right-0 z-40
        bg-hud-bg border-t border-hud-border
        backdrop-blur-xl shadow-hud
        p-4 px-6 pb-5
        transition-transform duration-100 ease-[cubic-bezier(0.2,0,0,1)]
        ${open ? 'translate-y-0' : 'translate-y-full'}
      `}
    >
      {/* Header */}
      <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 mb-3">
        <div class="text-[10px] tracking-[0.14em] uppercase text-muted font-semibold">
          Load
        </div>

        <div class="inline-flex items-center gap-1 bg-btn-bg rounded-full p-0.5 justify-self-start">
          <TabButton active={tab === 'url'} onClick={() => onTabChange('url')}>
            URL
          </TabButton>
          <TabButton active={tab === 'text'} onClick={() => onTabChange('text')}>
            Paste
          </TabButton>
        </div>

        <button
          type="button"
          onClick={onClose}
          class="w-7 h-7 border border-hud-border bg-btn-bg rounded-lg text-base leading-none cursor-pointer text-muted"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div class="flex flex-col gap-2.5">
        {/* URL pane */}
        <div class={tab === 'url' ? 'block' : 'hidden'}>
          <div class="flex gap-2.5 items-center mb-2.5">
            <input
              ref={urlRef}
              type="url"
              placeholder="paste a url..."
              autoComplete="off"
              onKeyDown={handleUrlKeyDown}
              class="
                flex-1 h-9 px-3
                border border-hud-border rounded-md
                bg-btn-bg text-accent text-[13px] font-inherit
                focus:outline-none focus:border-accent
              "
            />
            <button
              type="button"
              onClick={handleLoadUrl}
              class="
                h-9 px-3.5
                border border-hud-border rounded-md
                bg-btn-bg text-accent text-xs cursor-pointer
                hover:bg-btn-hover
                disabled:opacity-50 disabled:cursor-default
              "
            >
              Load
            </button>
          </div>
          <div
            ref={statusRef}
            class="text-[11px] text-muted min-h-4 mb-2 data-[state=error]:text-[#8b2f2f] data-[state=ok]:text-[#1d6a4b]"
          />
          <div class="text-[10px] text-muted">
            Enter to load · Esc to close
          </div>
        </div>

        {/* Text pane */}
        <div class={tab === 'text' ? 'block' : 'hidden'}>
          <textarea
            ref={textRef}
            placeholder="paste or type text..."
            onKeyDown={handleTextKeyDown}
            class="
              w-full h-[120px] p-3
              border border-hud-border rounded
              bg-btn-bg text-accent text-sm font-inherit leading-normal
              resize-y
              focus:outline-none focus:border-accent
              placeholder:text-hint
            "
          />
          <div class="mt-2 text-[10px] text-muted">
            Cmd+Enter to render · Esc to close
          </div>
        </div>
      </div>

      {/* Library chips */}
      {library$.value.length > 0 && (
        <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-hud-border">
          {library$.value.map(entry => {
            const isActive = entry.id === activeId$.value
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setActive(entry.id); onClose() }}
                class={`
                  group relative h-6 px-2.5 pr-6 text-[11px] rounded-full
                  border cursor-pointer transition-colors duration-75
                  truncate max-w-[160px]
                  ${isActive
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-btn-bg border-hud-border text-muted hover:text-accent hover:border-accent/30'}
                `}
              >
                {entry.title}
                <span
                  onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id) }}
                  class="absolute right-1.5 top-1/2 -translate-y-1/2
                    opacity-0 group-hover:opacity-100
                    text-muted hover:text-accent text-[13px] leading-none"
                >
                  ×
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`
        border-none bg-transparent text-muted text-xs
        py-1.5 px-3 rounded-full cursor-pointer
        transition-colors duration-100
        hover:bg-btn-hover
        ${active ? 'bg-btn-active text-accent shadow-[inset_0_0_0_1px_var(--color-hud-border)]' : ''}
      `}
    >
      {children}
    </button>
  )
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}
