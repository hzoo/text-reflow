import { useCallback, useEffect, useState } from 'preact/hooks'
import { LiteProgress } from './LiteProgress'
import { fitPosterLayout, type PosterLayout } from './poster-layout'
import {
  controlsOpen$,
  document$,
  globalSentence$,
  liteFitUnit$,
  litePosterAlign$,
  mapSentenceToParagraph,
  getSentenceOffset,
} from '../state/signals'

const FIT_GUTTER_PX = 8

function px(style: CSSStyleDeclaration, key: string): number {
  const v = Number.parseFloat(style.getPropertyValue(key))
  return Number.isFinite(v) ? v : 0
}

function getSentenceWords(index: number) {
  return document$.value.wordsBySentence[index] || []
}

function getParagraphWords(index: number) {
  return document$.value.wordsByParagraph[index] || []
}

function getParagraphIndex(sentenceIndex: number): number {
  return mapSentenceToParagraph(sentenceIndex, document$.value.sentenceCounts).paragraphIndex
}

export function LitePoster() {
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<PosterLayout | null>(null)

  const unit = liteFitUnit$.value
  const align = litePosterAlign$.value
  const currentSentence = globalSentence$.value ?? 0
  const currentParagraph = getParagraphIndex(currentSentence)
  const current = unit === 'paragraph' ? currentParagraph : currentSentence
  const total = unit === 'paragraph' ? document$.value.paragraphs.length : document$.value.sentenceCount
  const words = unit === 'paragraph' ? getParagraphWords(currentParagraph) : getSentenceWords(currentSentence)

  const moveBy = useCallback((delta: number) => {
    if (unit === 'paragraph') {
      const nextParagraph = Math.max(0, Math.min(currentParagraph + delta, document$.value.paragraphs.length - 1))
      globalSentence$.value = getSentenceOffset(document$.value.sentenceCounts, nextParagraph)
      return
    }
    const nextSentence = Math.max(0, Math.min(currentSentence + delta, document$.value.sentenceCount - 1))
    globalSentence$.value = nextSentence
  }, [currentParagraph, currentSentence, unit])

  const handleTap = useCallback((e: MouseEvent) => {
    const x = e.clientX
    const w = window.innerWidth
    const third = w / 3
    if (x < third) {
      moveBy(-1)
    } else if (x > w - third) {
      moveBy(1)
    } else {
      controlsOpen$.value = !controlsOpen$.value
    }
  }, [moveBy])

  const computeLayout = useCallback(() => {
    if (!rootEl) return
    const style = window.getComputedStyle(rootEl)
    const padX = px(style, 'padding-left') + px(style, 'padding-right')
    const padY = px(style, 'padding-top') + px(style, 'padding-bottom')
    const maxW = Math.max(120, rootEl.clientWidth - padX - FIT_GUTTER_PX * 2)
    const maxH = Math.max(120, rootEl.clientHeight - padY - FIT_GUTTER_PX * 2)
    setLayout(fitPosterLayout(words, maxW, maxH))
  }, [rootEl, words])

  useEffect(() => {
    computeLayout()
  }, [computeLayout, current, unit])

  useEffect(() => {
    if (!rootEl) return
    const ro = new ResizeObserver(() => computeLayout())
    ro.observe(rootEl)
    window.addEventListener('resize', computeLayout)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', computeLayout)
    }
  }, [computeLayout, rootEl])

  return (
    <div ref={setRootEl} class="lite-poster" onClick={handleTap}>
      <LiteProgress current={current} total={total} />
      <div class="lite-poster-meta">
        <span>{unit === 'paragraph' ? 'Paragraph' : 'Sentence'}</span>
        <span>{current + 1}/{Math.max(1, total)}</span>
        <span>{layout?.fontSize ?? 0}px</span>
      </div>
      <div class={`lite-poster-stage ${align === 'left' ? 'is-left' : 'is-center'}`}>
        {layout && layout.lines.length > 0 ? layout.lines.map(line => (
          <div key={line.key} class={`lite-poster-line ${align === 'left' ? 'is-left' : 'is-center'}`} style={{ minHeight: `${line.height}px` }}>
            {line.pieces.map(piece => (
              <span
                key={piece.key}
                class="lite-poster-piece"
                style={{
                  fontStyle: piece.fontStyle,
                  fontWeight: piece.fontWeight,
                  fontSize: `${piece.fontSize}px`,
                }}
              >
                {piece.spaceBefore ? ` ${piece.text}` : piece.text}
              </span>
            ))}
          </div>
        )) : (
          <div class="lite-poster-empty">No readable text in this unit.</div>
        )}
      </div>
    </div>
  )
}
