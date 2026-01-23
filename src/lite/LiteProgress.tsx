interface LiteProgressProps {
  current: number
  total: number
}

const MAX_SEGMENTS = 200

export function LiteProgress({ current, total }: LiteProgressProps) {
  if (total <= 0) return null
  const segments = Math.min(total, MAX_SEGMENTS)
  const filledRatio = (current + 1) / total
  const filledCount = Math.round(filledRatio * segments)

  return (
    <div class="lite-progress">
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          class={`lite-progress-segment${i < filledCount ? ' filled' : ''}`}
        />
      ))}
    </div>
  )
}
