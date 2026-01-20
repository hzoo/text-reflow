import { layoutCascade, layoutListAware, layoutMagnifyBlocks, layoutPlainWrap, layoutRadial, layoutTree } from './layouts'
import type { DocumentModel } from './model'

export type BeatId = 'plain' | 'cascade' | 'tree' | 'list' | 'magnify' | 'radial'

export type Metrics = {
  charW: number
  lineH: number
  maxCols: number
  padX: number
  padY: number
}

export type LayoutTarget = { col: number; row: number }
export type LayoutMap = Map<string, LayoutTarget>

export type LayoutContext = {
  model: DocumentModel
  metrics: Metrics
}

export type Beat = {
  id: BeatId
  name: string
  layout: (ctx: LayoutContext) => LayoutMap
}

export type FocusStyleId = 'gray' | 'redact' | 'none'

export type FocusStyle = {
  id: FocusStyleId
  name: string
}

export const FOCUS_STYLES: Record<FocusStyleId, FocusStyle> = {
  gray: { id: 'gray', name: 'Gray' },
  redact: { id: 'redact', name: 'Redact' },
  none: { id: 'none', name: 'None' },
}

export const BEATS: Record<BeatId, Beat> = {
  plain: { id: 'plain', name: 'Plain', layout: ({ model, metrics }) => layoutPlainWrap(model, metrics) },
  cascade: { id: 'cascade', name: 'Buildup / Cascade', layout: ({ model, metrics }) => layoutCascade(model, metrics) },
  tree: { id: 'tree', name: 'Explosion / Tree', layout: ({ model, metrics }) => layoutTree(model, metrics) },
  list: { id: 'list', name: 'List-Aware Grid', layout: ({ model, metrics }) => layoutListAware(model, metrics) },
  magnify: { id: 'magnify', name: 'Magnify', layout: ({ model, metrics }) => layoutMagnifyBlocks(model, metrics) },
  radial: { id: 'radial', name: 'Radial Burst', layout: ({ model, metrics }) => layoutRadial(model, metrics) },
}
