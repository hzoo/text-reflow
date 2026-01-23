export type Word = {
  id: string
  tokenIndex: number
  sentenceIndex: number
  text: string
  displayText: string
  spaceAfter: boolean
  baseScale: number
  baselineShift: number
  fontStyle: 'normal' | 'italic'
  fontWeight: 'normal' | 'bold'
  linkUrl: string | null
  imageUrl: string | null
  imageAlt: string | null
  imageW: number
  imageH: number
  breakAfter: boolean
  breakAfterRows: number
  paragraphIndex: number
  pixelWidth: number

  // layout targets
  targetX: number
  targetY: number

  // animated state
  animX: number
  animY: number

  // focus deformation
  focusDy: number
  targetScale: number
  animScale: number
}

export type WordMeta = {
  isStop: boolean
  isPunct: boolean
}

export type DocumentModel = {
  words: Word[]
  metaById: Map<string, WordMeta>
  sentenceCount: number
  wordsBySentence: Word[][]
  wordsByParagraph: Word[][]
  // Pre-computed structural data
  paragraphs: string[]
  sentenceCounts: number[]
}
