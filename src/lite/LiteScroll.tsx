import { useEffect, useRef } from 'preact/hooks'
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

  const doc = document$.value
  const paragraphs = buildParagraphs(doc.wordsBySentence)
  const activeSentence = globalSentence$.value ?? 0

  useEffect(() => {
    // Enable native scroll
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

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const si = Number(entry.target.getAttribute('data-sentence'))
            if (!isNaN(si)) globalSentence$.value = si
          }
        }
      },
      { rootMargin: '-40% 0px -40% 0px' }
    )

    const spans = container.querySelectorAll('[data-sentence]')
    spans.forEach(el => observerRef.current!.observe(el))

    return () => {
      observerRef.current?.disconnect()
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
              class={`lite-sentence${s.sentenceIndex === activeSentence ? ' active' : ''}`}
            >
              {s.text}{' '}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}
