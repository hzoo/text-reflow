interface LiteProgressProps {
  current: number
  total: number
}

export function LiteProgress({ current, total }: LiteProgressProps) {
  if (total <= 0) return null
  const clamped = Math.max(0, Math.min(current + 1, total))
  const pct = (clamped / total) * 100

  return (
    <div class="lite-progress">
      <div class="lite-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
