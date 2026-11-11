import { useCallback, useLayoutEffect, useState } from 'preact/hooks'
import { LiteProgress } from './LiteProgress'
import { fitPosterPages, type PosterLayout } from './poster-layout'
import type { Word } from '../syntaxExploder/document'
import {
  controlsOpen$,
  document$,
  globalSentence$,
  setReadingSentence,
  liteFitUnit$,
  litePosterAlign$,
  mapSentenceToParagraph,
  getSentenceOffset,
} from '../state/signals'

const FIT_GUTTER_PX = 8
const EMPTY_WORDS: Word[] = []

function px(style: CSSStyleDeclaration, key: string): number {
  const v = Number.parseFloat(style.getPropertyValue(key))
  return Number.isFinite(v) ? v : 0
}

function getSentenceWords(index: number) {
  return document$.value.wordsBySentence[index] ?? EMPTY_WORDS
}

function getParagraphWords(index: number) {
  return document$.value.wordsByParagraph[index] ?? EMPTY_WORDS
}

function getParagraphIndex(sentenceIndex: number): number {
  return mapSentenceToParagraph(sentenceIndex, document$.value.sentenceCounts).paragraphIndex
}

export function LitePoster() {
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const [result, setResult] = useState<{ words: Word[]; pages: PosterLayout[] } | null>(null)
  const [selection, setSelection] = useState<{ words: Word[]; index: number } | null>(null)

  const unit = liteFitUnit$.value
  const align = litePosterAlign$.value
  const currentSentence = globalSentence$.value ?? 0
  const currentParagraph = getParagraphIndex(currentSentence)
  const current = unit === 'paragraph' ? currentParagraph : currentSentence
  const doc = document$.value
  const total = unit === 'paragraph' && doc.sentenceCount > 0 ? doc.paragraphs.length : doc.sentenceCount
  const words = unit === 'paragraph' ? getParagraphWords(currentParagraph) : getSentenceWords(currentSentence)
  const pages = result?.words === words ? result.pages : []
  const page = selection?.words === words ? Math.min(selection.index, Math.max(0, pages.length - 1)) : 0
  const layout = pages[page]
  const paged = pages.length > 1

  const moveBy = useCallback((delta: number) => {
    if (total === 0 || doc !== document$.peek()) return
    const nextPage = page + delta
    if (nextPage >= 0 && nextPage < pages.length) {
      setSelection({ words, index: nextPage })
      return
    }
    const next = current + delta
    if (next < 0 || next >= total) return
    const byParagraph = unit === 'paragraph'
    const nextWords = (byParagraph ? doc.wordsByParagraph[next] : doc.wordsBySentence[next]) ?? EMPTY_WORDS
    setSelection(delta < 0 ? { words: nextWords, index: Infinity } : null)
    setReadingSentence(byParagraph ? getSentenceOffset(doc.sentenceCounts, next) : next)
  }, [current, doc, page, pages.length, total, unit, words])

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
    const maxW = rootEl.clientWidth - padX - FIT_GUTTER_PX * 2
    const maxH = rootEl.clientHeight - padY - FIT_GUTTER_PX * 2
    setResult({ words, pages: fitPosterPages(words, maxW, maxH) })
  }, [rootEl, words])

  useLayoutEffect(() => {
    setSelection(previous => previous?.words === words ? previous : null)
    computeLayout()
    if (!rootEl) return
    const ro = new ResizeObserver(() => computeLayout())
    ro.observe(rootEl)
    return () => ro.disconnect()
  }, [computeLayout, rootEl, words])

  return (
    <div ref={setRootEl} class="lite-poster" onClick={handleTap}>
      <LiteProgress current={current} total={total} />
      <div class="lite-poster-meta">
        <span>{unit === 'paragraph' ? 'Paragraph' : 'Sentence'}</span>
        <span>{total > 0 ? current + 1 : 0}/{total}</span>
        {!paged && <span>{layout?.fontSize ?? 0}px</span>}
      </div>
      {paged && (
        <div class="lite-poster-pages" onClick={e => e.stopPropagation()}>
          <button type="button" aria-label={page === 0 ? `Previous ${unit}` : 'Previous page'} disabled={page === 0 && current === 0} onClick={() => moveBy(-1)}>←</button>
          <span>Page {page + 1} of {pages.length}</span>
          <button type="button" aria-label={page + 1 === pages.length ? `Next ${unit}` : 'Next page'} disabled={page + 1 === pages.length && current + 1 === total} onClick={() => moveBy(1)}>→</button>
        </div>
      )}
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
