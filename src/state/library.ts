import { signal, computed } from '@preact/signals'
import { extractMetadata } from '../syntaxExploder/document'

export interface TextEntry {
  id: string
  title: string
  content: string
  isMarkdown: boolean
  source?: string
  createdAt: number
}

type EntryInput = Pick<TextEntry, 'content' | 'isMarkdown' | 'source'>

type ImportRequest =
  | { kind: 'url'; url: string; controller: AbortController; showLoading: boolean }
  | { kind: 'file' }

const LIBRARY_KEY = 'reflow-library'
const MAX_ENTRIES = 20

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function isTextEntry(value: unknown): value is TextEntry {
  if (!value || typeof value !== 'object') return false
  const { id, title, content, isMarkdown, source, createdAt } = value as Partial<TextEntry>
  if (source !== undefined) {
    if (typeof source !== 'string') return false
    try { new URL(source) } catch { return false }
  }
  return typeof id === 'string' && typeof title === 'string' && typeof content === 'string'
    && typeof isMarkdown === 'boolean' && typeof createdAt === 'number'
}

function loadLibrary(): TextEntry[] | null {
  try {
    const raw = readStorage(LIBRARY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter(isTextEntry).slice(0, MAX_ENTRIES) : null
  } catch {
    return null
  }
}

function updateLibrary(entries: TextEntry[]) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries)) } catch {}
  library$.value = entries
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

// The most recently used entry is always first, including in persisted history.
const savedLibrary = loadLibrary()
const hasSavedLibrary = savedLibrary !== null
export const library$ = signal<TextEntry[]>(savedLibrary ?? [])
export const activeEntry$ = computed(() => library$.value[0] ?? null)
export const activeId$ = computed(() => activeEntry$.value?.id ?? null)
const pendingImport$ = signal<ImportRequest | null>(null)
export const loadingUrl$ = computed(() => {
  const request = pendingImport$.value
  return request?.kind === 'url' && request.showLoading ? request.url : null
})

function replaceImport(request: ImportRequest | null) {
  const previous = pendingImport$.peek()
  pendingImport$.value = request
  if (previous?.kind === 'url') previous.controller.abort()
}

// Operations
function insertEntry(opts: EntryInput): TextEntry {
  const entry: TextEntry = {
    id: crypto.randomUUID(),
    title: deriveTitle(opts.content, opts.source),
    content: opts.content,
    isMarkdown: opts.isMarkdown,
    source: opts.source,
    createdAt: Date.now(),
  }
  updateLibrary([entry, ...library$.value].slice(0, MAX_ENTRIES))
  return entry
}

export function addEntry(opts: EntryInput): TextEntry {
  replaceImport(null)
  return insertEntry(opts)
}

export function addStarterEntry(content: string): boolean {
  if (library$.value.length > 0 || pendingImport$.peek()) return false
  insertEntry({ content, isMarkdown: true })
  return true
}

export function setActive(id: string) {
  const entries = library$.value
  const idx = entries.findIndex(e => e.id === id)
  if (idx < 0) return
  replaceImport(null)
  if (idx === 0) return
  updateLibrary([entries[idx], ...entries.slice(0, idx), ...entries.slice(idx + 1)])
}

export function deleteEntry(id: string) {
  if (activeId$.peek() === id) replaceImport(null)
  updateLibrary(library$.value.filter(e => e.id !== id))
}

async function runImport(request: ImportRequest, read: () => Promise<EntryInput | null>): Promise<TextEntry | null> {
  replaceImport(request)
  try {
    const entry = await read()
    return entry && pendingImport$.peek() === request ? insertEntry(entry) : null
  } catch (error) {
    if (pendingImport$.peek() !== request) return null
    throw error
  } finally {
    if (pendingImport$.peek() === request) pendingImport$.value = null
  }
}

export function readFileToEntry(file: File): Promise<TextEntry | null> {
  return runImport({ kind: 'file' }, async () => {
    const content = await file.text()
    return content.trim() ? { content, isMarkdown: file.name.endsWith('.md') } : null
  })
}

export async function fetchUrlToEntry(url: string, { showLoading = false } = {}): Promise<TextEntry | null> {
  const normalized = normalizeUrlForJina(url)
  if (!normalized) throw new Error('Invalid URL')

  // Check if we already have this URL in the library
  const existing = library$.value.find(e => e.source === normalized)
  if (existing) {
    setActive(existing.id)
    return existing
  }

  const request = { kind: 'url', url: normalized, controller: new AbortController(), showLoading } as const
  return runImport(request, async () => {
    const response = await fetch(`https://r.jina.ai/${normalized}`, { signal: request.controller.signal })
    if (request.controller.signal.aborted) return null
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Load failed: ${response.status} ${response.statusText}. ${errorText}`)
    }
    const content = await response.text()
    if (!content.trim()) throw new Error('No content returned.')
    return { content, isMarkdown: true, source: normalized }
  })
}

export function normalizeUrlForJina(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null

  // Unwrap a standalone URL without stripping punctuation from its path.
  if ((s.startsWith('<') && s.endsWith('>')) ||
      (s.startsWith('[') && s.endsWith(']')) ||
      (s.startsWith('(') && s.endsWith(')'))) {
    s = s.slice(1, -1).trim()
  }
  if (/\s/.test(s)) return null

  if (/^[^/?#:@]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(s)) {
    s = `https://${s}`
  }

  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.hostname === 'r.jina.ai') {
    return normalizeUrlForJina(u.pathname.slice(1) + u.search + u.hash)
  }

  return u.href
}

export function getBootUrl({ pathname, search, hash }: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  const path = pathname.slice(1)
  if (!path) return null

  const raw = path.match(/(?:^|\/)(https?:\/.*)$/i)?.[1]
  if (raw) {
    // Tolerate a slash-collapsed route without decoding the destination path.
    return normalizeUrlForJina(raw.replace(/^(https?):\/(?!\/)/i, '$1://') + search + hash)
  }

  const wrapped = path.match(/(?:^|\/)(https?%3a%2f%2f[^/]+)$/i)?.[1]
  if (wrapped) {
    try { return normalizeUrlForJina(decodeURIComponent(wrapped)) } catch { return null }
  }

  return normalizeUrlForJina(path + search + hash)
}

/** Bootstrap: migrate old reflow-text into library if library is empty */
export function migrateOldStorage() {
  if (hasSavedLibrary || library$.value.length > 0) return
  const oldText = readStorage('reflow-text')
  if (!oldText) return
  const oldMd = readStorage('reflow-markdown') === '1'
  addEntry({ content: oldText, isMarkdown: oldMd })
}
