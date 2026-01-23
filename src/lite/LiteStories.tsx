import { useCallback } from 'preact/hooks'
import { document$, globalSentence$, controlsOpen$ } from '../state/signals'
import { LiteProgress } from './LiteProgress'

function sentenceText(sentenceIndex: number): string {
  const doc = document$.value
  const words = doc.wordsBySentence[sentenceIndex]
  if (!words || words.length === 0) return ''
  return words.map(w => w.displayText + (w.spaceAfter ? ' ' : '')).join('').trim()
}

export function LiteStories() {
  const doc = document$.value
  const total = doc.sentenceCount
  const current = globalSentence$.value ?? 0
  const text = sentenceText(current)

  const handleTap = useCallback((e: MouseEvent) => {
    const x = e.clientX
    const w = window.innerWidth
    const third = w / 3

    if (x < third) {
      // Left third → prev
      const cur = globalSentence$.value ?? 0
      if (cur > 0) globalSentence$.value = cur - 1
    } else if (x > w - third) {
      // Right third → next
      const cur = globalSentence$.value ?? 0
      const max = document$.value.sentenceCount - 1
      if (cur < max) globalSentence$.value = cur + 1
    } else {
      // Center → toggle HUD
      controlsOpen$.value = !controlsOpen$.value
    }
  }, [])

  return (
    <div class="lite-stories" onClick={handleTap}>
      <LiteProgress current={current} total={total} />
      <div class="lite-stories-text">{text}</div>
    </div>
  )
}
