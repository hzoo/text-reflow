import { useState, useRef, useEffect, useCallback } from 'preact/hooks'

interface DebugPanelProps {
  active: boolean
  data: {
    mode: string
    view: string
    paraIndex: number
    paraTotal: number
    viewParaCount: number
    sentenceId: number | null
    globalSentence: number | null
    paraId: number
    paraRange: string
    wordCount: number
    headingCount: number
    listCount: number
    footnoteCount: number
    fontSize: number
    source: string
    normalized: string
    paragraph: string
    viewPara: string
    plain: string
    headings: string[]
    listItems: string[]
    perfMetrics?: {
      updateWordColsMs: number
      applyScopeMs: number
      layoutMs: number
    }
  }
}

export function DebugPanel({ active, data }: DebugPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [dims, setDims] = useState({ w: 320, h: 480 })
  const isResizing = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current || !panelRef.current) return
    
    const rect = panelRef.current.getBoundingClientRect()
    // anchored at bottom-left, so:
    // new width = mouseX - rect.left
    // new height = rect.bottom - mouseY
    const newW = Math.max(160, e.clientX - rect.left)
    const newH = Math.max(100, rect.bottom - e.clientY)
    
    setDims({ w: newW, h: newH })
  }, [])

  const handleMouseUp = useCallback(() => {
    isResizing.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  if (!active) return null

  return (
    <div
      ref={panelRef}
      style={collapsed ? {} : { width: dims.w, height: dims.h }}
      class={`
        fixed left-4 bottom-4 z-30
        min-w-[120px] max-w-[min(800px,calc(100vw-32px))]
        ${collapsed ? 'h-auto overflow-hidden' : 'max-h-[90vh] overflow-hidden'}
        bg-hud-bg border border-hud-border rounded-xl
        shadow-hud
        pointer-events-auto
        flex flex-col
      `}
    >
      <div 
        class="relative p-2 px-3 flex items-center justify-between cursor-pointer hover:bg-btn-hover transition-colors select-none border-b border-hud-border/50"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div class="font-bold text-[9px] uppercase tracking-widest text-muted">Debug Info</div>
        <div class="flex items-center gap-3">
          <div class="text-[10px] text-muted">{collapsed ? 'Expand' : 'Collapse'}</div>
          {!collapsed && (
            <div 
              class="w-4 h-4 flex items-center justify-center cursor-nesw-resize opacity-50 hover:opacity-100 transition-opacity"
              onMouseDown={handleMouseDown}
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </div>
          )}
        </div>
      </div>
      
      {!collapsed && (
        <div data-native-scroll="true" class="flex-1 overflow-auto p-2.5 px-3 text-[11px] leading-snug text-accent">
          <Row label="mode" value={data.mode} />
          <Row label="view" value={data.view} />
          <Row label="para" value={`${data.paraIndex + 1}/${data.paraTotal}`} />
          <Row label="viewp" value={data.viewParaCount} />
          <Row label="sent" value={data.sentenceId ?? '—'} />
          <Row label="gsent" value={data.globalSentence ?? '—'} />
          <Row label="size" value={data.fontSize} />
          <Row label="pid" value={data.paraId} />
          <Row label="rows" value={data.paraRange} />
          <Row label="words" value={data.wordCount} />
          <Row label="heads" value={data.headingCount} />
          <Row label="lists" value={data.listCount} />
          <Row label="fn" value={data.footnoteCount} />

          {data.perfMetrics && (
            <div class="mt-2 pt-2 border-t border-hud-border">
              <div class="font-semibold text-muted mb-1">perf (ms)</div>
              <Row label="layout" value={data.perfMetrics.layoutMs.toFixed(2)} />
              <Row label="wordCol" value={data.perfMetrics.updateWordColsMs.toFixed(2)} />
              <Row label="scope" value={data.perfMetrics.applyScopeMs.toFixed(2)} />
            </div>
          )}

          <Block label="source" content={data.source} />
          <Block label="normalized" content={data.normalized} />
          <Block label="paragraph" content={data.paragraph} />
          <Block label="view" content={data.viewPara} />
          <Block label="plain" content={data.plain} />
          <Block label="headings" content={data.headings.join('\n')} />
          <Block label="list items" content={data.listItems.join('\n')} />
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <strong class="inline-block min-w-[46px] text-muted">{label}</strong>
      {value}
    </div>
  )
}

function Block({ label, content }: { label: string; content: string }) {
  return (
    <div class="mt-2">
      <div class="font-semibold text-muted mb-1">{label}</div>
      <pre class="m-0 whitespace-pre-wrap break-words font-mono text-inherit">
        {content}
      </pre>
    </div>
  )
}
