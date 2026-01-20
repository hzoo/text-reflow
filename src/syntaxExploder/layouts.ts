import type { LayoutMap, Metrics } from './experiments'
import type { DocumentModel, Word } from './model'

function placeWrap(words: Word[], start: number, end: number, metrics: Metrics, indentCols: number, row: number): { map: LayoutMap; nextRow: number } {
  const map: LayoutMap = new Map()
  const safeIndent = Math.min(indentCols, Math.floor(metrics.maxCols * 0.6))
  let col = safeIndent

  for (let i = start; i < end; i++) {
    const w = words[i]
    const wordCols = Math.max(1, w.cols)

    // Wrap if we exceed maxCols, or if we are at the very start and the word itself is too long
    if (col + wordCols > metrics.maxCols && col > safeIndent) {
      row++
      col = safeIndent
    }

    map.set(w.id, { col, row })
    col += wordCols
  }

  return { map, nextRow: row + 1 }
}

export function layoutPlainWrap(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model

  let row = 0
  let col = 0

  for (const w of words) {
    const wordCols = Math.max(1, w.cols)

    if (col > 0 && col + wordCols > metrics.maxCols) {
      row++
      col = 0
    }

    map.set(w.id, { col, row })
    col += wordCols

    if (w.breakAfter) {
      row += Math.max(1, w.breakAfterRows)
      col = 0
    }
  }

  return map
}

export function layoutReaderPixels(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model
  const maxWidth = metrics.maxCols
  let row = 0
  let x = 0

  for (const w of words) {
    const width = Math.max(1, w.pixelWidth)
    if (x > 0 && x + width > maxWidth) {
      row++
      x = 0
    }

    map.set(w.id, { col: Math.round(x), row })
    x += width

    if (w.breakAfter) {
      row += Math.max(1, w.breakAfterRows)
      x = 0
    }
  }

  return map
}

export function layoutLadder(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model
  const maxIndent = Math.floor(metrics.maxCols * 0.3)

  let row = 0
  let col = 0
  let indent = 0

  for (const w of words) {
    const wordCols = Math.max(1, w.cols)
    if (col === 0) col = indent

    if (col > 0 && col + wordCols > metrics.maxCols) {
      row++
      col = indent
    }

    map.set(w.id, { col, row })
    col += wordCols

    if (w.breakAfter) {
      row += Math.max(1, w.breakAfterRows)
      col = 0
      indent = indent === 0 ? maxIndent : 0
    }
  }

  return map
}

export function layoutLadderPixels(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model
  const maxWidth = metrics.maxCols
  const maxIndent = Math.floor(maxWidth * 0.18)

  let row = 0
  let x = 0
  let indent = 0

  for (const w of words) {
    const width = Math.max(1, w.pixelWidth)
    if (x === 0) x = indent

    if (x > 0 && x + width > maxWidth) {
      row++
      x = indent
    }

    map.set(w.id, { col: Math.round(x), row })
    x += width

    if (w.breakAfter) {
      row += Math.max(1, w.breakAfterRows)
      x = 0
      indent = indent === 0 ? maxIndent : 0
    }
  }

  return map
}

export function layoutCascade(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model

  // one sentence per row, with drifting indent + intra-row wrapping
  const driftCols = 2
  let row = 0

  let i = 0
  while (i < words.length) {
    const s = words[i].sentenceIndex
    const start = i
    while (i < words.length && words[i].sentenceIndex === s) i++

    const indent = Math.min(metrics.maxCols - 10, s * driftCols)
    const { map: chunkMap, nextRow } = placeWrap(words, start, i, metrics, indent, row)
    for (const [k, v] of chunkMap) map.set(k, v)

    row = nextRow
  }

  return map
}

const SUBORDINATE = new Set(['because', 'which', 'who', 'whom', 'whose', 'where', 'when', 'while', 'although', 'since', 'that', 'whether'])
const CLAUSE_BREAK = new Set([',', ';', ':'])

const VERBS = new Set(['is', 'are', 'was', 'were', 'mean', 'increasing', 'approach', 'gain', 'suit', 'derive', 'taken', 'include', 'speak', 'refer', 'co-exist'])

