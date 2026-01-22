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
  if (!active) return null

  return (
    <div
      class="
        fixed left-4 bottom-4 z-30
        max-w-[min(480px,calc(100vw-32px))] max-h-[45vh]
        overflow-auto
        bg-hud-bg border border-hud-border rounded-xl
        p-2.5 px-3
        text-[11px] leading-snug text-accent
        shadow-hud backdrop-blur-xl
        pointer-events-auto
      "
    >
      <Row label="mode" value={data.mode} />
      <Row label="view" value={data.view} />
      <Row label="para" value={`${data.paraIndex + 1}/${data.paraTotal}`} />
      <Row label="viewp" value={data.viewParaCount} />
      <Row label="sent" value={data.sentenceId ?? '—'} />
      <Row label="gsent" value={data.globalSentence ?? '—'} />
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
