import { expect, test } from 'bun:test'
import { parseMarkdownText } from './document'
import { createEngine } from './engine'

function withCanvas(source: string, run: (fixture: {
  engine: ReturnType<typeof createEngine>
  flushFrame: () => void
  finishWidthWarming: () => void
  resize: (width: number, height?: number) => void
  setMaxWidth: (width: number) => void
  focusSentence: (index: number) => void
  click: (x: number, y: number) => void
  images: TestImage[]
  drawnImages: { width: number; height: number }[]
  drawnText: { text: string; x: number; y: number }[]
  openedUrls: string[]
}) => void) {
  const images: TestImage[] = []
  const drawnImages: { width: number; height: number }[] = []
  const drawnText: { text: string; x: number; y: number }[] = []
  const openedUrls: string[] = []
  const frames = new Map<number, FrameRequestCallback>()
  const timers = new Map<number, () => void>()
  const listeners = new Map<string, (event?: { offsetX: number; offsetY: number }) => void>()
  let nextFrameId = 0
  let nextTimerId = 0

  const testWindow = {
    innerWidth: 1024,
    innerHeight: 600,
    addEventListener: (event: string, fn: () => void) => listeners.set(event, fn),
    removeEventListener: (event: string) => listeners.delete(event),
    open: (url: string) => openedUrls.push(url),
  }
  const context = {
    font: '',
    measureText(text: string) {
      const fontSize = Number(this.font.match(/(\d+)px/)?.[1] ?? 18)
      const narrowCharacters = text.split('i').length - 1
      return { width: (text.length - narrowCharacters / 2) * fontSize / 2 }
    },
    setTransform() {}, save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    fillText(text: string, x: number, y: number) { drawnText.push({ text, x, y }) },
    drawImage(_image: unknown, _x: number, _y: number, width: number, height: number) {
      drawnImages.push({ width, height })
    },
  }
  const canvas = {
    style: {},
    getContext: () => context,
    addEventListener: testWindow.addEventListener,
    removeEventListener: testWindow.removeEventListener,
  } as unknown as HTMLCanvasElement

  const globals = {
    window: testWindow,
    Image: class extends TestImage { constructor() { super(); images.push(this) } },
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++nextFrameId, fn); return nextFrameId },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (fn: () => void) => { timers.set(++nextTimerId, fn); return nextTimerId },
    clearTimeout: (id: number) => timers.delete(id),
  }
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })

  let engine: ReturnType<typeof createEngine> | undefined
  try {
    const instance = createEngine({ canvas, words: parseMarkdownText(source) })
    engine = instance
    instance.start()
    run({
      engine: instance,
      flushFrame: () => {
        const pending = [...frames.values()]
        frames.clear()
        for (const fn of pending) fn(performance.now() + 16)
      },
      finishWidthWarming: () => {
        for (let i = 0; i < 20 && timers.size > 0; i++) {
          const pending = [...timers.values()]
          timers.clear()
          for (const fn of pending) fn()
        }
        expect(timers.size).toBe(0)
      },
      resize: (width, height = testWindow.innerHeight) => {
        testWindow.innerWidth = width
        testWindow.innerHeight = height
        listeners.get('resize')?.()
      },
      setMaxWidth: instance.setMaxWidth,
      focusSentence: (index) => instance.setSentence(index, { snap: true }),
      click: (offsetX, offsetY) => listeners.get('click')?.({ offsetX, offsetY }),
      images,
      drawnImages,
      drawnText,
      openedUrls,
    })
  } finally {
    engine?.destroy()
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

class TestImage {
  naturalWidth = 0
  naturalHeight = 0
  onload: (() => void) | null = null

  load(width: number, height: number) {
    this.naturalWidth = width
    this.naturalHeight = height
    this.onload?.()
  }
}

test('canvas preserves the aspect ratio of a loaded image and refits it when the viewport narrows', () => {
  withCanvas('[[image:https://example.com/image.png]]Example[[/image]]', ({ flushFrame, resize, images, drawnImages }) => {
    flushFrame()
    expect(images).toHaveLength(1)
    images[0].load(640, 320)
    flushFrame()
    flushFrame()
    expect(drawnImages.at(-1)).toEqual({ width: 640, height: 320 })

    resize(400)
    flushFrame()
    const resized = drawnImages.at(-1)!
    expect(resized.width).toBeLessThan(400)
    expect(resized.height).toBeCloseTo(resized.width / 2, 0)
  })
})

test('navigation on an empty canvas never announces a focused sentence', () => {
  withCanvas('', ({ engine }) => {
    const focused: Array<number | null> = []
    engine.onStateChange = (_beat, _style, sentence) => focused.push(sentence)

    engine.nextSentence()
    engine.setSentence(null)
    engine.prevSentence()
    engine.goToLastSentence()
    engine.setSentence(0)

    expect(focused).toContain(null)
    expect(focused.every(sentence => sentence === null)).toBe(true)
  })
})

test('a click inside the leading edge of a painted heading link opens its URL', () => {
  const url = 'https://example.com'
  withCanvas(`# Heading [[link:${url}]]link[[/link]]`, ({ flushFrame, click, drawnText, openedUrls }) => {
    flushFrame()
    const link = drawnText.find(entry => entry.text === 'link')!
    click(link.x + 1, link.y + 4)
    expect(openedUrls).toEqual([url])
  })
})

test('changing the reading width keeps the focused sentence vertically anchored during reflow', () => {
  withCanvas('First words on one line move onto separate lines in the narrower view.', ({ flushFrame, setMaxWidth, drawnText }) => {
    const sentenceCenter = () => {
      const ys = drawnText.map(word => word.y)
      return (Math.min(...ys) + Math.max(...ys)) / 2
    }
    flushFrame()
    const before = sentenceCenter()
    const wordCount = drawnText.length
    drawnText.length = 0
    setMaxWidth(300)
    flushFrame()
    expect(drawnText).toHaveLength(wordCount)
    expect(new Set(drawnText.map(word => word.y)).size).toBeGreaterThan(1)
    expect(sentenceCenter()).toBeCloseTo(before, 1)
  })
})

test('Auto refits a resized canvas and manual sizing stops the refit', () => {
  const source = Array.from({ length: 14 }, () => 'The winding trail crosses the meadow.').join(' ')
  withCanvas(source, ({ engine, resize }) => {
    engine.commit({ fontSizing: { kind: 'auto' } })
    const wideSize = engine.getFontSize()
    resize(400, 420)
    expect(engine.getFontSize()).toBeLessThan(wideSize)

    engine.commit({ fontSizing: { kind: 'manual', size: 80 } })
    resize(1024, 600)
    expect(engine.getFontSize()).toBe(80)
  })
})

test('warm widths replace estimated spacing even when every word is already cached', () => {
  const sentenceCount = 130
  const source = Array.from({ length: sentenceCount }, () => 'iiiiii target.').join('\n')
  withCanvas(source, ({ flushFrame, finishWidthWarming, focusSentence, drawnText }) => {
    function paintedWordGap() {
      const word = drawnText.find(entry => entry.text === 'iiiiii ')
      const next = drawnText.find(entry => entry.text === 'target.' && entry.y === word?.y)
      return next!.x - word!.x
    }

    flushFrame()
    const openingGap = paintedWordGap()

    focusSentence(sentenceCount - 1)
    finishWidthWarming()
    drawnText.length = 0
    focusSentence(sentenceCount - 1)
    flushFrame()
    expect(paintedWordGap()).toBe(openingGap)
  })
})
