import { signal, computed } from '@preact/signals'
import { parseDocument, parseText, parseMarkdownText, splitParagraphs, DEFAULT_TEXT, detectBibleVerses, markdownToParagraphs, markdownToReadingText, type DocumentModel } from '../syntaxExploder/document'
import { type BeatId, type FocusStyleId } from '../syntaxExploder/experiments'

// Constants
export const STORAGE_KEY = 'reflow-text'
export const STORAGE_MARKDOWN_KEY = 'reflow-markdown'
export const DEFAULT_WIDTH = 800
export const READER_WIDTH = 680
export const MOBILE_BOTTOM_RESERVE = 60
export const READER_FONT = '"Iowan Old Style", "Palatino", "Book Antiqua", "Georgia", serif'

export const isMobile = () => window.innerWidth <= 600

function looksLikeMarkdown(text: string): boolean {
  if (!text) return false
  return /\[\[(strong|em|link|image)/.test(text) || /^#{1,6}\s+/m.test(text) || /^-\s+/.test(text)
}

// Initialize from localStorage
const savedText = localStorage.getItem(STORAGE_KEY)
const savedMarkdown = localStorage.getItem(STORAGE_MARKDOWN_KEY)
const initialMarkdown = savedMarkdown === '1' || looksLikeMarkdown(savedText || '')
if (initialMarkdown) localStorage.setItem(STORAGE_MARKDOWN_KEY, '1')

// Core signals
export const text$ = signal(savedText || DEFAULT_TEXT)
export const currentPara$ = signal(0)
export const inputMode$ = signal(false)
export const hudCollapsed$ = signal(false)
export const markdownMode$ = signal(initialMarkdown)
export const debug$ = signal(false)
export const inputTab$ = signal<'url' | 'text'>('url')
export const viewMode$ = signal<'paragraph' | 'full'>('full')
export const extraOpen$ = signal(false)
export const maxWidth$ = signal(initialMarkdown ? READER_WIDTH : DEFAULT_WIDTH)
export const moveSpeed$ = signal(1)
export const panSpeed$ = signal(1)
export const focusSpeed$ = signal(1)
export const fullPush$ = signal(false)
export const isAutoFont$ = signal(false)

// Engine state signals (updated from engine callbacks)
export const beat$ = signal<BeatId>('reader')
export const focusStyle$ = signal<FocusStyleId>('gray')
export const sentence$ = signal<number | null>(0)
export const globalSentence$ = signal<number | null>(null)
export const sentenceCount$ = signal(1)
export const sentenceOnlyMode$ = signal(false)
export const layoutVersion$ = signal(0) // Bumped on layout for debug panel refresh

// Derived signals
export const fullText$ = computed(() =>
  markdownMode$.value
    ? markdownToReadingText(text$.value)
    : text$.value
)

export const baseParagraphs$ = computed(() =>
  markdownMode$.value
    ? markdownToParagraphs(text$.value)
    : splitParagraphs(text$.value)
)

export const paragraphs$ = computed(() => {
  if (viewMode$.value === 'full') {
    const full = fullText$.value.trim()
    return full ? [full] : []
  }
  const rawParas = baseParagraphs$.value
  return rawParas.map(p => p.trim()).filter(Boolean)
})

export const document$ = computed(() =>
  parseDocument(baseParagraphs$.value, markdownMode$.value)
)

export const sentenceCounts$ = computed(() =>
  getSentenceCounts(baseParagraphs$.value, markdownMode$.value, document$.value)
)

// Helper functions
function getSentenceCounts(paragraphs: string[], useMarkdown: boolean, doc: DocumentModel): number[] {
  const fullText = paragraphs.join('\n\n')
  const { isBible } = detectBibleVerses(fullText)
  if (isBible) {
    return [doc.sentenceCount]
  }
  const create = useMarkdown ? parseMarkdownText : parseText
  return paragraphs.map((paragraph) => create(paragraph).sentenceCount)
}

export function getSentenceOffset(counts: number[], paragraphIndex: number): number {
  let offset = 0
  for (let i = 0; i < paragraphIndex; i++) offset += counts[i] || 0
  return offset
}

export function mapSentenceToParagraph(sentenceIndex: number, counts: number[]): { paragraphIndex: number; localSentence: number } {
  if (counts.length === 0) {
    return { paragraphIndex: 0, localSentence: 0 }
  }
  let offset = 0
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i]
    if (sentenceIndex < offset + count) {
      return { paragraphIndex: i, localSentence: sentenceIndex - offset }
    }
    offset += count
  }
  const lastIndex = Math.max(0, counts.length - 1)
  return { paragraphIndex: lastIndex, localSentence: Math.max(0, (counts[lastIndex] || 1) - 1) }
}
