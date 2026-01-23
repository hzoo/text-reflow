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
  moveSpeed$,
  panSpeed$,
  focusSpeed$,
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
          fixed z-50 w-12 h-12 rounded-full 
          bg-hud-bg border border-hud-border shadow-lg
          flex items-center justify-center text-accent text-xl
          transition-transform active:scale-95
          ${mobile ? 'bottom-6 right-6' : 'top-8 right-8'}
        `}
      >
        ≡
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
          bg-hud-bg border border-hud-border shadow-2xl
          transition-all duration-200 ease-out
          ${mobile 
            ? 'bottom-0 left-0 right-0 rounded-t-3xl max-h-[85vh]' 
            : 'top-8 right-8 w-[380px] rounded-2xl max-h-[calc(100vh-64px)]'}
        `}
      >
        {/* Tab Header */}
        <div class="flex items-center justify-between p-2 border-b border-hud-border/10">
          <div class="flex gap-1 bg-btn-bg/50 p-1 rounded-xl ml-1">
            <TabButton id="style" label="Style" />
            <TabButton id="library" label="History" />
          </div>
          <button 
            onClick={() => { controlsOpen$.value = false }}
            class="w-8 h-8 flex items-center justify-center text-muted hover:text-accent transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-auto p-5 custom-scrollbar">
          {activeTab === 'style' && <StyleTab />}
          {activeTab === 'library' && <HistoryTab urlRef={urlRef} onLoadUrl={handleLoadUrl} />}
        </div>

        {/* Footer */}
        <div class="p-3 border-t border-hud-border/10 flex items-center justify-between px-5 bg-btn-bg/10">
          <div class="flex gap-5">
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
          <div class="text-[10px] text-accent/60 font-black uppercase tracking-widest">
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
        px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all
        ${active 
          ? 'bg-hud-bg text-accent shadow-sm' 
          : 'text-muted hover:text-accent/70'}
      `}
    >
      {label}
    </button>
  )
}

function StyleTab() {
  return (
    <div class="flex flex-col gap-4">
      <section class="grid grid-cols-2 gap-3 items-end">
        <div class="flex flex-col gap-1.5">
          <Label kbd="1/2">Layout</Label>
          <div class="bg-btn-bg/20 p-1.5 rounded-xl border border-hud-border/10 flex justify-center">
            <LayoutPicker value={beat$.value} onChange={(v) => { beat$.value = v }} />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label kbd="V">View</Label>
          <div class="bg-btn-bg/20 p-1.5 rounded-xl border border-hud-border/10 flex justify-center">
            <ViewPicker value={viewMode$.value} onChange={(v) => { viewMode$.value = v }} />
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-1.5">
        <Label kbd="F">Focus Style</Label>
        <div class="bg-btn-bg/20 p-1.5 rounded-xl border border-hud-border/10">
          <FocusPicker value={focusStyle$.value} onChange={(v) => { focusStyle$.value = v }} />
        </div>
      </section>

      <section class="grid grid-cols-[1fr_1fr_auto] gap-3 items-end pt-1 border-t border-hud-border/5">
        <ScrubberGroup label="SIZE" kbd="-/=" centered>
          <Scrubber min={10} max={128} step={1} value={fontSize$.value} defaultValue={18} onChange={(v) => { fontSize$.value = v }} />
        </ScrubberGroup>
        <ScrubberGroup label="WIDTH" centered>
          <Scrubber min={200} max={4000} step={50} value={maxWidth$.value} defaultValue={720} onChange={(v) => { maxWidth$.value = v }} />
        </ScrubberGroup>
        <div class="flex flex-col gap-1.5">
          <span class="text-[9px] uppercase tracking-wider text-accent/80 font-black text-center">AUTO</span>
          <button
            onClick={() => { isAutoFont$.value = !isAutoFont$.value }}
            class={`w-10 h-7 rounded-full border transition-all flex items-center justify-center shadow-sm ${
              isAutoFont$.value
                ? 'bg-accent border-accent text-bg ring-2 ring-accent/20'
                : 'bg-btn-bg border-accent/40 text-accent'
            }`}
            title="Auto Fit Font"
          >
            <div class={`w-2.5 h-2.5 rounded-full shadow-inner transition-transform duration-200 ${isAutoFont$.value ? 'bg-bg scale-110' : 'bg-accent/10 border border-accent/20'}`} />
          </button>
        </div>
      </section>

      <section class="grid grid-cols-3 gap-2 items-end pt-1 border-t border-hud-border/5">
        <ScrubberGroup label="MOVE" centered>
          <Scrubber min={0.2} max={3} step={0.1} value={moveSpeed$.value} defaultValue={1} onChange={(v) => { moveSpeed$.value = v }} />
        </ScrubberGroup>
        <ScrubberGroup label="PAN" centered>
          <Scrubber min={0.2} max={3} step={0.1} value={panSpeed$.value} defaultValue={1} onChange={(v) => { panSpeed$.value = v }} />
        </ScrubberGroup>
        <ScrubberGroup label="FOCUS" centered>
          <Scrubber min={0.2} max={3} step={0.1} value={focusSpeed$.value} defaultValue={1} onChange={(v) => { focusSpeed$.value = v }} />
        </ScrubberGroup>
      </section>
    </div>
  )
}

function HistoryTab({ urlRef, onLoadUrl }: any) {
  const entries = library$.value
  const activeId = activeId$.value

  return (
    <div class="flex flex-col h-[420px]">
      <div class="flex-1 overflow-auto pr-1 custom-scrollbar flex flex-col gap-2">
        {entries.map(entry => (
          <div 
            key={entry.id}
            onClick={() => { setActive(entry.id); controlsOpen$.value = false }}
            class={`
              group flex flex-col p-3 rounded-xl border transition-all cursor-pointer
              ${entry.id === activeId 
                ? 'bg-accent/10 border-accent/30' 
                : 'bg-btn-bg/20 border-transparent hover:border-hud-border/30 hover:bg-btn-bg/40'}
            `}
          >
            <div class="flex items-start justify-between gap-3">
              <div 
                class="flex-1 text-[14px] leading-tight font-bold text-accent line-clamp-2"
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
              <div class="mt-1 text-[10px] font-mono text-muted truncate opacity-50">
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

      <div class="mt-4 pt-5 border-t border-hud-border/10 flex flex-col gap-3">
        <Label kbd="I">Load Article</Label>
        <div class="flex gap-2">
          <input
            ref={urlRef}
            type="url"
            placeholder="Paste URL..."
            onKeyDown={(e) => e.key === 'Enter' && onLoadUrl()}
            class="flex-1 h-10 px-3 bg-btn-bg/40 border border-hud-border/20 rounded-xl text-accent text-sm focus:outline-none focus:border-accent/30 placeholder:text-muted/50"
          />
          <Button onClick={onLoadUrl} class="h-10 px-4 rounded-xl bg-accent text-bg font-bold border-none">Load</Button>
        </div>
        <div class="text-[9px] text-muted/50 px-1 italic">
          Tip: Paste URLs or text anywhere to load.
        </div>
      </div>
    </div>
  )
}

function Label({ children, kbd }: { children: any; kbd?: string }) {
  return (
    <div class="flex items-center gap-1.5 px-0.5">
      <span class="text-[9px] uppercase tracking-[0.15em] text-accent font-black opacity-90">{children}</span>
      {kbd && (
        <span class="text-[8px] font-mono text-accent font-bold bg-accent/10 px-1 rounded">
          {kbd}
        </span>
      )}
    </div>
  )
}

function ScrubberGroup({ label, children, kbd, centered }: { label: string; children: any; kbd?: string; centered?: boolean }) {
  return (
    <div class="flex flex-col gap-1.5 flex-1">
      <div class={`flex items-center gap-1 px-0.5 ${centered ? 'justify-center' : 'justify-between'}`}>
        <span class="text-[9px] uppercase tracking-wider text-accent/80 font-black">{label}</span>
        {kbd && (
          <div class="flex gap-1">
            <span class="text-[8px] font-mono font-bold bg-accent/10 px-1 rounded text-accent">{kbd}</span>
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
        flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors
        ${active ? 'text-accent' : 'text-accent/50 hover:text-accent'}
      `}
    >
      {label}
      {kbd && <span class="opacity-40 text-[9px] font-mono font-bold">{kbd}</span>}
    </button>
  )
}
