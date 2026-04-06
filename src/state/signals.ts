import { signal, computed, effect } from '@preact/signals'
import { parseDocument, splitParagraphs, DEFAULT_TEXT, markdownToParagraphs, extractMetadata } from '../syntaxExploder/document'
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

// ─── Article State ─────────────────────────────────────────────────────────
export const articleMetadata$ = computed(() => extractMetadata(text$.value))
export const activeParagraphIndex$ = computed(() => {
  const sentence = globalSentence$.value ?? 0
  const counts = sentenceCounts$.value
  return mapSentenceToParagraph(sentence, counts).paragraphIndex
})

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
  liteMode: boolean
  liteVariant: 'scroll' | 'poster'
  liteFitUnit: 'sentence' | 'paragraph'
  litePosterAlign: 'center' | 'left'
  motionPreset: MotionPreset
}

export type MotionPreset = 'fluid' | 'natural' | 'snappy' | 'instant'
export const MOTION_PRESETS: Record<MotionPreset, { move: number; pan: number; focus: number }> = {
  fluid: { move: 0.6, pan: 0.6, focus: 0.6 },
  natural: { move: 1.0, pan: 1.0, focus: 1.0 },
  snappy: { move: 1.8, pan: 1.8, focus: 1.8 },
  instant: { move: 3.0, pan: 3.0, focus: 3.0 },
}

const DEFAULT_PREFS: ReflowPrefs = {
  beat: 'reader', focusStyle: 'gray', viewMode: 'full',
  fullPush: false, moveSpeed: 1.8, panSpeed: 1.8, focusSpeed: 1.8, fontSize: 24,
  sentence: 0, liteMode: true, liteVariant: 'poster', liteFitUnit: 'sentence', litePosterAlign: 'center',
  motionPreset: 'snappy',
}

const BEATS: BeatId[] = ['reader', 'ladder']
const FOCUS_STYLES: FocusStyleId[] = ['gray', 'redact', 'highlight', 'none']
const MOTION_PRESET_IDS = Object.keys(MOTION_PRESETS)

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
    if (typeof obj.liteMode === 'boolean') out.liteMode = obj.liteMode
    if (obj.liteVariant === 'scroll' || obj.liteVariant === 'poster') out.liteVariant = obj.liteVariant
    if (obj.liteVariant === 'stories') out.liteVariant = 'poster'
    if (obj.liteFitUnit === 'sentence' || obj.liteFitUnit === 'paragraph') out.liteFitUnit = obj.liteFitUnit
    if (obj.litePosterAlign === 'center' || obj.litePosterAlign === 'left') out.litePosterAlign = obj.litePosterAlign
    if (MOTION_PRESET_IDS.includes(obj.motionPreset)) out.motionPreset = obj.motionPreset
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
export type TabId = 'style' | 'library'

export const text$ = signal(initialText)

// Fetch constitution as default if no library entries
if (library$.value.length === 0) loadDefaultText()
export const currentPara$ = signal(0)
export const controlsOpen$ = signal(false)
export const activeTab$ = signal<TabId>('style')
export const markdownMode$ = signal(initialMarkdown)

export const debug$ = signal(false)
export const inputTab$ = signal<'url' | 'text'>('url')
export const viewMode$ = signal<'paragraph' | 'full'>(prefs.viewMode)
export const extraOpen$ = signal(false)
export const maxWidth$ = signal(initialMarkdown ? READER_WIDTH : DEFAULT_WIDTH)
export const motionPreset$ = signal<MotionPreset>(prefs.motionPreset)
export const moveSpeed$ = signal(prefs.moveSpeed)
export const panSpeed$ = signal(prefs.panSpeed)
export const focusSpeed$ = signal(prefs.focusSpeed)
export const fullPush$ = signal(prefs.fullPush)
export const isAutoFont$ = signal(false)
export const fontSize$ = signal(prefs.fontSize)
export const liteMode$ = signal(prefs.liteMode)
export const liteVariant$ = signal<'scroll' | 'poster'>(prefs.liteVariant)
export const liteFitUnit$ = signal<'sentence' | 'paragraph'>(prefs.liteFitUnit)
export const litePosterAlign$ = signal<'center' | 'left'>(prefs.litePosterAlign)

// Sync motion speeds when preset changes
effect(() => {
  const preset = MOTION_PRESETS[motionPreset$.value]
  if (preset) {
    moveSpeed$.value = preset.move
    panSpeed$.value = preset.pan
    focusSpeed$.value = preset.focus
  }
})

// Engine state signals (updated from engine callbacks)
export const beat$ = signal<BeatId>(prefs.beat)
export const focusStyle$ = signal<FocusStyleId>(prefs.focusStyle)
export const sentence$ = signal<number | null>(0)
export const globalSentence$ = signal<number | null>(null)
export const firstWordY$ = signal<number>(0)
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
    liteMode: liteMode$.value,
    liteVariant: liteVariant$.value,
    liteFitUnit: liteFitUnit$.value,
    litePosterAlign: litePosterAlign$.value,
    motionPreset: motionPreset$.value,
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(current)) } catch {}
  }, 500)
})

// Derived signals
export const baseParagraphs$ = computed(() =>
  markdownMode$.value
    ? markdownToParagraphs(text$.value)
    : splitParagraphs(text$.value)
)

export const paragraphs$ = computed(() => {
  if (viewMode$.value === 'full') {
    const full = document$.value.paragraphs.join('\n\n').trim()
    return full ? [full] : []
  }
  return document$.value.paragraphs
})

export const document$ = computed(() =>
  parseDocument(baseParagraphs$.value, markdownMode$.value)
)

export const sentenceCounts$ = computed(() => document$.value.sentenceCounts)

// Helper functions
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
