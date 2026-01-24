import type { DocumentModel, Word } from './document'
import { layoutLadderPixels, layoutReaderPixels } from './layouts'

export type BeatId = 'reader' | 'ladder'

export type Metrics = {
  charW: number
  lineH: number
  maxCols: number
  padX: number
  padY: number
  spaceW: number
}

export type LayoutContext = {
  model: DocumentModel
  metrics: Metrics
  words?: Word[]
  paragraphBreakRows?: number
}

// Layout now mutates Word.targetX/Y directly and returns bounds
export type LayoutResult = { maxRow: number }
export type LayoutFn = (ctx: LayoutContext) => LayoutResult

export type Beat = {
  id: BeatId
  name: string
  layout: LayoutFn
}

export type FocusStyleId = 'highlight' | 'gray' | 'redact' | 'none'

export type FocusStyle = {
  id: FocusStyleId
  name: string
}

export const FOCUS_STYLES: Record<FocusStyleId, FocusStyle> = {
  highlight: { id: 'highlight', name: 'Highlight' },
  gray: { id: 'gray', name: 'Gray' },
  redact: { id: 'redact', name: 'Redact' },
  none: { id: 'none', name: 'None' },
}

export const BEATS: Record<BeatId, Beat> = {
  reader: { id: 'reader', name: 'Reader', layout: (ctx) => layoutReaderPixels(ctx) },
  ladder: { id: 'ladder', name: 'Ladder', layout: (ctx) => layoutLadderPixels(ctx) },
}
