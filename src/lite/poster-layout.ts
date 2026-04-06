import { READER_FONT } from '../state/signals'
import type { Word } from '../syntaxExploder/document'

export type PosterUnit = 'sentence' | 'paragraph'

type PosterAtom = {
  key: string
  text: string
  fontStyle: Word['fontStyle']
  fontWeight: Word['fontWeight']
  scale: number
  spaceBefore: boolean
}

export type PosterPiece = {
  key: string
  text: string
  spaceBefore: boolean
  fontStyle: Word['fontStyle']
  fontWeight: Word['fontWeight']
  fontSize: number
}

export type PosterLine = {
  key: string
  pieces: PosterPiece[]
  width: number
  height: number
}

export type PosterLayout = {
  fontSize: number
  lines: PosterLine[]
  height: number
}

type PosterLayoutCandidate = PosterLayout & {
  fitsWidth: boolean
}

type CandidateLine = {
  pieces: PosterPiece[]
  width: number
  height: number
}

const MIN_FONT_PX = 12
const MAX_FONT_PX = 112
const SCALE_MIN = 0.65
const SCALE_MAX = 2.4
const widthCache = new Map<string, number>()
const lineHeightCache = new Map<string, number>()
let measureContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null

function getMeasureContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (measureContext) return measureContext
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d')
    if (ctx) {
      measureContext = ctx
      return ctx
    }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable for poster layout')
  measureContext = ctx
  return ctx
}

function buildFontString(fontSize: number, fontStyle: Word['fontStyle'], fontWeight: Word['fontWeight']): string {
  const stylePart = fontStyle === 'normal' ? '' : fontStyle
  const weightPart = fontWeight === 'normal' ? '' : fontWeight
  return `${stylePart} ${weightPart} ${fontSize}px ${READER_FONT}`.replace(/\s+/g, ' ').trim()
}

function measureWidth(text: string, fontSize: number, fontStyle: Word['fontStyle'], fontWeight: Word['fontWeight']): number {
  const font = buildFontString(fontSize, fontStyle, fontWeight)
  const key = `${font}|${text}`
  const cached = widthCache.get(key)
  if (cached !== undefined) return cached
  const ctx = getMeasureContext()
  ctx.font = font
  const width = ctx.measureText(text).width
  widthCache.set(key, width)
  return width
}

function measureLineHeight(fontSize: number, fontStyle: Word['fontStyle'], fontWeight: Word['fontWeight']): number {
  const font = buildFontString(fontSize, fontStyle, fontWeight)
  const cached = lineHeightCache.get(font)
  if (cached !== undefined) return cached
  const ctx = getMeasureContext()
  ctx.font = font
  const metrics = ctx.measureText('Mg')
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.82
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.28
  const lineHeight = Math.ceil(Math.max(fontSize * 1.18, ascent + descent + fontSize * 0.12))
  lineHeightCache.set(font, lineHeight)
  return lineHeight
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale))
}

function buildAtoms(words: Word[]): PosterAtom[] {
  const atoms: PosterAtom[] = []
  let pendingSpace = false
  for (const word of words) {
    if (word.imageUrl) continue
    const text = word.displayText.trim()
    if (!text) {
      pendingSpace = pendingSpace || word.spaceAfter
      continue
    }
    atoms.push({
      key: word.id,
      text,
      fontStyle: word.fontStyle,
      fontWeight: word.fontWeight,
      scale: clampScale(word.baseScale),
      spaceBefore: pendingSpace,
    })
    pendingSpace = word.spaceAfter
  }
  return atoms
}

function finalizeLine(line: CandidateLine, index: number): PosterLine {
  return {
    key: `line-${index}`,
    pieces: line.pieces,
    width: line.width,
    height: line.height,
  }
}

function layoutAtSize(words: Word[], fontSize: number, maxWidth: number): PosterLayoutCandidate {
  const atoms = buildAtoms(words)
  const lines: PosterLine[] = []
  let current: CandidateLine = { pieces: [], width: 0, height: 0 }
  let fitsWidth = true

  for (const atom of atoms) {
    const scaledSize = Math.max(1, Math.round(fontSize * atom.scale))
    const textWidth = measureWidth(atom.text, scaledSize, atom.fontStyle, atom.fontWeight)
    const spaceWidth = atom.spaceBefore ? measureWidth(' ', scaledSize, atom.fontStyle, atom.fontWeight) : 0

    if (textWidth > maxWidth) fitsWidth = false

    const needsSpace = current.pieces.length > 0 && atom.spaceBefore
    let advance = textWidth + (needsSpace ? spaceWidth : 0)

    if (current.pieces.length > 0 && current.width + advance > maxWidth) {
      lines.push(finalizeLine(current, lines.length))
      current = { pieces: [], width: 0, height: 0 }
      advance = textWidth
    }

    current.pieces.push({
      key: atom.key,
      text: atom.text,
      spaceBefore: current.pieces.length > 0 && atom.spaceBefore,
      fontStyle: atom.fontStyle,
      fontWeight: atom.fontWeight,
      fontSize: scaledSize,
    })
    current.width += advance
    current.height = Math.max(current.height, measureLineHeight(scaledSize, atom.fontStyle, atom.fontWeight))
  }

  if (current.pieces.length > 0) {
    lines.push(finalizeLine(current, lines.length))
  }

  if (lines.length === 0) {
    return { fontSize, lines: [], height: 0, fitsWidth }
  }

  let height = 0
  for (const line of lines) height += line.height
  return { fontSize, lines, height, fitsWidth }
}

export function fitPosterLayout(words: Word[], maxWidth: number, maxHeight: number): PosterLayout {
  const safeWidth = Math.max(120, Math.floor(maxWidth))
  const safeHeight = Math.max(120, Math.floor(maxHeight))
  const source = words.filter(word => !word.imageUrl)
  if (source.length === 0) {
    return { fontSize: MIN_FONT_PX, lines: [], height: 0 }
  }

  let lo = MIN_FONT_PX
  let hi = MAX_FONT_PX
  let best = layoutAtSize(source, MIN_FONT_PX, safeWidth)

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const candidate = layoutAtSize(source, mid, safeWidth)
    if (candidate.fitsWidth && candidate.height <= safeHeight) {
      best = candidate
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return {
    fontSize: best.fontSize,
    lines: best.lines,
    height: best.height,
  }
}