export function layoutSpine(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model
  const centerX = Math.floor(metrics.maxCols / 2)

  let row = 0
  let i = 0
  while (i < words.length) {
    const sentenceIndex = words[i].sentenceIndex
    const start = i
    while (i < words.length && words[i].sentenceIndex === sentenceIndex) i++

    const sWords = words.slice(start, i)
    // Find pivot (first verb or middle word)
    let pivotIdx = sWords.findIndex(w => VERBS.has(w.text.toLowerCase().replace(/[^a-z]/g, '')))
    if (pivotIdx === -1) pivotIdx = Math.floor(sWords.length * 0.4)

    // Calculate total columns needed for the sentence to see if it fits
    const totalCols = sWords.reduce((sum, w) => sum + w.cols, 0)
    
    if (totalCols < metrics.maxCols - 10) {
      // Fits in one row, center it on the pivot
      const pivotWord = sWords[pivotIdx]
      const colsBefore = sWords.slice(0, pivotIdx).reduce((sum, w) => sum + w.cols, 0)
      const startCol = Math.max(0, centerX - colsBefore - Math.floor(pivotWord.text.length / 2))
      
      let curCol = startCol
      for (const w of sWords) {
        map.set(w.id, { col: curCol, row })
        curCol += w.cols
      }
      row += 2
    } else {
      // Doesn't fit, wrap it like a centered paragraph
      const { map: chunkMap, nextRow } = placeWrap(words, start, i, metrics, 4, row)
      for (const [k, v] of chunkMap) {
        // Offset each row to be centered
        map.set(k, v)
      }
      row = nextRow + 1
    }
  }

  return map
}

export function layoutTree(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model

  const indentCols = 4
  let row = 0

  let i = 0
  while (i < words.length) {
    const sentence = words[i].sentenceIndex
    const start = i
    while (i < words.length && words[i].sentenceIndex === sentence) i++

    let segStart = start
    let depth = 0

    for (let j = start; j < i; j++) {
      const token = words[j]
      const raw = token.text
      const lower = raw.toLowerCase().replace(/[^a-z]+$/g, '')

      const isSub = SUBORDINATE.has(lower)
      const isAtEnd = j === i - 1
      const isBreakAfter = j > start && CLAUSE_BREAK.has(words[j - 1].text.replace(/\s+$/g, ''))

      if (isSub || isAtEnd || isBreakAfter) {
        let segEnd = (isSub || isBreakAfter) ? j : i
        
        if (segEnd > segStart) {
          const { map: chunkMap, nextRow } = placeWrap(words, segStart, segEnd, metrics, depth * indentCols, row)
          for (const [k, v] of chunkMap) map.set(k, v)
          row = nextRow
          segStart = segEnd
        }

        if (isSub) depth = Math.min(6, depth + 1)
        if (raw.includes(';') || raw.includes(':') || raw.includes('.')) depth = 0
      }
    }

    row++
  }

  return map
}

// Magnify layout: each sentence is its own wrapped block with extra vertical gap
export function layoutMagnifyBlocks(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model

  const sentenceGap = 4 // Extra rows between sentences for zoom room
  let row = 0

  let i = 0
  while (i < words.length) {
    const sentence = words[i].sentenceIndex
    const start = i
    while (i < words.length && words[i].sentenceIndex === sentence) i++

    const { map: chunkMap, nextRow } = placeWrap(words, start, i, metrics, 0, row)
    for (const [k, v] of chunkMap) map.set(k, v)

    row = nextRow + sentenceGap
  }

  return map
}

// Radial layout: each sentence radiates from a central pivot word
export function layoutRadial(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model

  const centerX = Math.floor(metrics.maxCols / 2)
  let row = 0

  let i = 0
  while (i < words.length) {
    const sentence = words[i].sentenceIndex
    const start = i
    while (i < words.length && words[i].sentenceIndex === sentence) i++

    const sWords = words.slice(start, i)
    
    // Find pivot (main verb or middle)
    let pivotIdx = sWords.findIndex(w => VERBS.has(w.text.toLowerCase().replace(/[^a-z]/g, '')))
    if (pivotIdx === -1) pivotIdx = Math.floor(sWords.length / 2)

    // Place pivot at center
    const pivotWord = sWords[pivotIdx]
    const pivotCol = centerX - Math.floor(pivotWord.cols / 2)
    map.set(pivotWord.id, { col: pivotCol, row })

    // Words before pivot flow left, wrap up
    let leftCol = pivotCol
    let leftRowOffset = 0
    const leftPositions: { id: string; col: number; rowOffset: number }[] = []
    for (let j = pivotIdx - 1; j >= 0; j--) {
      const w = sWords[j]
      leftCol -= w.cols
      if (leftCol < 0) {
        leftRowOffset--
        leftCol = pivotCol - w.cols
      }
      leftPositions.push({ id: w.id, col: Math.max(0, leftCol), rowOffset: leftRowOffset })
    }

    // Calculate row offset to keep everything positive
    const minOffset = Math.min(0, ...leftPositions.map(p => p.rowOffset))
    const rowAdjust = -minOffset

    // Apply left positions with adjustment
    for (const { id, col, rowOffset } of leftPositions) {
      map.set(id, { col, row: row + rowOffset + rowAdjust })
    }

    // Update pivot row
    map.set(pivotWord.id, { col: pivotCol, row: row + rowAdjust })

    // Words after pivot flow right-down
    let rightCol = pivotCol + pivotWord.cols
    let rightRow = row + rowAdjust
    for (let j = pivotIdx + 1; j < sWords.length; j++) {
      const w = sWords[j]
      if (rightCol + w.cols > metrics.maxCols) {
        rightRow++
        rightCol = pivotCol + 4
      }
      map.set(w.id, { col: rightCol, row: rightRow })
      rightCol += w.cols
    }

    row = Math.max(row + rowAdjust, rightRow) + 3
  }

  return map
}

