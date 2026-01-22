/** Pure sentence-index arithmetic — no side effects, no layout, no pan. */

export type SentenceNavResult = 'ok' | 'wrap'

export function computeNextIndex(
  current: number | null,
  count: number,
): { index: number; result: SentenceNavResult } {
  if (current === null) return { index: 0, result: 'ok' }
  if (current >= count - 1) return { index: current, result: 'wrap' }
  return { index: current + 1, result: 'ok' }
}

export function computePrevIndex(
  current: number | null,
  count: number,
): { index: number; result: SentenceNavResult } {
  if (current === null) return { index: Math.max(0, count - 1), result: 'ok' }
  if (current <= 0) return { index: 0, result: 'wrap' }
  return { index: current - 1, result: 'ok' }
}

export function computeLastIndex(count: number): number {
  return Math.max(0, count - 1)
}

export function clampIndex(index: number | null, count: number): number | null {
  if (index === null) return null
  return Math.max(0, Math.min(count - 1, index))
}
