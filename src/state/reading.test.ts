import { afterAll, beforeAll, expect, test } from 'bun:test'
import { effect } from '@preact/signals'

const priorStorage = globalThis.localStorage
const priorFetch = globalThis.fetch
const priorSetTimeout = globalThis.setTimeout
const items = new Map<string, string>()
let storageUnavailable = false
const storage = {
  getItem: (key: string) => {
    if (storageUnavailable) throw new Error('Storage blocked')
    return items.get(key) ?? null
  },
  setItem: (key: string, value: string) => {
    if (storageUnavailable) throw new Error('Storage blocked')
    items.set(key, value)
  },
  removeItem: (key: string) => items.delete(key),
} as Storage

let resolveDefaultText!: (response: Response) => void
const defaultTextResponse = new Promise<Response>((resolve) => { resolveDefaultText = resolve })
let state: typeof import('./signals')
let library: typeof import('./library')

beforeAll(async () => {
  globalThis.localStorage = storage
  globalThis.fetch = (() => defaultTextResponse) as typeof fetch
  // Keep the module's unrelated preference debounce from escaping these tests.
  globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout
  state = await import('./signals')
  library = await import('./library')
})

afterAll(() => {
  globalThis.localStorage = priorStorage
  globalThis.fetch = priorFetch
  globalThis.setTimeout = priorSetTimeout
})

test('a delayed starter document cannot replace a user import', async () => {
  const imported = library.addEntry({ content: 'Imported text.', isMarkdown: false })
  let finishReading!: (text: string) => void
  const body = new Promise<string>((resolve) => { finishReading = resolve })
  let startReading!: () => void
  const bodyRequested = new Promise<void>((resolve) => { startReading = resolve })
  const response = new Response()
  response.text = () => { startReading(); return body }
  resolveDefaultText(response)
  await bodyRequested
  finishReading('# Starter document')
  await body
  expect(library.activeEntry$.value?.id).toBe(imported.id)
  expect(library.library$.value).toEqual([imported])
})

test('switching articles starts at the first sentence even when the new article is shorter', () => {
  const short = library.addEntry({ content: '# New title\n\nShort article.', isMarkdown: true })
  library.addEntry({ content: 'First sentence. Second sentence. Third sentence. Fourth sentence.', isMarkdown: false })
  state.setReadingSentence(3)

  const observed: Array<[number | null, string]> = []
  const dispose = effect(() => {
    const index = state.globalSentence$.value
    const words = state.document$.value.wordsBySentence[index ?? 0]
    observed.push([index, words?.map(word => word.displayText.trim()).join(' ') ?? ''])
  })
  try {
    library.setActive(short.id)
    expect(observed.slice(1)).toEqual([[0, 'New title']])
  } finally {
    dispose()
  }
})

test('selecting a Markdown divider clears the cursor until readable text opens', () => {
  const empty = library.addEntry({ content: '---', isMarkdown: true })
  const readable = library.addEntry({ content: 'The trail reaches the valley.', isMarkdown: false })

  library.setActive(empty.id)
  expect(state.document$.value.sentenceCount).toBe(0)
  expect(state.globalSentence$.value).toBeNull()

  library.setActive(readable.id)
  expect(state.globalSentence$.value).toBe(0)
})

test('selecting paragraph view scopes the paragraph containing the focused sentence', () => {
  library.addEntry({ content: 'First sentence. Second sentence.\n\nThird sentence. Fourth sentence.', isMarkdown: false })
  state.setViewMode('full')
  state.setReadingSentence(3)

  state.setViewMode('paragraph')

  const offset = state.getSentenceOffset(state.sentenceCounts$.value, state.currentPara$.value)
  const count = state.sentenceCounts$.value[state.currentPara$.value]
  expect(offset).toBe(2)
  expect(state.globalSentence$.value).toBeLessThan(offset + count)
})