// Parallel phrase starters (prepositions, determiners, etc.)
const PARALLEL_STARTERS = new Set(['to', 'for', 'in', 'by', 'of', 'with', 'from', 'the', 'a', 'an', 'this', 'that', 'more', 'better', 'and'])

type ListItem = { start: number; end: number; cols: number; starterType: string }

function getStarterType(word: string): string {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '')
  if (PARALLEL_STARTERS.has(lower)) return lower
  if (word.startsWith('"') || word.startsWith("'")) return 'quote'
  return 'other'
}

function detectListItems(sWords: Word[], commaIndices: number[], andOrIdx: number): { introEnd: number; items: ListItem[] } {
  // Find intro: text before the list starts
  // Look for colon, or detect where parallel structure begins
  let introEnd = 0
  
  // Check for colon
  for (let j = 0; j < sWords.length; j++) {
    if (sWords[j].text.includes(':')) {
      introEnd = j + 1
      break
    }
  }

  // If no colon, find where parallel phrases start
  if (introEnd === 0 && commaIndices.length >= 2) {
    // Look at what starts each comma-separated chunk
    const chunkStarters: { idx: number; type: string }[] = []
    let chunkStart = 0
    
    for (const commaIdx of commaIndices) {
      if (chunkStart < sWords.length) {
        chunkStarters.push({ idx: chunkStart, type: getStarterType(sWords[chunkStart].text) })
      }
      chunkStart = commaIdx + 1
    }
    // Last chunk
    if (chunkStart < sWords.length) {
      chunkStarters.push({ idx: chunkStart, type: getStarterType(sWords[chunkStart].text) })
    }

    // Find first index where parallel structure begins (same starter type repeats)
    for (let j = 0; j < chunkStarters.length - 1; j++) {
      if (chunkStarters[j].type === chunkStarters[j + 1].type && chunkStarters[j].type !== 'other') {
        introEnd = chunkStarters[j].idx
        break
      }
    }
  }

  // Parse list items
  const items: ListItem[] = []
  let itemStart = introEnd

  for (const commaIdx of commaIndices) {
    if (commaIdx >= itemStart) {
      const itemEnd = commaIdx + 1
      const itemCols = sWords.slice(itemStart, itemEnd).reduce((sum, w) => sum + w.cols, 0)
      const starterType = itemStart < sWords.length ? getStarterType(sWords[itemStart].text) : 'other'
      items.push({ start: itemStart, end: itemEnd, cols: itemCols, starterType })
      itemStart = itemEnd
    }
  }

  // Final item (after last comma, before "and/or" or end)
  if (itemStart < sWords.length) {
    const finalEnd = andOrIdx > itemStart ? andOrIdx : sWords.length
    if (finalEnd > itemStart) {
      const itemCols = sWords.slice(itemStart, finalEnd).reduce((sum, w) => sum + w.cols, 0)
      const starterType = getStarterType(sWords[itemStart].text)
      items.push({ start: itemStart, end: finalEnd, cols: itemCols, starterType })
    }
  }

  return { introEnd, items }
}

