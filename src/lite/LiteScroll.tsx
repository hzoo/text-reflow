import { useEffect, useMemo, useRef } from 'preact/hooks'
import { document$, globalSentence$ } from '../state/signals'
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

export function LiteScroll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const prevActiveRef = useRef<HTMLElement | null>(null)

  const doc = document$.value
  const paragraphs = useMemo(() => buildParagraphs(doc.wordsBySentence), [doc])

  useEffect(() => {
    document.body.style.overflow = 'auto'
    document.body.style.overscrollBehavior = 'auto'
    return () => {
      document.body.style.overflow = 'hidden'
      document.body.style.overscrollBehavior = 'none'
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const spans = container.querySelectorAll<HTMLElement>('[data-sentence]')

    // Apply initial active state from persisted signal
    const initial = globalSentence$.peek() ?? 0
    for (const span of spans) {
      if (Number(span.getAttribute('data-sentence')) === initial) {
        span.classList.add('active')
        prevActiveRef.current = span
        break
      }
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
            best = entry
          }
        }
        if (!best) return

        const target = best.target as HTMLElement
        if (target === prevActiveRef.current) return

        prevActiveRef.current?.classList.remove('active')
        target.classList.add('active')
        prevActiveRef.current = target

        const si = Number(target.getAttribute('data-sentence'))
        if (!isNaN(si)) globalSentence$.value = si
      },
      { rootMargin: '-40% 0px -40% 0px' }
    )

    spans.forEach(el => observerRef.current!.observe(el))

    return () => {
      observerRef.current?.disconnect()
      prevActiveRef.current = null
    }
  }, [doc])

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
