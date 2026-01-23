import { signal, computed, batch } from '@preact/signals'
import { extractMetadata } from '../syntaxExploder/document'

export interface TextEntry {
  id: string
  title: string
  content: string
  isMarkdown: boolean
  source?: string
  createdAt: number
}

const LIBRARY_KEY = 'reflow-library'
const ACTIVE_KEY = 'reflow-active'
const MAX_ENTRIES = 20

function loadLibrary(): TextEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLibrary(entries: TextEntry[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries))
}

function deriveTitle(content: string, source?: string): string {
  const meta = extractMetadata(content)
  if (meta.title && meta.title !== 'Pasted Text') return meta.title
  
  if (source) {
    try { return new URL(source).hostname.replace(/^www\./, '') } catch {}
  }
  // First sentence or first ~40 chars
  const firstLine = content.split(/[.!?\n]/)[0]?.trim() || ''
  return firstLine.slice(0, 40) || 'Untitled'
}

// Signals
export const library$ = signal<TextEntry[]>(loadLibrary())
export const activeId$ = signal<string | null>(localStorage.getItem(ACTIVE_KEY) || null)

export const activeEntry$ = computed<TextEntry | null>(() => {
  const id = activeId$.value
  if (!id) return library$.value[0] || null
  return library$.value.find(e => e.id === id) || library$.value[0] || null
})

// Operations
export function addEntry(opts: { content: string; isMarkdown: boolean; source?: string }): TextEntry {
  const entry: TextEntry = {
    id: crypto.randomUUID(),
    title: deriveTitle(opts.content, opts.source),
    content: opts.content,
    isMarkdown: opts.isMarkdown,
    source: opts.source,
    createdAt: Date.now(),
  }
  const next = [entry, ...library$.value].slice(0, MAX_ENTRIES)
  batch(() => {
    library$.value = next
    activeId$.value = entry.id
  })
  saveLibrary(next)
  localStorage.setItem(ACTIVE_KEY, entry.id)
  return entry
}

export function setActive(id: string) {
  const entries = library$.value
  const idx = entries.findIndex(e => e.id === id)
  if (idx < 0) return
  // LRU touch: move to front
  const next = [entries[idx], ...entries.slice(0, idx), ...entries.slice(idx + 1)]
  batch(() => {
    library$.value = next
    activeId$.value = id
  })
  saveLibrary(next)
  localStorage.setItem(ACTIVE_KEY, id)
}

export function deleteEntry(id: string) {
  const entries = library$.value.filter(e => e.id !== id)
  const wasActive = activeId$.value === id
  library$.value = entries
  saveLibrary(entries)
  if (wasActive) {
    const nextId = entries[0]?.id || null
    activeId$.value = nextId
    if (nextId) localStorage.setItem(ACTIVE_KEY, nextId)
    else localStorage.removeItem(ACTIVE_KEY)
  }
}

export async function fetchUrlToEntry(url: string): Promise<TextEntry> {
  const response = await fetch(`https://r.jina.ai/${url}`)
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Load failed: ${response.status} ${response.statusText}. ${errorText}`)
  }
  const raw = (await response.text()).trim()
  if (!raw) throw new Error('No content returned.')
  return addEntry({ content: raw, isMarkdown: true, source: url })
}

/** Bootstrap: migrate old reflow-text into library if library is empty */
export function migrateOldStorage() {
  if (library$.value.length > 0) return
  const oldText = localStorage.getItem('reflow-text')
  if (!oldText) return
  const oldMd = localStorage.getItem('reflow-markdown') === '1'
  addEntry({ content: oldText, isMarkdown: oldMd })
}
