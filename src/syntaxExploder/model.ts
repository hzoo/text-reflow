export type Word = {
  id: string
  tokenIndex: number
  sentenceIndex: number
  text: string
  displayText: string
  spaceAfter: boolean
  cols: number
  baseScale: number
  fontStyle: 'normal' | 'italic'
  fontWeight: 'normal' | 'bold'
  linkUrl?: string
  breakAfter: boolean
  breakAfterRows: number

  // layout targets
  targetCol: number
  targetRow: number

  // animated state
  animCol: number
  animRow: number

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

const SENTENCE_END = /[.!?]$/
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
  for (const match of text.matchAll(re)) {
    const token = match[0]
    const raw = token.replace(/\s+$/g, '')
    const spaceAfter = /\s+$/.test(token)
    const displayText = raw + (spaceAfter ? ' ' : '')
    const breakAfter = /\n/.test(token)
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
      cols: displayText.length,
      baseScale: 1,
      fontStyle: 'normal',
      fontWeight: 'normal',
      linkUrl,
      breakAfter,
      breakAfterRows,
      targetCol: 0,
      targetRow: 0,
      animCol: 0,
      animRow: 0,
      focusDy: 0,
      targetScale: 1,
      animScale: 1,
    })

    metaById.set(id, { isStop, isPunct })
    if (!wordsBySentence[sentenceIndex]) wordsBySentence[sentenceIndex] = []
    wordsBySentence[sentenceIndex].push(words[words.length - 1])

    if (SENTENCE_END.test(raw)) sentenceIndex++
    tokenIndex++
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
      cols: Math.max(1, Math.round(displayText.length * baseScale)),
      baseScale,
      fontStyle: inline.fontStyle,
      fontWeight: inline.fontWeight,
      linkUrl,
      breakAfter: false,
      breakAfterRows: 0,
      targetCol: 0,
      targetRow: 0,
      animCol: 0,
      animRow: 0,
      focusDy: 0,
      targetScale: 1,
      animScale: 1,
    })

    metaById.set(id, { isStop, isPunct })
    if (!wordsBySentence[sentenceIndex]) wordsBySentence[sentenceIndex] = []
    wordsBySentence[sentenceIndex].push(words[words.length - 1])
    if (SENTENCE_END.test(raw)) sentenceIndex++
    tokenIndex++
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
      prev.cols = Math.max(1, Math.round(prev.displayText.length * prev.baseScale))
    }
    return text.replace(/^\s+/, '')
  }

  const lines = text.split(/\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      const prev = words[words.length - 1]
      if (prev) {
        prev.breakAfter = true
        prev.breakAfterRows = Math.max(prev.breakAfterRows, 2)
      }
      continue
    }
    const lineWordStart = words.length
    const lineSentenceStart = sentenceIndex
    const { style, content } = parseLine(trimmed)
    const scale = baseScaleFor(style)
    const lineText = style === 'bullet' ? `- ${content}` : content
    const segments = parseInlineMarkers(lineText)
    const blockWeight: InlineStyle['fontWeight'] = (style === 'title' || style === 'heading') ? 'bold' : 'normal'
    for (const segment of segments) {
      const segmentText = applyLeadingSpace(segment.text)
      if (!segmentText) continue
      const segmentStyle: InlineStyle = {
        fontStyle: segment.style.fontStyle,
        fontWeight: segment.style.fontWeight === 'bold' ? 'bold' : blockWeight,
        linkUrl: segment.style.linkUrl,
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
      prev.breakAfterRows = Math.max(prev.breakAfterRows, 1)
    }
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0
  return { words, metaById, sentenceCount: finalSentenceCount, wordsBySentence }
}

type InlineStyle = {
  fontStyle: 'normal' | 'italic'
  fontWeight: 'normal' | 'bold'
  linkUrl?: string
}

type InlineSegment = {
  text: string
  style: InlineStyle
}

function parseInlineMarkers(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const marker = /\[\[(\/)?(strong|em|link)(?::([^\]]+))?\]\]/g
  const weightStack: Array<'normal' | 'bold'> = ['normal']
  const styleStack: Array<'normal' | 'italic'> = ['normal']
  const linkStack: Array<string | undefined> = [undefined]
  let lastIndex = 0

  function pushSegment(value: string) {
    if (!value) return
    segments.push({
      text: value,
      style: {
        fontStyle: styleStack[styleStack.length - 1],
        fontWeight: weightStack[weightStack.length - 1],
        linkUrl: linkStack[linkStack.length - 1],
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
    } else {
      if (kind === 'strong' && weightStack.length > 1) weightStack.pop()
      else if (kind === 'em' && styleStack.length > 1) styleStack.pop()
      else if (kind === 'link' && linkStack.length > 1) linkStack.pop()
    }
    lastIndex = marker.lastIndex
  }
  if (lastIndex < text.length) pushSegment(text.slice(lastIndex))
  return segments
}
