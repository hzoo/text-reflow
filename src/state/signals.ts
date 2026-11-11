import { signal, computed, effect, batch } from '@preact/signals'
import { parseDocument, splitParagraphs, DEFAULT_TEXT, markdownToParagraphs, extractMetadata } from '../syntaxExploder/document'
import { type BeatId, type FocusStyleId } from '../syntaxExploder/experiments'
import type { FontSizing } from '../syntaxExploder/engine'
import { migrateOldStorage, activeEntry$, library$, addStarterEntry } from './library'

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
  autoFont?: boolean
  positions: Record<string, number>
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
  positions: {}, liteMode: true, liteVariant: 'poster', liteFitUnit: 'sentence', litePosterAlign: 'center',
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
    if (typeof obj.fontSize === 'number' && obj.fontSize >= 8 && obj.fontSize <= 128) out.fontSize = Math.max(10, obj.fontSize)
    if (typeof obj.autoFont === 'boolean') out.autoFont = obj.autoFont
    if (obj.positions && typeof obj.positions === 'object' && !Array.isArray(obj.positions)) {
      out.positions = Object.fromEntries(Object.entries(obj.positions).filter(
        ([, index]) => typeof index === 'number' && Number.isSafeInteger(index) && index >= 0,
      )) as Record<string, number>
    }
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

// Core signals
export type TabId = 'style' | 'library'

export const text$ = computed(() => activeEntry$.value?.content ?? DEFAULT_TEXT)

// Fetch constitution as default if no library entries
if (library$.value.length === 0) loadDefaultText()
export const currentPara$ = signal(0)
export const controlsOpen$ = signal(false)
export const activeTab$ = signal<TabId>('style')
export const markdownMode$ = computed(() => activeEntry$.value?.isMarkdown ?? false)

export const debug$ = signal(false)
export const inputTab$ = signal<'url' | 'text'>('url')
export const viewMode$ = signal<'paragraph' | 'full'>(prefs.viewMode)
export const extraOpen$ = signal(false)
export const maxWidth$ = signal(markdownMode$.peek() ? READER_WIDTH : DEFAULT_WIDTH)
export const motionPreset$ = signal<MotionPreset>(prefs.motionPreset)
export const moveSpeed$ = signal(prefs.moveSpeed)
export const panSpeed$ = signal(prefs.panSpeed)
export const focusSpeed$ = signal(prefs.focusSpeed)
export const fullPush$ = signal(prefs.fullPush)
const initiallyAuto = prefs.autoFont ?? (typeof window !== 'undefined' && isMobile())
export const fontSizing$ = signal<FontSizing>(initiallyAuto ? { kind: 'auto' } : { kind: 'manual', size: prefs.fontSize })
export const fittedFontSize$ = signal(prefs.fontSize)
export const fontSize$ = computed(() => {
  const sizing = fontSizing$.value
  return sizing.kind === 'manual' ? sizing.size : fittedFontSize$.value
})

export function setManualFontSize(size: number) {
  if (!Number.isFinite(size)) return
  const next = Math.max(10, Math.min(128, size))
  const current = fontSizing$.peek()
  if (current.kind === 'manual' && current.size === next) return
  fontSizing$.value = { kind: 'manual', size: next }
}

export function toggleAutoFont() {
  if (fontSizing$.peek().kind === 'auto') setManualFontSize(fontSize$.peek())
  else fontSizing$.value = { kind: 'auto' }
}
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
const readingPosition$ = signal<{ articleId: string | null; sentence: number | null }>({ articleId: null, sentence: null })
export const globalSentence$ = computed(() => readingPosition$.value.sentence)
export const firstWordY$ = signal<number>(0)
export const sentenceCount$ = signal(1)
export const sentenceOnlyMode$ = signal(false)
export const layoutVersion$ = signal(0) // Bumped on layout for debug panel refresh

const savedPositions = new Map(Object.entries(prefs.positions))

export function setReadingSentence(sentence: number | null) {
  const position = readingPosition$.peek()
  if (position.articleId !== (activeEntry$.peek()?.id ?? null)) return
  if (position.sentence !== sentence) readingPosition$.value = { ...position, sentence }
}

// Derived document data
export const baseParagraphs$ = computed(() =>
  markdownMode$.value
    ? markdownToParagraphs(text$.value)
    : splitParagraphs(text$.value)
)

export const document$ = computed(() => {
  // Different library entries can have identical text and still own different cursors.
  void activeEntry$.value
  return parseDocument(baseParagraphs$.value, markdownMode$.value)
})

export const sentenceCounts$ = computed(() => document$.value.sentenceCounts)

effect(() => {
  const entry = activeEntry$.value
  const previous = readingPosition$.peek()
  if (previous.articleId !== null && previous.sentence !== null) {
    savedPositions.set(previous.articleId, previous.sentence)
  }
  const { sentenceCount, sentenceCounts } = document$.peek()
  const saved = entry ? savedPositions.get(entry.id) ?? 0 : 0
  const sentence = sentenceCount > 0 ? Math.min(saved, sentenceCount - 1) : null
  batch(() => {
    maxWidth$.value = entry?.isMarkdown ? READER_WIDTH : DEFAULT_WIDTH
    currentPara$.value = mapSentenceToParagraph(sentence ?? 0, sentenceCounts).paragraphIndex
    readingPosition$.value = { articleId: entry?.id ?? null, sentence }
  })
})

// Debounced preferences save
let pendingSave: { timer: ReturnType<typeof setTimeout>; prefs: ReflowPrefs } | null = null

export function flushPrefs() {
  if (!pendingSave) return
  const { timer, prefs } = pendingSave
  pendingSave = null
  clearTimeout(timer)
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch {}
}

effect(() => {
  const { articleId, sentence } = readingPosition$.value
  const positions = new Map<string, number>()
  for (const entry of library$.value) {
    const index = entry.id === articleId ? sentence : savedPositions.get(entry.id)
    if (index != null) positions.set(entry.id, index)
  }
  for (const id of savedPositions.keys()) {
    if (!positions.has(id)) savedPositions.delete(id)
  }
  const current: ReflowPrefs = {
    beat: beat$.value,
    focusStyle: focusStyle$.value,
    viewMode: viewMode$.value,
    fullPush: fullPush$.value,
    moveSpeed: moveSpeed$.value,
    panSpeed: panSpeed$.value,
    focusSpeed: focusSpeed$.value,
    fontSize: fontSize$.value,
    autoFont: fontSizing$.value.kind === 'auto',
    positions: Object.fromEntries(positions),
    liteMode: liteMode$.value,
    liteVariant: liteVariant$.value,
    liteFitUnit: liteFitUnit$.value,
    litePosterAlign: litePosterAlign$.value,
    motionPreset: motionPreset$.value,
  }
  if (pendingSave) clearTimeout(pendingSave.timer)
  pendingSave = { timer: setTimeout(flushPrefs, 500), prefs: current }
})

export const paragraphs$ = computed(() => {
  if (viewMode$.value === 'full') {
    const full = document$.value.paragraphs.join('\n\n').trim()
    return full ? [full] : []
  }
  return document$.value.paragraphs
})

export function setViewMode(mode: 'paragraph' | 'full') {
  if (mode === viewMode$.value) return
  const paragraphIndex = mode === 'full' ? 0 : activeParagraphIndex$.value
  batch(() => {
    viewMode$.value = mode
    currentPara$.value = paragraphIndex
  })
}

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
    if (!res.ok || res.headers.get('content-type')?.startsWith('text/html')) return false
    const raw = await res.text()
    return Boolean(raw.trim()) && addStarterEntry(raw)
  } catch {
    return false
  }
}
