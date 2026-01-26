import { useRef } from 'preact/hooks'
import { 
  controlsOpen$, 
  activeTab$, 
  type TabId,
  beat$,
  focusStyle$,
  viewMode$,
  fontSize$,
  maxWidth$,
  motionPreset$,
  fullPush$,
  isAutoFont$,
  debug$,
  READER_FONT,
  isMobile
} from '../state/signals'
import { library$, activeId$, setActive, deleteEntry, fetchUrlToEntry } from '../state/library'
import { LayoutPicker } from './LayoutPicker'
import { FocusPicker } from './FocusPicker'
import { ViewPicker } from './ViewPicker'
import { Scrubber } from './Scrubber'
import { Button } from './Button'

export function ControlPanel() {
  const isOpen = controlsOpen$.value
  const activeTab = activeTab$.value
  const urlRef = useRef<HTMLInputElement>(null)
  const mobile = isMobile()

  const handleLoadUrl = async () => {
    const url = urlRef.current?.value.trim()
    if (!url) return
    try {
      await fetchUrlToEntry(url)
      urlRef.current!.value = ''
      controlsOpen$.value = false
    } catch (err) {
      console.error(err)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => { controlsOpen$.value = true }}
        class={`
          fixed z-50 w-11 h-11 rounded-full 
          bg-hud-bg border border-hud-border/20 shadow-hud 
          flex items-center justify-center text-accent/60 hover:text-accent
          transition-all active:scale-95
          ${mobile ? 'bottom-6 right-6' : 'top-8 right-8'}
        `}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round">
          <line x1="4" y1="8" x2="20" y2="8" />
          <line x1="4" y1="16" x2="20" y2="16" />
        </svg>
      </button>
    )
  }

  return (
    <>
      <div 
        class="fixed inset-0 z-40 bg-black/5 sm:hidden" 
        onClick={() => { controlsOpen$.value = false }}
      />
      <div
        class={`
          fixed z-50 flex flex-col
          bg-hud-bg border border-hud-border shadow-hud
          transition-all duration-300 ease-out
          ${mobile 
            ? 'bottom-0 left-0 right-0 rounded-t-[32px] max-h-[85vh]' 
            : 'top-8 right-8 w-[360px] rounded-[32px] max-h-[calc(100vh-64px)]'}
        `}
      >
        {/* Tab Header */}
        <div class="flex items-center justify-between p-3 border-b border-hud-border/5">
          <div class="flex gap-2 p-1 ml-1">
            <TabButton id="style" label="Style" />
            <TabButton id="library" label="History" />
          </div>
          <button 
            onClick={() => { controlsOpen$.value = false }}
            class="w-8 h-8 mr-2 flex items-center justify-center text-muted hover:text-accent transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-auto p-6 custom-scrollbar">
          {activeTab === 'style' && <StyleTab />}
          {activeTab === 'library' && <HistoryTab urlRef={urlRef} onLoadUrl={handleLoadUrl} />}
        </div>

        {/* Footer */}
        <div class="p-4 border-t border-hud-border/5 flex items-center justify-between px-6 bg-btn-bg/10">
          <div class="flex gap-4">
            <FooterToggle 
              label="Debug" 
              active={debug$.value} 
              onClick={() => { debug$.value = !debug$.value }} 
            />
            <FooterToggle 
              label="Spread" 
              kbd="F"
              active={fullPush$.value} 
              onClick={() => { fullPush$.value = !fullPush$.value }} 
            />
          </div>
          <div class="text-[11px] text-muted/80 font-medium italic" style={{ fontFamily: READER_FONT }}>
            Esc to close
          </div>
        </div>
      </div>
    </>
  )
}

function TabButton({ id, label }: { id: TabId; label: string }) {
  const active = activeTab$.value === id
  return (
    <button
      onClick={() => { activeTab$.value = id }}
      class={`
        px-5 py-1.5 rounded-full text-[14px] font-bold transition-all duration-200
        ${active 
          ? 'bg-accent text-bg shadow-md scale-[0.98]' 
          : 'text-muted hover:text-accent hover:bg-btn-bg/60'}
      `}
      style={{ fontFamily: READER_FONT }}
    >
      {label}
    </button>
  )
}

