/** Pure sentence-index arithmetic — no side effects, no layout, no pan. */

type SentenceStep = { result: 'ok'; index: number } | { result: 'wrap' }

export function computeNextIndex(
  current: number | null,
  count: number,
): SentenceStep {
  if (count <= 0) return { result: 'wrap' }
  if (current === null) return { index: 0, result: 'ok' }
  if (current >= count - 1) return { result: 'wrap' }
  return { index: current + 1, result: 'ok' }
}

export function computePrevIndex(
  current: number | null,
  count: number,
): SentenceStep {
  if (count <= 0) return { result: 'wrap' }
  if (current === null) return { index: count - 1, result: 'ok' }
  if (current <= 0) return { result: 'wrap' }
  return { index: current - 1, result: 'ok' }
}

export function computeLastIndex(count: number): number | null {
  return count > 0 ? count - 1 : null
}

export function clampIndex(index: number | null, count: number): number | null {
  if (index === null || count <= 0) return null
  return Math.max(0, Math.min(count - 1, index))
}
