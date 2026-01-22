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

const SUPERSCRIPT_SCALE = 0.65
const SUPERSCRIPT_SHIFT = -0.35
type FootnoteSplit = { base: string; marker: string; punct?: string }

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
}

export const SAMPLE_TEXTS = {
  engelbart: 'By "augmenting human intellect" we mean increasing the capability of a man to approach a complex problem situation, to gain comprehension to suit his particular needs, and to derive solutions to problems. Increased capability in this respect is taken to mean a mixture of the following: more-rapid comprehension, better comprehension, the possibility of gaining a useful degree of comprehension in a situation that previously was too complex, speedier solutions, better solutions, and the possibility of finding solutions to problems that before seemed insoluble. And by "complex situations" we include the professional problems of diplomats, executives, social scientists, life scientists, physical scientists, attorneys, designers—whether the problem situation exists for twenty minutes or twenty years. We do not speak of isolated clever tricks that help in particular situations. We refer to a way of life in an integrated domain where hunches, cut-and-try, intangibles, and the human "feel for a situation" usefully co-exist with powerful concepts, streamlined terminology and notation, sophisticated methods, and high-powered electronic aids.',

  kafka: 'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections. The bedding was hardly able to cover it and seemed ready to slide off any moment. His many legs, pitifully thin compared with the size of the rest of him, waved about helplessly as he looked.',

  tufte: 'Clutter and confusion are not attributes of data – they are shortcomings of design. The issue is the quality of the design, not the quantity of the data. Escaping this flatland is the essential task of envisioning information – for all the interesting worlds that we seek to understand are inevitably and happily multivariate in nature. Not flatlands.',

  orwell: 'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.',

  short: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',

  john5: `Testimonies About Jesus
31 "If I testify about myself, my testimony is not true. 32 There is another who testifies in my favor, and I know that his testimony about me is true.

33 "You have sent to John and he has testified to the truth. 34 Not that I accept human testimony; but I mention it that you may be saved. 35 John was a lamp that burned and gave light, and you chose for a time to enjoy his light.

36 "I have testimony weightier than that of John. For the works that the Father has given me to finish—the very works that I am doing—testify that the Father has sent me. 37 And the Father who sent me has himself testified concerning me. You have never heard his voice nor seen his form, 38 nor does his word dwell in you, for you do not believe the one he sent. 39 You study the Scriptures diligently because you think that in them you have eternal life. These are the very Scriptures that testify about me, 40 yet you refuse to come to me to have life.

41 "I do not accept glory from human beings, 42 but I know you. I know that you do not have the love of God in your hearts. 43 I have come in my Father's name, and you do not accept me; but if someone else comes in his own name, you will accept him. 44 How can you believe since you accept glory from one another but do not seek the glory that comes from the only God?

45 "But do not think I will accuse you before the Father. Your accuser is Moses, on whom your hopes are set. 46 If you believed Moses, you would believe me, for he wrote about me. 47 But since you do not believe what he wrote, how are you going to believe what I say?"`,
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

export function createDocumentFromParagraphs(paragraphs: string[], useMarkdown: boolean): DocumentModel {
  // Auto-detect Bible verses on full text
  const fullText = paragraphs.join('\n\n')
  const { isBible } = detectBibleVerses(fullText)
  if (isBible) {
    return createWordsBible(fullText)
  }

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

  // Build wordsByParagraph from collected words
  const wordsByParagraph: Word[][] = []
  for (const word of words) {
    if (!wordsByParagraph[word.paragraphIndex]) wordsByParagraph[word.paragraphIndex] = []
    wordsByParagraph[word.paragraphIndex].push(word)
  }

  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence, wordsByParagraph }
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
    const { style, content, marker } = parseLine(trimmed)
    const scale = baseScaleFor(style)
    let breakRows = 1
    if (style === 'title') breakRows = 2
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

// ─── Bible Verse Detection & Parsing ───────────────────────────────────────

/** Normalize smart quotes/apostrophes to ASCII equivalents */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // smart single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // smart double quotes → "
    .replace(/[\u2013\u2014]/g, '-')              // en/em dash → -
}

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

/**
 * Create words from Bible-formatted text, using verse numbers as sentence indices.
 */
export function createWordsBible(text: string): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()
  const wordsBySentence: Word[][] = []

  // Normalize quotes and strip footnote markers like [c], [d]
  const cleaned = normalizeQuotes(text).replace(/\[[a-z]\]/gi, '')

  const { isBible } = detectBibleVerses(cleaned)
  if (!isBible) {
    // Fallback to normal parsing
    return createWords(cleaned)
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

  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence, wordsByParagraph }
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
