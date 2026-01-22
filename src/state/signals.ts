import { signal, computed, effect } from '@preact/signals'
import { parseDocument, parseText, parseMarkdownText, splitParagraphs, DEFAULT_TEXT, detectBibleVerses, markdownToParagraphs, markdownToReadingText, type DocumentModel } from '../syntaxExploder/document'
import { type BeatId, type FocusStyleId } from '../syntaxExploder/experiments'
import { migrateOldStorage, activeEntry$, library$, addEntry } from './library'

// Constants
export const STORAGE_KEY = 'reflow-text'
export const STORAGE_MARKDOWN_KEY = 'reflow-markdown'
export const PREFS_KEY = 'reflow-prefs'
export const DEFAULT_WIDTH = 720
export const READER_WIDTH = 680
export const MOBILE_BOTTOM_RESERVE = 60
export const READER_FONT = '"Iowan Old Style", "Palatino", "Book Antiqua", "Georgia", serif'

// Preferences persistence
type ReflowPrefs = {
  beat: BeatId
  focusStyle: FocusStyleId
  viewMode: 'full' | 'paragraph'
  fullPush: boolean
  moveSpeed: number
  panSpeed: number
  focusSpeed: number
  fontSize: number
  sentence: number
}

const DEFAULT_PREFS: ReflowPrefs = {
  beat: 'reader', focusStyle: 'gray', viewMode: 'full',
  fullPush: false, moveSpeed: 1, panSpeed: 1, focusSpeed: 1, fontSize: 18,
  sentence: 0,
}

const BEATS: BeatId[] = ['reader', 'ladder']
const FOCUS_STYLES: FocusStyleId[] = ['gray', 'redact', 'highlight', 'none']

function loadPrefs(): Partial<ReflowPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return {}
    const out: Partial<ReflowPrefs> = {}
    if (BEATS.includes(obj.beat)) out.beat = obj.beat
    if (FOCUS_STYLES.includes(obj.focusStyle)) out.focusStyle = obj.focusStyle
    if (obj.viewMode === 'full' || obj.viewMode === 'paragraph') out.viewMode = obj.viewMode
    if (typeof obj.fullPush === 'boolean') out.fullPush = obj.fullPush
    if (typeof obj.moveSpeed === 'number' && obj.moveSpeed > 0) out.moveSpeed = obj.moveSpeed
    if (typeof obj.panSpeed === 'number' && obj.panSpeed > 0) out.panSpeed = obj.panSpeed
    if (typeof obj.focusSpeed === 'number' && obj.focusSpeed > 0) out.focusSpeed = obj.focusSpeed
    if (typeof obj.fontSize === 'number' && obj.fontSize >= 8 && obj.fontSize <= 72) out.fontSize = obj.fontSize
    if (typeof obj.sentence === 'number' && obj.sentence >= 0 && Number.isInteger(obj.sentence)) out.sentence = obj.sentence
    return out
  } catch { return {} }
}

export const prefs: ReflowPrefs = { ...DEFAULT_PREFS, ...loadPrefs() }

export const isMobile = () => window.innerWidth <= 600

// Migrate old storage into library on first load
migrateOldStorage()

// Initialize from library active entry
const initial = activeEntry$.value
const initialText = initial?.content || DEFAULT_TEXT
const initialMarkdown = initial?.isMarkdown ?? false

// Core signals
export const text$ = signal(initialText)

// Fetch constitution as default if no library entries
if (library$.value.length === 0) loadDefaultText()
export const currentPara$ = signal(0)
export const inputMode$ = signal(false)
export const hudCollapsed$ = signal(false)
export const markdownMode$ = signal(initialMarkdown)

export const debug$ = signal(false)
export const inputTab$ = signal<'url' | 'text'>('url')
export const viewMode$ = signal<'paragraph' | 'full'>(prefs.viewMode)
export const extraOpen$ = signal(false)
export const maxWidth$ = signal(initialMarkdown ? READER_WIDTH : DEFAULT_WIDTH)
export const moveSpeed$ = signal(prefs.moveSpeed)
export const panSpeed$ = signal(prefs.panSpeed)
export const focusSpeed$ = signal(prefs.focusSpeed)
export const fullPush$ = signal(prefs.fullPush)
export const isAutoFont$ = signal(false)
export const fontSize$ = signal(prefs.fontSize)

// Engine state signals (updated from engine callbacks)
export const beat$ = signal<BeatId>(prefs.beat)
export const focusStyle$ = signal<FocusStyleId>(prefs.focusStyle)
export const sentence$ = signal<number | null>(0)
export const globalSentence$ = signal<number | null>(null)
export const sentenceCount$ = signal(1)
export const sentenceOnlyMode$ = signal(false)
export const layoutVersion$ = signal(0) // Bumped on layout for debug panel refresh

// Bridge: when active library entry changes, sync to text$/markdownMode$
let bridgeInitialized = false
effect(() => {
  const entry = activeEntry$.value
  if (!bridgeInitialized) { bridgeInitialized = true; return }
  if (!entry) return
  text$.value = entry.content
  markdownMode$.value = entry.isMarkdown
  maxWidth$.value = entry.isMarkdown ? READER_WIDTH : DEFAULT_WIDTH
  currentPara$.value = 0
})

// Debounced preferences save
let saveTimer: ReturnType<typeof setTimeout> | null = null
effect(() => {
  const current: ReflowPrefs = {
    beat: beat$.value,
    focusStyle: focusStyle$.value,
    viewMode: viewMode$.value,
    fullPush: fullPush$.value,
    moveSpeed: moveSpeed$.value,
    panSpeed: panSpeed$.value,
    focusSpeed: focusSpeed$.value,
    fontSize: fontSize$.value,
    sentence: globalSentence$.value ?? 0,
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(current)) } catch {}
  }, 500)
})

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

// Load constitution as default text
export async function loadDefaultText(): Promise<boolean> {
  try {
    const res = await fetch('/constitution.md')
    if (!res.ok) return false
    const raw = await res.text()
    if (!raw.trim()) return false
    addEntry({ content: raw, isMarkdown: true })
    return true
  } catch {
    return false
  }
}
