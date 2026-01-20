export type Word = {
  id: string
  tokenIndex: number
  sentenceIndex: number
  text: string
  spaceAfter: boolean
  cols: number

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
}

export const DEFAULT_TEXT =
  'By "augmenting human intellect" we mean increasing the capability of a man to approach a complex problem situation, to gain comprehension to suit his particular needs, and to derive solutions to problems. Increased capability in this respect is taken to mean a mixture of the following: more-rapid comprehension, better comprehension, the possibility of gaining a useful degree of comprehension in a situation that previously was too complex, speedier solutions, better solutions, and the possibility of finding solutions to problems that before seemed insoluble. And by "complex situations" we include the professional problems of diplomats, executives, social scientists, life scientists, physical scientists, attorneys, designers—whether the problem situation exists for twenty minutes or twenty years. We do not speak of isolated clever tricks that help in particular situations. We refer to a way of life in an integrated domain where hunches, cut-and-try, intangibles, and the human "feel for a situation" usefully co-exist with powerful concepts, streamlined terminology and notation, sophisticated methods, and high-powered electronic aids.'

const SENTENCE_END = /[.!?]$/
const PUNCT_ONLY = /^[\p{P}]+$/u

export function createWords(text: string): DocumentModel {
  const words: Word[] = []
  const metaById = new Map<string, WordMeta>()

  let tokenIndex = 0
  let sentenceIndex = 0

  // token + trailing whitespace
  const re = /\S+(\s+|$)/g
  for (const match of text.matchAll(re)) {
    const token = match[0]
    const raw = token.replace(/\s+$/g, '')
    const spaceAfter = /\s+$/.test(token)

    const id = `w${tokenIndex}`
    const lower = raw.toLowerCase()
    const isPunct = PUNCT_ONLY.test(raw)
    const isStop = !isPunct && STOPWORDS.has(lower)

    words.push({
      id,
      tokenIndex,
      sentenceIndex,
      text: raw,
      spaceAfter,
      cols: raw.length + (spaceAfter ? 1 : 0),
      targetCol: 0,
      targetRow: 0,
      animCol: 0,
      animRow: 0,
      focusDy: 0,
      targetScale: 1,
      animScale: 1,
    })

    metaById.set(id, { isStop, isPunct })

    if (SENTENCE_END.test(raw)) sentenceIndex++
    tokenIndex++
  }

  const finalSentenceCount = words.length > 0 ? words[words.length - 1].sentenceIndex + 1 : 0

  return { words, metaById, sentenceCount: finalSentenceCount }
}
