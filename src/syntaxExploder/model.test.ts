import { describe, expect, test } from 'bun:test'
import { createWords, splitParagraphs, SAMPLE_TEXTS } from './model'

describe('createWords', () => {
  test('tokenizes simple text', () => {
    const doc = createWords('Hello world.')
    expect(doc.words.length).toBe(2)
    expect(doc.words[0].text).toBe('Hello')
    expect(doc.words[1].text).toBe('world.')
  })

  test('preserves spacing info', () => {
    const doc = createWords('one two three')
    expect(doc.words[0].spaceAfter).toBe(true)
    expect(doc.words[1].spaceAfter).toBe(true)
    expect(doc.words[2].spaceAfter).toBe(false)
  })

  test('tracks pixel width placeholder', () => {
    const doc = createWords('hi there')
    expect(doc.words[0].pixelWidth).toBe(0)
    expect(doc.words[1].pixelWidth).toBe(0)
  })

  test('detects sentence boundaries', () => {
    const doc = createWords('First sentence. Second one! Third?')
    expect(doc.sentenceCount).toBe(3)
    expect(doc.words[0].sentenceIndex).toBe(0) // First
    expect(doc.words[1].sentenceIndex).toBe(0) // sentence.
    expect(doc.words[2].sentenceIndex).toBe(1) // Second
  })

  test('marks stopwords', () => {
    const doc = createWords('the quick brown fox')
    expect(doc.metaById.get('w0')?.isStop).toBe(true) // the
    expect(doc.metaById.get('w1')?.isStop).toBe(false) // quick
  })

  test('marks punctuation', () => {
    const doc = createWords('hello, world!')
    expect(doc.metaById.get('w0')?.isPunct).toBe(false) // hello,
    expect(doc.metaById.get('w1')?.isPunct).toBe(false) // world!

    const doc2 = createWords('wait — what')
    expect(doc2.metaById.get('w1')?.isPunct).toBe(true) // —
  })

  test('handles sample texts without error', () => {
    for (const [, text] of Object.entries(SAMPLE_TEXTS)) {
      const doc = createWords(text)
      expect(doc.words.length).toBeGreaterThan(0)
      expect(doc.sentenceCount).toBeGreaterThan(0)
    }
  })

  test('assigns unique ids', () => {
    const doc = createWords('one two three four five')
    const ids = doc.words.map(w => w.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('initializes animation state to zero', () => {
    const doc = createWords('test words')
    for (const w of doc.words) {
      expect(w.animX).toBe(0)
      expect(w.animY).toBe(0)
      expect(w.animScale).toBe(1)
      expect(w.focusDy).toBe(0)
    }
  })
})

describe('splitParagraphs', () => {
  test('returns empty array for empty string', () => {
    expect(splitParagraphs('')).toEqual([])
    expect(splitParagraphs('   ')).toEqual([])
  })

  test('single paragraph with no newlines', () => {
    const result = splitParagraphs('Hello world.')
    expect(result).toEqual(['Hello world.'])
  })

  test('splits on double newlines (prose mode)', () => {
    const result = splitParagraphs('First para.\n\nSecond para.')
    expect(result).toEqual(['First para.', 'Second para.'])
  })

  test('splits on single newlines when no double newlines (poetry mode)', () => {
    const result = splitParagraphs('Line one\nLine two\nLine three')
    expect(result).toEqual(['Line one', 'Line two', 'Line three'])
  })

  test('prefers double newlines over single', () => {
    const result = splitParagraphs('Para one line one\nPara one line two\n\nPara two')
    expect(result).toEqual(['Para one line one\nPara one line two', 'Para two'])
  })

  test('handles extra whitespace', () => {
    const result = splitParagraphs('  First  \n\n  Second  ')
    expect(result).toEqual(['First', 'Second'])
  })

  test('filters empty paragraphs', () => {
    const result = splitParagraphs('First\n\n\n\nSecond')
    expect(result).toEqual(['First', 'Second'])
  })
})