test('two articles with identical text keep separate positions when switching and saving', () => {
  const content = 'First sentence. Second sentence.\n\nThird sentence. Fourth sentence.'
  const first = library.addEntry({ content, isMarkdown: false })
  state.setReadingSentence(3)

  const second = library.addEntry({ content, isMarkdown: false })
  expect(state.globalSentence$.value).toBe(0)
  state.setReadingSentence(1)

  library.setActive(first.id)
  expect(state.globalSentence$.value).toBe(3)
  expect(state.currentPara$.value).toBe(1)
  library.setActive(second.id)
  expect(state.globalSentence$.value).toBe(1)

  state.flushPrefs()
  const { positions } = JSON.parse(items.get(state.PREFS_KEY) ?? '{}')
  expect(positions[first.id]).toBe(3)
  expect(positions[second.id]).toBe(1)

  library.deleteEntry(first.id)
  state.flushPrefs()
  expect(JSON.parse(items.get(state.PREFS_KEY) ?? '{}').positions[first.id]).toBeUndefined()
})

test('a blocked storage write leaves the imported article usable', () => {
  storageUnavailable = true
  try {
    const entry = library.addEntry({ content: 'New reading material.', isMarkdown: false })
    expect(library.activeEntry$.value?.id).toBe(entry.id)
  } finally {
    storageUnavailable = false
  }
})

test('a malformed persisted library still opens an imported article', async () => {
  items.set('reflow-library', 'null')
  const reloaded = await import('./library.ts?malformed')
  const entry = reloaded.addEntry({ content: 'New reading material.', isMarkdown: false })
  expect(reloaded.activeEntry$.value?.id).toBe(entry.id)
})

test('a blocked storage read still lets the reader open', async () => {
  storageUnavailable = true
  try {
    const reloaded = await import('./library.ts?blocked')
    expect(reloaded.library$.value).toEqual([])
  } finally {
    storageUnavailable = false
  }
})

