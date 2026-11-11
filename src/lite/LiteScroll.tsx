import { useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { activeId$ } from '../state/library'
import { document$, globalSentence$, liteVariant$, setReadingSentence } from '../state/signals'
import type { Word } from '../syntaxExploder/document/types'

interface ParagraphData {
  paragraphIndex: number
  sentences: { sentenceIndex: number; text: string }[]
}

function buildParagraphs(wordsBySentence: Word[][]): ParagraphData[] {
  const paraMap = new Map<number, { sentenceIndex: number; text: string }[]>()

  for (let si = 0; si < wordsBySentence.length; si++) {
    const words = wordsBySentence[si]
    if (!words || words.length === 0) continue
    const paraIdx = words[0].paragraphIndex
    const text = words.map(w => w.displayText + (w.spaceAfter ? ' ' : '')).join('').trim()
    if (!paraMap.has(paraIdx)) paraMap.set(paraIdx, [])
    paraMap.get(paraIdx)!.push({ sentenceIndex: si, text })
  }

  const result: ParagraphData[] = []
  const sortedKeys = [...paraMap.keys()].sort((a, b) => a - b)
  for (const key of sortedKeys) {
    result.push({ paragraphIndex: key, sentences: paraMap.get(key)! })
  }
  return result
}

function sentenceAtReadingLine(
  spans: NodeListOf<HTMLElement>,
  active: HTMLElement,
  line: number,
): HTMLElement {
  const current = active.getBoundingClientRect()
  if (current.top <= line && line <= current.bottom) return active

  // Inline sentence spans are in document order. Their bottoms are nondecreasing.
  let start = 0
  let end = spans.length
  while (start < end) {
    const mid = Math.floor((start + end) / 2)
    if (spans[mid].getBoundingClientRect().bottom < line) start = mid + 1
    else end = mid
  }
  if (start === 0) return spans[0]
  if (start === spans.length) return spans[start - 1]

  const next = spans[start]
  const previous = spans[start - 1]
  const gapAfter = next.getBoundingClientRect().top - line
  const gapBefore = line - previous.getBoundingClientRect().bottom
  return gapAfter <= gapBefore ? next : previous
}

export function LiteScroll() {
  const containerRef = useRef<HTMLDivElement>(null)

  const doc = document$.value
  const entryId = activeId$.value
  const paragraphs = useMemo(() => buildParagraphs(doc.wordsBySentence), [doc])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const spans = container.querySelectorAll<HTMLElement>('[data-sentence]')
    if (!spans.length) {
      container.scrollTop = 0
      return
    }

    const initial = globalSentence$.peek() ?? 0
    let active = container.querySelector<HTMLElement>(`[data-sentence="${initial}"]`) ?? spans[0]
    const readingLine = () => container.getBoundingClientRect().top + container.clientTop + container.clientHeight / 2
    const bounds = active.getBoundingClientRect()
    container.scrollTop += (bounds.top + bounds.bottom) / 2 - readingLine()
    active.classList.add('active')

    // The browser can deliver a scroll event for restoration after this effect.
    let previousTop = container.scrollTop
    const onScroll = () => {
      const top = container.scrollTop
      if (top === previousTop) return
      previousTop = top
      if (liteVariant$.peek() !== 'scroll' || activeId$.peek() !== entryId || document$.peek() !== doc) return

      const atEnd = top >= container.scrollHeight - container.clientHeight - 1
      const next = top <= 0
        ? spans[0]
        : atEnd
          ? spans[spans.length - 1]
          : sentenceAtReadingLine(spans, active, readingLine())
      if (next === active) return

      active.classList.remove('active')
      active = next
      active.classList.add('active')
      setReadingSentence(Number(active.dataset.sentence))
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      active.classList.remove('active')
    }
  }, [doc, entryId])

  return (
    <div class="lite-scroll" ref={containerRef}>
      {paragraphs.map(para => (
        <p key={para.paragraphIndex}>
          {para.sentences.map(s => (
            <span
              key={s.sentenceIndex}
              data-sentence={s.sentenceIndex}
              class="lite-sentence"
            >
              {s.text}{' '}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}