function StyleTab() {
  return (
    <div class="flex flex-col gap-6">
      <section class="grid grid-cols-2 gap-4 items-end">
        <div class="flex flex-col gap-2">
          <Label kbd="1/2">Layout</Label>
          <div class="bg-btn-bg/80 p-1.5 rounded-xl flex justify-center border border-hud-border/10 shadow-inset">
            <LayoutPicker value={beat$.value} onChange={(v) => { beat$.value = v }} />
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label kbd="V">View</Label>
          <div class="bg-btn-bg/80 p-1.5 rounded-xl flex justify-center border border-hud-border/10 shadow-inset">
            <ViewPicker value={viewMode$.value} onChange={(v) => { viewMode$.value = v }} />
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <Label kbd="F">Focus Style</Label>
        <div class="bg-btn-bg/80 p-1.5 rounded-xl border border-hud-border/10 shadow-inset">
          <FocusPicker value={focusStyle$.value} onChange={(v) => { focusStyle$.value = v }} />
        </div>
      </section>

      <section class="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <ScrubberGroup label="Size" kbd="-/=" centered>
          <Scrubber min={10} max={128} step={1} value={fontSize$.value} defaultValue={18} onChange={(v) => { fontSize$.value = v }} />
        </ScrubberGroup>
        <ScrubberGroup label="Width" centered>
          <Scrubber min={200} max={4000} step={50} value={maxWidth$.value} defaultValue={720} onChange={(v) => { maxWidth$.value = v }} />
        </ScrubberGroup>
        <div class="flex flex-col gap-2 items-center">
          <span class="text-[11px] font-bold text-muted/80 text-center italic" style={{ fontFamily: READER_FONT }}>Auto</span>
          <button
            onClick={() => { isAutoFont$.value = !isAutoFont$.value }}
            class={`w-10 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
              isAutoFont$.value
                ? 'bg-accent border-accent text-bg shadow-md'
                : 'bg-btn-bg border-hud-border text-muted hover:border-accent/30 shadow-inset'
            }`}
            title="Auto Fit Font"
          >
            <div class={`w-2.5 h-2.5 rounded-full transition-all ${isAutoFont$.value ? 'bg-bg' : 'bg-muted/30'}`} />
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <Label>Motion</Label>
        <div class="grid grid-cols-4 gap-1.5 w-full bg-btn-bg/80 p-1.5 rounded-xl border border-hud-border/10 shadow-inset">
          {(['fluid', 'natural', 'snappy', 'instant'] as const).map(id => (
            <button
              key={id}
              onClick={() => { motionPreset$.value = id }}
              class={`h-7 rounded-lg text-[11px] font-bold capitalize transition-all duration-200 ${
                motionPreset$.value === id
                  ? 'bg-accent text-bg shadow-sm scale-[0.98]'
                  : 'text-muted hover:text-accent hover:bg-btn-bg'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function HistoryTab({ urlRef, onLoadUrl }: any) {
  const entries = library$.value
  const activeId = activeId$.value

  return (
    <div class="flex flex-col h-[440px]">
      <div class="flex-1 overflow-auto pr-1 custom-scrollbar flex flex-col gap-3">
        {entries.map(entry => (
          <div 
            key={entry.id}
            onClick={() => { setActive(entry.id); controlsOpen$.value = false }}
            class={`
              group flex flex-col p-4 rounded-2xl border transition-all cursor-pointer
              ${entry.id === activeId 
                ? 'bg-accent/5 border-accent/20 shadow-sm' 
                : 'bg-btn-bg/20 border-transparent hover:border-accent/10 hover:bg-btn-bg/40'}
            `}
          >
            <div class="flex items-start justify-between gap-3">
              <div 
                class="flex-1 text-[15px] leading-tight font-medium text-accent line-clamp-2"
                style={{ fontFamily: READER_FONT }}
              >
                {entry.title}
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id) }}
                class="opacity-0 group-hover:opacity-100 p-1 -m-1 text-muted hover:text-red-400 transition-opacity"
              >
                ×
              </button>
            </div>
            {entry.source && (
              <div class="mt-1.5 text-[10px] font-mono text-muted/60 truncate tracking-wide">
                {new URL(entry.source).hostname.replace(/^www\./, '')}
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <div class="py-12 text-center text-muted text-xs italic opacity-40">
            Empty history
          </div>
        )}
      </div>

      <div class="mt-4 pt-6 border-t border-hud-border/5 flex flex-col gap-3">
        <Label kbd="I">Load Article</Label>
        <div class="flex gap-2">
          <input
            ref={urlRef}
            type="url"
            placeholder="Paste URL..."
            onKeyDown={(e) => e.key === 'Enter' && onLoadUrl()}
            class="flex-1 h-10 px-4 bg-btn-bg/40 border border-hud-border/10 rounded-2xl text-accent text-sm focus:outline-none focus:border-accent/20 placeholder:text-muted/40 transition-all"
          />
          <Button onClick={onLoadUrl} class="h-10 px-5 rounded-2xl bg-accent/10 text-accent font-bold border-none hover:bg-accent hover:text-bg">Load</Button>
        </div>
        <div class="text-[10px] text-muted/40 px-1 italic">
          Paste URLs or text anywhere to load. Fetches via{' '}
          <a
            class="underline decoration-muted/30 hover:decoration-accent/40 hover:text-accent transition-colors"
            href="https://jina.ai/reader/"
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
          >
            Jina Reader
          </a>
          .
        </div>
      </div>
    </div>
  )
}

function Label({ children, kbd }: { children: any; kbd?: string }) {
  return (
    <div class="flex items-center gap-2 px-0.5">
      <span class="text-[13px] font-bold text-accent italic opacity-80" style={{ fontFamily: READER_FONT }}>{children}</span>
      {kbd && (
        <span class="text-[9px] font-mono text-accent/40 font-black bg-btn-bg px-1.5 rounded uppercase tracking-tighter">
          {kbd}
        </span>
      )}
    </div>
  )
}

function ScrubberGroup({ label, children, kbd, centered }: { label: string; children: any; kbd?: string; centered?: boolean }) {
  return (
    <div class="flex flex-col gap-2 flex-1">
      <div class={`flex items-center gap-1.5 px-0.5 ${centered ? 'justify-center' : 'justify-between'}`}>
        <span class="text-[12px] font-bold text-accent italic opacity-70" style={{ fontFamily: READER_FONT }}>{label}</span>
        {kbd && (
          <div class="flex gap-1 opacity-30">
            <span class="text-[9px] font-mono font-black bg-btn-bg px-1.5 rounded text-accent">[{kbd}]</span>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function FooterToggle({ label, active, onClick, kbd }: { label: string; active: boolean; onClick: () => void; kbd?: string }) {
  return (
    <button 
      onClick={onClick}
      class={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200
        ${active 
          ? 'bg-accent text-bg shadow-md scale-[0.98]' 
          : 'text-accent/70 hover:text-accent bg-btn-bg hover:bg-btn-hover/80'}
      `}
      style={{ fontFamily: READER_FONT }}
    >
      {label}
      {kbd && <span class={`font-mono font-black opacity-40 text-[9px] tracking-tighter`}>{kbd}</span>}
    </button>
  )
}