test('a successful HTML fallback response cannot become the starter document', async () => {
  for (const entry of library.library$.value) library.deleteEntry(entry.id)
  globalThis.fetch = (() => Promise.resolve(new Response('<!doctype html><div id="app"></div>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }))) as typeof fetch
  expect(await state.loadDefaultText()).toBe(false)
  expect(library.activeEntry$.value).toBeNull()
})

test('a slower URL import cannot replace a more recent URL import', async () => {
  const older = Promise.withResolvers<string>()
  const olderBodyRequested = Promise.withResolvers<void>()
  const olderResponse = new Response()
  olderResponse.text = () => {
    olderBodyRequested.resolve()
    return older.promise
  }
  const newer = Promise.withResolvers<Response>()
  globalThis.fetch = ((url: string) => url.endsWith('/older')
    ? Promise.resolve(olderResponse)
    : newer.promise) as typeof fetch

  const firstImport = library.fetchUrlToEntry('https://example.com/older')
  await olderBodyRequested.promise
  const lastImport = library.fetchUrlToEntry('https://example.com/newer')
  newer.resolve(new Response('Newer article.'))
  const selected = await lastImport
  older.resolve('Older article.')
  await firstImport

  expect(selected?.content).toBe('Newer article.')
  expect(library.activeEntry$.value?.id).toBe(selected?.id)
})

test('reselecting the current article preserves reading position during a URL load', async () => {
  const selected = library.addEntry({ content: 'First sentence. Second sentence.', isMarkdown: false })
  state.setReadingSentence(1)
  const response = Promise.withResolvers<Response>()
  globalThis.fetch = (() => response.promise) as typeof fetch

  const pending = library.fetchUrlToEntry('https://example.com/slow')
  library.setActive(selected.id)
  response.resolve(new Response('An article no longer requested.'))
  await pending

  expect(library.activeEntry$.value?.id).toBe(selected.id)
  expect(state.globalSentence$.value).toBe(1)
})

test('a superseded URL failure leaves the newer loading indicator active', async () => {
  const older = Promise.withResolvers<Response>()
  const newer = Promise.withResolvers<Response>()
  let olderSignal: AbortSignal | null | undefined
  globalThis.fetch = ((url: string, options: RequestInit) => {
    if (url.endsWith('/aborted')) {
      olderSignal = options.signal
      return older.promise
    }
    return newer.promise
  }) as typeof fetch

  const firstImport = library.fetchUrlToEntry('https://example.com/aborted', { showLoading: true })
  const lastImport = library.fetchUrlToEntry('https://example.com/pending', { showLoading: true })
  older.reject(new Error('Request aborted'))
  const superseded = await firstImport
  const loading = library.loadingUrl$.value
  newer.resolve(new Response('Requested article.'))
  const selected = await lastImport

  expect(olderSignal?.aborted).toBe(true)
  expect(superseded).toBeNull()
  expect(loading).toBe('https://example.com/pending')
  expect(selected?.content).toBe('Requested article.')
  expect(library.loadingUrl$.value).toBeNull()
})

test('the optional starter yields to an explicit URL during an empty boot', async () => {
  for (const entry of library.library$.value) library.deleteEntry(entry.id)
  const response = Promise.withResolvers<Response>()
  globalThis.fetch = ((url: string) => url === '/constitution.md'
    ? Promise.resolve(new Response('# Starter document'))
    : response.promise) as typeof fetch

  const pending = library.fetchUrlToEntry('https://example.com/boot', { showLoading: true })
  const addedStarter = await state.loadDefaultText()
  response.resolve(new Response('Requested at boot.'))
  const selected = await pending

  expect(addedStarter).toBe(false)
  expect(selected?.content).toBe('Requested at boot.')
  expect(library.library$.value).toEqual([selected])
})

test('clipboard URL detection accepts standalone addresses and preserves prose and path punctuation', () => {
  for (const text of ['Read https://example.org', 'https://example.org\nKeep reading.', 'https://example.org followed by a note']) {
    expect(library.normalizeUrlForJina(text)).toBeNull()
  }
  const path = 'https://example.org/Function_(math)'
  expect(library.normalizeUrlForJina(path)).toBe(path)
  expect(library.normalizeUrlForJina(`<${path}>`)).toBe(path)
  const pathWithQuery = path + '?page=2#examples'
  expect(library.normalizeUrlForJina('https://r.jina.ai/' + pathWithQuery)).toBe(pathWithQuery)
  expect(library.normalizeUrlForJina('example.org/guide')).toBe('https://example.org/guide')
})

test('boot URL extraction preserves the destination escapes in raw and wrapped share links', () => {
  const address = 'https://example.org/articles/two%20words%2Fone?edition=2#page'
  const raw = { pathname: '/https://example.org/articles/two%20words%2Fone', search: '?edition=2', hash: '#page' }
  const wrapped = { pathname: '/reader/' + encodeURIComponent(address), search: '', hash: '' }

  expect(library.getBootUrl(raw)).toBe(address)
  expect(library.getBootUrl(wrapped)).toBe(address)
  expect(library.getBootUrl({ ...raw, pathname: '/https:/example.org/articles/two%20words%2Fone' })).toBe(address)
})

test('leaving before the preferences timer saves the latest reading view and sentence', () => {
  items.delete(state.PREFS_KEY)
  state.setReadingSentence(3)
  state.setReadingSentence(5)
  state.liteVariant$.value = 'scroll'

  state.flushPrefs()

  const saved = JSON.parse(items.get(state.PREFS_KEY) ?? '{}')
  expect(saved.positions[library.activeEntry$.value!.id]).toBe(5)
  expect(saved.liteVariant).toBe('scroll')
})

test('a dropped file cannot replace pasted text confirmed after the drop', async () => {
  const body = Promise.withResolvers<string>()
  const file = new File([], 'older.txt')
  file.text = () => body.promise

  const reading = library.readFileToEntry(file)
  const selected = library.addEntry({ content: 'Newer pasted article.', isMarkdown: false })
  body.resolve('Older dropped article.')

  expect(await reading).toBeNull()
  expect(library.activeEntry$.value?.id).toBe(selected.id)
  expect(library.library$.value.some(entry => entry.content === 'Older dropped article.')).toBe(false)
})

test('a newer file supersedes a URL load and keeps the Markdown source intact', async () => {
  const response = Promise.withResolvers<Response>()
  globalThis.fetch = (() => response.promise) as typeof fetch
  const older = library.fetchUrlToEntry('https://example.org/slow', { showLoading: true })
  const content = '    # Literal heading\n    echo hello\n'
  const selected = await library.readFileToEntry(new File([content], 'example.md'))
  response.resolve(new Response('Older URL article.'))

  expect(await older).toBeNull()
  expect(library.loadingUrl$.value).toBeNull()
  expect(library.activeEntry$.value?.id).toBe(selected?.id)
  expect(library.activeEntry$.value?.content).toBe(content)
  expect(state.document$.value.words[0]?.text).toBe('#')
})
