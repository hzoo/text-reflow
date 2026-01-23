import type { Word, WordMeta, DocumentModel } from './types'
import { STOPWORDS } from './constants'
import { parseText } from './parser'

// ─── Internal Helpers ──────────────────────────────────────────────────────

const PUNCT_ONLY = /^[\p{P}]+$/u

function extractUrl(raw: string): string | undefined {
  const match = raw.match(/https?:\/\/\S+/i)
  if (!match) return undefined
  let url = match[0]
  url = url.replace(/^[([<{]+/, '')
  url = url.replace(/[)\]}>.,;:!?]+$/, '')
  return url
}

/** Normalize smart quotes/apostrophes to ASCII equivalents */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // smart single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // smart double quotes → "
    .replace(/[\u2013\u2014]/g, '-')              // en/em dash → -
}

// ─── Public: Bible Detection ───────────────────────────────────────────────

/**
 * Detect if text looks like Bible verses with inline verse numbers.
 * Heuristic: find numbers followed by any letter/quote, check if mostly sequential.
 */
export function detectBibleVerses(text: string): { isBible: boolean; verseNumbers: number[] } {
  text = normalizeQuotes(text)
  // Match: number at start or after space, followed by space + any letter/quote
  // e.g., '31 "If...' or "32 There..." or "38 nor..."
  const pattern = /(?:^|\s)(\d{1,3})\s+(?=["']?[A-Za-z])/gm
  const matches = [...text.matchAll(pattern)]
  const numbers = matches.map(m => parseInt(m[1], 10))

  if (numbers.length < 3) return { isBible: false, verseNumbers: [] }

  // Check for sequential run (allow gaps up to 3 for missing verses)
  let sequentialCount = 0
  for (let i = 1; i < numbers.length; i++) {
    const diff = numbers[i] - numbers[i - 1]
    if (diff >= 1 && diff <= 3) sequentialCount++
  }

  // 70%+ sequential = bible mode
  const ratio = sequentialCount / (numbers.length - 1)
  const isBible = ratio >= 0.7

  return { isBible, verseNumbers: isBible ? numbers : [] }
}

// ─── Public: Bible Splitting ───────────────────────────────────────────────

/**
 * Split text by verse numbers, returning array of verse strings.
 * Each element is "N text..." where N is the verse number.
 */
export function splitByVerseNumber(text: string): string[] {
  text = normalizeQuotes(text)
  // Split on lookahead for verse number pattern (any letter/quote after number)
  const parts = text.split(/(?=(?:^|\s)\d{1,3}\s+["']?[A-Za-z])/m)
  return parts.map(p => p.trim()).filter(Boolean)
}

// ─── Public: Bible Text Parsing ────────────────────────────────────────────

/**
 * Create words from Bible-formatted text, using verse numbers as sentence indices.
 */
export function parseBibleText(text: string): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  // Normalize quotes and strip footnote markers like [c], [d]
  const cleaned = normalizeQuotes(text).replace(/\[[a-z]\]/gi, '')

  const { isBible } = detectBibleVerses(cleaned)
  if (!isBible) {
    // Fallback to normal parsing
    return parseText(cleaned)
  }

  const verses = splitByVerseNumber(cleaned)
  let tokenIndex = 0

  for (let verseIdx = 0; verseIdx < verses.length; verseIdx++) {
    const verse = verses[verseIdx]
    // Extract verse number from start if present
    const numMatch = verse.match(/^(\d{1,3})\s+/)
    const verseText = numMatch ? verse.slice(numMatch[0].length) : verse
    const verseNum = numMatch ? numMatch[1] : null

    // Tokenize verse
    const re = /\S+(\s+|$)/g
    const tokens = Array.from(verseText.matchAll(re)).map(match => {
      const token = match[0]
      const raw = token.replace(/\s+$/g, '')
      return {
        token,
        raw,
        spaceAfter: /\s+$/.test(token),
        displayText: raw + (/\s+$/.test(token) ? ' ' : ''),
      }
    })

    // Add verse number as first word (dimmed/small)
    if (verseNum) {
      const id = `w${tokenIndex}`
      words.push({
        id,
        tokenIndex,
        sentenceIndex: verseIdx,
        text: verseNum,
        displayText: verseNum + ' ',
        spaceAfter: true,
        baseScale: 0.85,
        baselineShift: 0,
        fontStyle: 'normal',
        fontWeight: 'normal',
        linkUrl: null,
        imageUrl: null,
        imageAlt: null,
        imageW: 0,
        imageH: 0,
        breakAfter: false,
        breakAfterRows: 0,
        paragraphIndex: 0,
        targetX: 0,
        targetY: 0,
        animX: 0,
        animY: 0,
        focusDy: 0,
        targetScale: 1,
        animScale: 1,
        pixelWidth: 0,
      })
      metaById.set(id, { isStop: true, isPunct: false }) // Mark as "stop" so it dims in focus mode
      if (!wordsBySentence[verseIdx]) wordsBySentence[verseIdx] = []
      wordsBySentence[verseIdx].push(words[words.length - 1])
      tokenIndex++
    }

    // Add verse text tokens
    for (const token of tokens) {
      const id = `w${tokenIndex}`
      const lower = token.raw.toLowerCase()
      const isPunct = PUNCT_ONLY.test(token.raw)
      const isStop = !isPunct && STOPWORDS.has(lower)
      const linkUrl = extractUrl(token.raw) ?? null

      words.push({
        id,
        tokenIndex,
        sentenceIndex: verseIdx,
        text: token.raw,
        displayText: token.displayText,
        spaceAfter: token.spaceAfter,
        baseScale: 1,
        baselineShift: 0,
        fontStyle: 'normal',
        fontWeight: 'normal',
        linkUrl,
        imageUrl: null,
        imageAlt: null,
        imageW: 0,
        imageH: 0,
        breakAfter: false,
        breakAfterRows: 0,
        paragraphIndex: 0,
        targetX: 0,
        targetY: 0,
        animX: 0,
        animY: 0,
        focusDy: 0,
        targetScale: 1,
        animScale: 1,
        pixelWidth: 0,
      })

      metaById.set(id, { isStop, isPunct })
      if (!wordsBySentence[verseIdx]) wordsBySentence[verseIdx] = []
      wordsBySentence[verseIdx].push(words[words.length - 1])
      tokenIndex++
    }
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0

  // Single paragraph → all words in paragraph 0
  const wordsByParagraph: Word[][] = [words]

  return { 
    words, 
    metaById, 
    sentenceCount: finalSentenceCount, 
    wordsBySentence, 
    wordsByParagraph,
    paragraphs: [cleaned],
    sentenceCounts: [finalSentenceCount]
  }
}