// List-aware layout: detects parallel phrases and arranges in multi-column grid
export function layoutListAware(model: DocumentModel, metrics: Metrics): LayoutMap {
  const map: LayoutMap = new Map()
  const { words } = model

  // Adaptive columns: 2 on narrow screens, 3 on wide
  const numCols = metrics.maxCols < 60 ? 2 : 3
  const colWidth = Math.floor(metrics.maxCols / numCols)
  const colStarts = numCols === 2
    ? [0, colWidth]
    : [0, colWidth, colWidth * 2]

  let row = 0

  let i = 0
  while (i < words.length) {
    const sentence = words[i].sentenceIndex
    const start = i
    while (i < words.length && words[i].sentenceIndex === sentence) i++

    const sWords = words.slice(start, i)

    // Find commas and "and/or"
    const commaIndices: number[] = []
    let andOrIdx = -1
    for (let j = 0; j < sWords.length; j++) {
      const raw = sWords[j].text.replace(/\s+$/g, '')
      if (raw.endsWith(',')) commaIndices.push(j)
      const lower = raw.toLowerCase().replace(/[^a-z]/g, '')
      if ((lower === 'and' || lower === 'or') && andOrIdx === -1) andOrIdx = j
    }

    const hasListStructure = commaIndices.length >= 2

    if (hasListStructure) {
      const { introEnd, items } = detectListItems(sWords, commaIndices, andOrIdx)

      // Place intro text (before list)
      if (introEnd > 0) {
        let col = 0
        for (let j = 0; j < introEnd; j++) {
          const w = sWords[j]
          if (col > 0 && col + w.cols > metrics.maxCols) {
            row++
            col = 0
          }
          map.set(w.id, { col, row })
          col += w.cols
        }
        row += 3 // More space after intro
      }

      // Layout items in 3-column grid
      // Items flow left-to-right, top-to-bottom
      // If item is too long for one column, it gets its own row (full width)
      let gridCol = 0
      let gridRow = row
      let rowHeights: number[] = [0, 0, 0] // Track height used in each column for current row

      for (const item of items) {
        const fitsInColumn = item.cols <= colWidth - 1

        if (fitsInColumn) {
          // Find next available column
          if (gridCol >= numCols) {
            // Move to next row with extra spacing
            gridRow += Math.max(...rowHeights) + 2
            gridCol = 0
            rowHeights = [0, 0, 0]
          }

          // Place item in current column, may wrap within column
          let col = colStarts[gridCol]
          let itemRow = gridRow
          for (let j = item.start; j < item.end; j++) {
            const w = sWords[j]
            if (col > colStarts[gridCol] && col + w.cols > colStarts[gridCol] + colWidth) {
              itemRow++
              col = colStarts[gridCol]
            }
            map.set(w.id, { col, row: itemRow })
            col += w.cols
          }
          rowHeights[gridCol] = Math.max(rowHeights[gridCol], itemRow - gridRow + 1)
          gridCol++
        } else {
          // Long item: give it a full-width row
          if (gridCol > 0) {
            gridRow += Math.max(...rowHeights) + 2
            gridCol = 0
            rowHeights = [0, 0, 0]
          }

          // Place long item with wrapping
          let col = colStarts[0] + 4 // Indent
          let itemRow = gridRow
          for (let j = item.start; j < item.end; j++) {
            const w = sWords[j]
            if (col > colStarts[0] + 4 && col + w.cols > metrics.maxCols) {
              itemRow++
              col = colStarts[0] + 8 // More indent for continuation
            }
            map.set(w.id, { col, row: itemRow })
            col += w.cols
          }
          gridRow = itemRow + 2
          rowHeights = [0, 0, 0]
        }
      }

      row = gridRow + Math.max(...rowHeights) + 2

      // Place "and/or" + remainder
      if (andOrIdx >= 0 && andOrIdx < sWords.length) {
        // Check if there's content after andOr that wasn't in items
        let alreadyPlaced = false
        for (const item of items) {
          if (item.start <= andOrIdx && andOrIdx < item.end) {
            alreadyPlaced = true
            break
          }
        }

        if (!alreadyPlaced) {
          row++
          let col = colStarts[numCols - 1]
          for (let j = andOrIdx; j < sWords.length; j++) {
            const w = sWords[j]
            if (col + w.cols > metrics.maxCols) {
              row++
              col = colStarts[numCols - 1]
            }
            map.set(w.id, { col, row })
            col += w.cols
          }
          row++
        }
      }

      row += 3 // More gap after list sentence
    } else {
      // Not a list, normal wrap
      const { map: chunkMap, nextRow } = placeWrap(words, start, i, metrics, 0, row)
      for (const [k, v] of chunkMap) map.set(k, v)
      row = nextRow + 2
    }
  }

  return map
}
