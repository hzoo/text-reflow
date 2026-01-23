import type { Word, WordMeta, DocumentModel } from './types'
import { STOPWORDS, ABBREVIATIONS } from './constants'
import { parseBibleText, detectBibleVerses } from './bible'

// ─── Internal Types ────────────────────────────────────────────────────────

const SUPERSCRIPT_SCALE = 0.65
const SUPERSCRIPT_SHIFT = -0.35
type FootnoteSplit = { base: string; marker: string; punct?: string }

type BlockStyle = 'title' | 'heading' | 'bullet' | 'body'

type InlineStyle = {
  fontStyle: 'normal' | 'italic'
  fontWeight: 'normal' | 'bold'
  linkUrl?: string
  imageUrl?: string
}

type InlineSegment = {
  text: string
  style: InlineStyle
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SENTENCE_END = /[.!?]["'"'\)\]]*$/
const SENTENCE_SKIP = /[.!?]["'"'\)\]]*,$/
const PUNCT_ONLY = /^[\p{P}]+$/u

// ─── Internal Helpers ──────────────────────────────────────────────────────

function splitFootnoteToken(raw: string): FootnoteSplit | null {
  const bracketed = raw.match(/^(.+?)\[\^(\d+)\]([.,;:!?])?$/)
  if (bracketed) {
    return { base: bracketed[1], marker: bracketed[2], punct: bracketed[3] }
  }
  const bracketOnly = raw.match(/^\[\^(\d+)\]([.,;:!?])?$/)
  if (bracketOnly) {
    return { base: '', marker: bracketOnly[1], punct: bracketOnly[2] }
  }
  const numeric = raw.match(/^(.+?)(\d{1,3})([.,;:!?])$/)
  if (numeric) {
    const base = numeric[1]
    if (/[A-Za-z]$/.test(base)) {
      return { base, marker: numeric[2], punct: numeric[3] }
    }
  }
  return null
}

function extractUrl(raw: string): string | undefined {
  const match = raw.match(/https?:\/\/\S+/i)
  if (!match) return undefined
  let url = match[0]
  url = url.replace(/^[([<{]+/, '')
  url = url.replace(/[)\]}>.,;:!?]+$/, '')
  return url
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url)
}

function isSentenceEnd(raw: string, nextRaw?: string): boolean {
  if (!SENTENCE_END.test(raw)) return false
  if (SENTENCE_SKIP.test(raw)) return false

  const cleaned = stripTrailingQuotes(raw)
  if (isAbbreviation(cleaned)) return false

  if (nextRaw) {
    const starter = stripLeadingQuotes(nextRaw)
    if (/^[a-z]/.test(starter)) return false
  }

  return true
}

function stripTrailingQuotes(raw: string): string {
  return raw.replace(/["'"'\)\]]+$/g, '')
}

function stripLeadingQuotes(raw: string): string {
  return raw.replace(/^["'""''\(\[]+/, '')
}

function isAbbreviation(raw: string): boolean {
  if (!raw.endsWith('.')) return false
  const normalized = raw.replace(/[^a-zA-Z.]/g, '')
  const trimmed = normalized.replace(/\.+$/g, '')
  if (!trimmed) return false
  if (trimmed.length <= 2) return true
  if (ABBREVIATIONS.has(trimmed.toLowerCase())) return true
  if (/^(?:[a-zA-Z]\.){2,}$/.test(normalized)) return true
  return false
}

// ─── Public: Inline Marker Handling ────────────────────────────────────────

export function parseInlineMarkers(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const marker = /\[\[(\/)?(strong|em|link|image)(?::([^\]]+))?\]\]/g
  const weightStack: Array<'normal' | 'bold'> = ['normal']
  const styleStack: Array<'normal' | 'italic'> = ['normal']
  const linkStack: Array<string | undefined> = [undefined]
  const imageStack: Array<string | undefined> = [undefined]
  let lastIndex = 0

  function pushSegment(value: string) {
    if (!value) return
    segments.push({
      text: value,
      style: {
        fontStyle: styleStack[styleStack.length - 1],
        fontWeight: weightStack[weightStack.length - 1],
        linkUrl: linkStack[linkStack.length - 1],
        imageUrl: imageStack[imageStack.length - 1],
      },
    })
  }

  let match: RegExpExecArray | null
  while ((match = marker.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushSegment(text.slice(lastIndex, match.index))
    }
    const isClose = Boolean(match[1])
    const kind = match[2]
    const value = match[3]
    if (!isClose) {
      if (kind === 'strong') weightStack.push('bold')
      else if (kind === 'em') styleStack.push('italic')
      else if (kind === 'link') linkStack.push(value)
      else if (kind === 'image') imageStack.push(value)
    } else {
      if (kind === 'strong' && weightStack.length > 1) weightStack.pop()
      else if (kind === 'em' && styleStack.length > 1) styleStack.pop()
      else if (kind === 'link' && linkStack.length > 1) linkStack.pop()
      else if (kind === 'image' && imageStack.length > 1) imageStack.pop()
    }
    lastIndex = marker.lastIndex
  }
  if (lastIndex < text.length) pushSegment(text.slice(lastIndex))
  return segments
}

export function stripInlineMarkers(text: string): string {
  return text
    .replace(/\[\[strong\]\]/g, '')
    .replace(/\[\[\/strong\]\]/g, '')
    .replace(/\[\[em\]\]/g, '')
    .replace(/\[\[\/em\]\]/g, '')
    .replace(/\[\[link:[^\]]+\]\]/g, '')
    .replace(/\[\[\/link\]\]/g, '')
    .replace(/\[\[image:[^\]]+\]\]/g, '')
    .replace(/\[\[\/image\]\]/g, '')
}

// ─── Public: Paragraph Splitting ───────────────────────────────────────────

/** Split text into paragraphs (smart detect: double newline for prose, single for poetry) */
export function splitParagraphs(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Count double vs single newlines
  const doubleNewlines = (trimmed.match(/\n\s*\n/g) || []).length
  const singleNewlines = (trimmed.match(/\n/g) || []).length

  // If has double newlines, split on those (prose mode)
  if (doubleNewlines >= 1) {
    return trimmed
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)
  }

  // If only single newlines, split on those (poetry/line mode)
  if (singleNewlines >= 1) {
    return trimmed
      .split(/\n/)
      .map(p => p.trim())
      .filter(Boolean)
  }

  // No newlines - single paragraph
  return [trimmed]
}

// ─── Public: Plain Text Parsing ────────────────────────────────────────────

export function parseText(text: string): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  let tokenIndex = 0
  let sentenceIndex = 0

  // token + trailing whitespace
  const re = /\S+(\s+|$)/g
  const tokens = Array.from(text.matchAll(re)).map(match => {
    const token = match[0]
    const raw = token.replace(/\s+$/g, '')
    return {
      token,
      raw,
      spaceAfter: /\s+$/.test(token),
      displayText: raw + (/\s+$/.test(token) ? ' ' : ''),
    }
  })

  function pushWord(raw: string, spaceAfter: boolean, baseScale: number, baselineShift: number, skipSentenceEnd: boolean, breakAfter: boolean, breakAfterRows: number, nextRaw?: string) {
    const displayText = raw + (spaceAfter ? ' ' : '')
    const id = `w${tokenIndex}`
    const lower = raw.toLowerCase()
    const isPunct = PUNCT_ONLY.test(raw)
    const isStop = !isPunct && STOPWORDS.has(lower)

    const linkUrl = extractUrl(raw) ?? null
    words.push({
      id,
      tokenIndex,
      sentenceIndex,
      text: raw,
      displayText,
      spaceAfter,
      baseScale,
      baselineShift,
      fontStyle: 'normal',
      fontWeight: 'normal',
      linkUrl,
      imageUrl: null,
      imageAlt: null,
      imageW: 0,
      imageH: 0,
      breakAfter,
      breakAfterRows,
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
    if (!wordsBySentence[sentenceIndex]) wordsBySentence[sentenceIndex] = []
    wordsBySentence[sentenceIndex].push(words[words.length - 1])

    if (!skipSentenceEnd && isSentenceEnd(raw, nextRaw)) sentenceIndex++
    tokenIndex++
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const raw = token.raw
    const spaceAfter = token.spaceAfter
    const breakAfter = /\n/.test(token.token)
    const breakAfterRows = breakAfter ? 1 : 0
    const nextRaw = tokens[i + 1]?.raw

    const split = splitFootnoteToken(raw)
    if (split) {
      if (split.base) {
        pushWord(split.base, false, 1, 0, false, false, 0)
      }
      const footnoteSpace = !split.punct && spaceAfter
      const footnoteBreak = !split.punct && breakAfter
      pushWord(split.marker, footnoteSpace, SUPERSCRIPT_SCALE, SUPERSCRIPT_SHIFT, true, footnoteBreak, footnoteBreak ? breakAfterRows : 0)
      if (split.punct) {
        pushWord(split.punct, spaceAfter, 1, 0, false, breakAfter, breakAfterRows, nextRaw)
      }
      continue
    }

    pushWord(raw, spaceAfter, 1, 0, false, breakAfter, breakAfterRows, nextRaw)
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0

  // Single paragraph → all words in paragraph 0
  const wordsByParagraph: Word[][] = [words]

  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence, wordsByParagraph }
}

// ─── Public: Markdown Text Parsing ─────────────────────────────────────────

export function parseMarkdownText(text: string): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  let tokenIndex = 0
  let sentenceIndex = 0

  function pushWord(raw: string, spaceAfter: boolean, baseScale: number, baselineShift: number, inline: InlineStyle, skipSentenceEnd = false) {
    const displayText = raw + (spaceAfter ? ' ' : '')
    const id = `w${tokenIndex}`
    const lower = raw.toLowerCase()
    const isPunct = PUNCT_ONLY.test(raw)
    const isStop = !isPunct && STOPWORDS.has(lower)

    const linkUrl = inline.linkUrl || extractUrl(raw) || null
    words.push({
      id,
      tokenIndex,
      sentenceIndex,
      text: raw,
      displayText,
      spaceAfter,
      baseScale,
      baselineShift,
      fontStyle: inline.fontStyle,
      fontWeight: inline.fontWeight,
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
    if (!wordsBySentence[sentenceIndex]) wordsBySentence[sentenceIndex] = []
    wordsBySentence[sentenceIndex].push(words[words.length - 1])
    if (!skipSentenceEnd && isSentenceEnd(raw)) sentenceIndex++
    tokenIndex++
  }

  function pushImage(url: string, alt: string) {
    const label = alt || 'Image'
    const id = `w${tokenIndex}`
    words.push({
      id,
      tokenIndex,
      sentenceIndex,
      text: label,
      displayText: label,
      spaceAfter: false,
      baseScale: 1,
      baselineShift: 0,
      fontStyle: 'normal',
      fontWeight: 'normal',
      linkUrl: url,
      imageUrl: url,
      imageAlt: label,
      imageW: 0,
      imageH: 0,
      breakAfter: true,
      breakAfterRows: 1,
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

    metaById.set(id, { isStop: false, isPunct: false })
    if (!wordsBySentence[sentenceIndex]) wordsBySentence[sentenceIndex] = []
    wordsBySentence[sentenceIndex].push(words[words.length - 1])
    tokenIndex++
  }

  function imageFromSegment(segment: InlineSegment): { url: string; alt: string } | null {
    const url = segment.style.imageUrl || segment.style.linkUrl
    if (!url) return null
    const rawLabel = segment.text.trim()
    const cleaned = rawLabel.replace(/^image\s*:\s*/i, '').trim()
    const alt = cleaned || 'Image'
    if (segment.style.imageUrl) return { url, alt }
    if (!isLikelyImageUrl(url)) return null
    if (/^image\b/i.test(rawLabel) || rawLabel === '') return { url, alt }
    return null
  }

  function parseLine(line: string): { style: BlockStyle; content: string; marker?: string } {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) return { style: 'title', content: trimmed.replace(/^#\s+/, '') }
    if (trimmed.startsWith('## ')) return { style: 'heading', content: trimmed.replace(/^##\s+/, '') }
    if (/^[-*+]\s+/.test(trimmed)) return { style: 'bullet', content: trimmed.replace(/^[-*+]\s+/, '') }
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/)
    if (orderedMatch) return { style: 'bullet', content: orderedMatch[2], marker: `${orderedMatch[1]}.` }
    return { style: 'body', content: trimmed }
  }

  function baseScaleFor(style: BlockStyle): number {
    if (style === 'title') return 1.08
    if (style === 'heading') return 1.04
    return 1
  }

  function applyLeadingSpace(text: string): string {
    if (!text) return text
    if (!/^\s+/.test(text)) return text
    const prev = words[words.length - 1]
    if (prev && !prev.spaceAfter) {
      prev.spaceAfter = true
      prev.displayText = `${prev.text} `
      prev.pixelWidth = Math.max(1, prev.displayText.length * prev.baseScale)
    }
    return text.replace(/^\s+/, '')
  }

  const lines = text.split(/\n/)
  let paragraphIndex = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      const prev = words[words.length - 1]
      if (prev) {
        prev.breakAfter = true
        prev.breakAfterRows = Math.max(prev.breakAfterRows, 2)
      }
      paragraphIndex++
      continue
    }
    const lineWordStart = words.length
    const lineSentenceStart = sentenceIndex
    const { style, content, marker } = parseLine(trimmed)
    const scale = baseScaleFor(style)
    let breakRows = 1
    if (style === 'title') breakRows = 3
    else if (style === 'heading') breakRows = 2
    const lineText = style === 'bullet' ? `${marker || '-'} ${content}` : content
    const segments = parseInlineMarkers(lineText)
    const blockWeight: InlineStyle['fontWeight'] = (style === 'title' || style === 'heading') ? 'bold' : 'normal'
    let isLineStartWord = true
    for (const segment of segments) {
      const imageInfo = imageFromSegment(segment)
      if (imageInfo) {
        const prev = words[words.length - 1]
        if (prev && !prev.breakAfter) {
          prev.breakAfter = true
          prev.breakAfterRows = Math.max(prev.breakAfterRows, 1)
        }
        pushImage(imageInfo.url, imageInfo.alt)
        continue
      }
      const segmentText = applyLeadingSpace(segment.text)
      if (!segmentText) continue
      const segmentStyle: InlineStyle = {
        fontStyle: segment.style.fontStyle,
        fontWeight: segment.style.fontWeight === 'bold' ? 'bold' : blockWeight,
        linkUrl: segment.style.linkUrl,
        imageUrl: segment.style.imageUrl,
      }
      const re = /\S+(\s+|$)/g
      for (const match of segmentText.matchAll(re)) {
        const token = match[0]
        const raw = token.replace(/\s+$/g, '')
        const spaceAfter = /\s+$/.test(token)
        const isListMarker = style === 'bullet' && isLineStartWord && (/^[-*+]$/.test(raw) || /^\d+\.$/.test(raw))
        const split = splitFootnoteToken(raw)
        if (split) {
          if (split.base) {
            pushWord(split.base, false, scale, 0, segmentStyle, false)
          }
          const footnoteSpace = !split.punct && spaceAfter
          pushWord(split.marker, footnoteSpace, scale * SUPERSCRIPT_SCALE, SUPERSCRIPT_SHIFT, segmentStyle, true)
          if (split.punct) {
            pushWord(split.punct, spaceAfter, scale, 0, segmentStyle, false)
          }
        } else {
          pushWord(raw, spaceAfter, scale, 0, segmentStyle, isListMarker)
        }
        isLineStartWord = false
      }
    }
    if (words.length > lineWordStart && sentenceIndex === lineSentenceStart) sentenceIndex++

    const prev = words[words.length - 1]
    if (prev && words.length > lineWordStart) {
      prev.breakAfter = true
      prev.breakAfterRows = Math.max(prev.breakAfterRows, breakRows)
    }

    for (let i = lineWordStart; i < words.length; i++) {
      words[i].paragraphIndex = paragraphIndex
    }
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0

  // Build wordsByParagraph from collected words
  const wordsByParagraph: Word[][] = []
  for (const word of words) {
    if (!wordsByParagraph[word.paragraphIndex]) wordsByParagraph[word.paragraphIndex] = []
    wordsByParagraph[word.paragraphIndex].push(word)
  }

  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence, wordsByParagraph }
}

// ─── Public: Document Creation ─────────────────────────────────────────────

export function parseDocument(paragraphs: string[], useMarkdown: boolean): DocumentModel {
  // Auto-detect Bible verses on full text
  const fullText = paragraphs.join('\n\n')
  const { isBible } = detectBibleVerses(fullText)
  if (isBible) {
    return parseBibleText(fullText)
  }

  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  const create = useMarkdown ? parseMarkdownText : parseText
  let tokenOffset = 0
  let sentenceOffset = 0

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const paragraph = paragraphs[paragraphIndex]
    if (!paragraph) continue
    const doc = create(paragraph)

    for (const word of doc.words) {
      const globalToken = tokenOffset + word.tokenIndex
      const globalSentence = sentenceOffset + word.sentenceIndex
      const id = `w${globalToken}`
      const meta = doc.metaById.get(word.id)

      const nextWord: Word = {
        ...word,
        id,
        tokenIndex: globalToken,
        sentenceIndex: globalSentence,
        paragraphIndex,
      }

      words.push(nextWord)
      if (meta) metaById.set(id, meta)
      if (!wordsBySentence[globalSentence]) wordsBySentence[globalSentence] = []
      wordsBySentence[globalSentence].push(nextWord)
    }

    tokenOffset += doc.words.length
    sentenceOffset += doc.sentenceCount
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0

  // Build wordsByParagraph from collected words
  const wordsByParagraph: Word[][] = []
  for (const word of words) {
    if (!wordsByParagraph[word.paragraphIndex]) wordsByParagraph[word.paragraphIndex] = []
    wordsByParagraph[word.paragraphIndex].push(word)
  }

  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence, wordsByParagraph }
}
