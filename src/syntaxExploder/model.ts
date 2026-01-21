export type Word = {
  id: string
  tokenIndex: number
  sentenceIndex: number
  text: string
  displayText: string
  spaceAfter: boolean
  baseScale: number
  fontStyle: 'normal' | 'italic'
  fontWeight: 'normal' | 'bold'
  linkUrl?: string
  imageUrl?: string
  imageAlt?: string
  imageW?: number
  imageH?: number
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

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'but',
  'by',
  'do',
  'does',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'him',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'more',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'out',
  'she',
  'since',
  'so',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'too',
  'we',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
])

export type WordMeta = {
  isStop: boolean
  isPunct: boolean
}

export type DocumentModel = {
  words: Word[]
  metaById: Map<string, WordMeta>
  sentenceCount: number
  wordsBySentence: Word[][]
}

export const SAMPLE_TEXTS = {
  engelbart: 'By "augmenting human intellect" we mean increasing the capability of a man to approach a complex problem situation, to gain comprehension to suit his particular needs, and to derive solutions to problems. Increased capability in this respect is taken to mean a mixture of the following: more-rapid comprehension, better comprehension, the possibility of gaining a useful degree of comprehension in a situation that previously was too complex, speedier solutions, better solutions, and the possibility of finding solutions to problems that before seemed insoluble. And by "complex situations" we include the professional problems of diplomats, executives, social scientists, life scientists, physical scientists, attorneys, designers—whether the problem situation exists for twenty minutes or twenty years. We do not speak of isolated clever tricks that help in particular situations. We refer to a way of life in an integrated domain where hunches, cut-and-try, intangibles, and the human "feel for a situation" usefully co-exist with powerful concepts, streamlined terminology and notation, sophisticated methods, and high-powered electronic aids.',

  kafka: 'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections. The bedding was hardly able to cover it and seemed ready to slide off any moment. His many legs, pitifully thin compared with the size of the rest of him, waved about helplessly as he looked.',

  tufte: 'Clutter and confusion are not attributes of data – they are shortcomings of design. The issue is the quality of the design, not the quantity of the data. Escaping this flatland is the essential task of envisioning information – for all the interesting worlds that we seek to understand are inevitably and happily multivariate in nature. Not flatlands.',

  orwell: 'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.',

  short: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',
}

export const DEFAULT_TEXT = SAMPLE_TEXTS.engelbart

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'no', 'fig', 'figs', 'dept', 'inc', 'ltd', 'co',
  'e.g', 'i.e', 'etc', 'vs', 'al', 'ed', 'rev', 'eq', 'eqs', 'sec', 'secs',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
])
const SENTENCE_END = /[.!?]["'”’\)\]]*$/
const SENTENCE_SKIP = /[.!?]["'”’\)\]]*,$/
const PUNCT_ONLY = /^[\p{P}]+$/u

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

export function createWords(text: string): DocumentModel {
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

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const raw = token.raw
    const spaceAfter = token.spaceAfter
    const displayText = token.displayText
    const breakAfter = /\n/.test(token.token)
    const breakAfterRows = breakAfter ? 1 : 0

    const id = `w${tokenIndex}`
    const lower = raw.toLowerCase()
    const isPunct = PUNCT_ONLY.test(raw)
    const isStop = !isPunct && STOPWORDS.has(lower)

    const linkUrl = extractUrl(raw)
    words.push({
      id,
      tokenIndex,
      sentenceIndex,
      text: raw,
      displayText,
      spaceAfter,
      baseScale: 1,
      fontStyle: 'normal',
      fontWeight: 'normal',
      linkUrl,
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

    const nextRaw = tokens[i + 1]?.raw
    if (isSentenceEnd(raw, nextRaw)) sentenceIndex++
    tokenIndex++
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0

  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence }
}

export function createDocumentFromParagraphs(paragraphs: string[], useMarkdown: boolean): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  const create = useMarkdown ? createWordsMarkdown : createWords
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
  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence }
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

type BlockStyle = 'title' | 'heading' | 'bullet' | 'body'

export function createWordsMarkdown(text: string): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  let tokenIndex = 0
  let sentenceIndex = 0

  function pushWord(raw: string, spaceAfter: boolean, baseScale: number, inline: InlineStyle) {
    const displayText = raw + (spaceAfter ? ' ' : '')
    const id = `w${tokenIndex}`
    const lower = raw.toLowerCase()
    const isPunct = PUNCT_ONLY.test(raw)
    const isStop = !isPunct && STOPWORDS.has(lower)

    const linkUrl = inline.linkUrl || extractUrl(raw)
    words.push({
      id,
      tokenIndex,
      sentenceIndex,
      text: raw,
      displayText,
      spaceAfter,
      baseScale,
      fontStyle: inline.fontStyle,
      fontWeight: inline.fontWeight,
      linkUrl,
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
    if (isSentenceEnd(raw)) sentenceIndex++
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
      fontStyle: 'normal',
      fontWeight: 'normal',
      linkUrl: url,
      imageUrl: url,
      imageAlt: label,
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

  function parseLine(line: string): { style: BlockStyle; content: string } {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) return { style: 'title', content: trimmed.replace(/^#\s+/, '') }
    if (trimmed.startsWith('## ')) return { style: 'heading', content: trimmed.replace(/^##\s+/, '') }
    if (/^[-*+]\s+/.test(trimmed)) return { style: 'bullet', content: trimmed.replace(/^[-*+]\s+/, '') }
    if (/^\d+\.\s+/.test(trimmed)) return { style: 'bullet', content: trimmed.replace(/^\d+\.\s+/, '') }
    return { style: 'body', content: trimmed }
  }

  function baseScaleFor(style: BlockStyle): number {
    if (style === 'title') return 1.12
    if (style === 'heading') return 1.06
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
    const { style, content } = parseLine(trimmed)
    const scale = baseScaleFor(style)
    let breakRows = 1
    if (style === 'title') breakRows = 2
    else if (style === 'heading') breakRows = 2
    const lineText = style === 'bullet' ? `- ${content}` : content
    const segments = parseInlineMarkers(lineText)
    const blockWeight: InlineStyle['fontWeight'] = (style === 'title' || style === 'heading') ? 'bold' : 'normal'
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
        pushWord(raw, spaceAfter, scale, segmentStyle)
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
  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence }
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
  return raw.replace(/["'”’\)\]]+$/g, '')
}

function stripLeadingQuotes(raw: string): string {
  return raw.replace(/^["'“”‘’\(\[]+/, '')
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

function parseInlineMarkers(text: string): InlineSegment[] {
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
