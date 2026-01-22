import { describe, expect, test } from 'bun:test'
import { createWords, createWordsMarkdown, splitParagraphs, SAMPLE_TEXTS, detectBibleVerses, splitByVerseNumber, createWordsBible, createDocumentFromParagraphs } from './model'

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

describe('createWordsMarkdown footnotes', () => {
  test('renders numeric footnote markers as superscript', () => {
    const doc = createWordsMarkdown('society[^1].')
    const footnote = doc.words.find((w) => w.text === '1')
    expect(footnote).toBeTruthy()
    expect(footnote?.baseScale).toBeLessThan(1)
    expect(footnote?.baselineShift).toBeLessThan(0)
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

describe('Bible verse detection', () => {
  test('detects sequential verse numbers', () => {
    const text = '31 "If I testify about myself. 32 There is another. 33 You have sent to John.'
    const result = detectBibleVerses(text)
    expect(result.isBible).toBe(true)
    expect(result.verseNumbers).toEqual([31, 32, 33])
  })

  test('rejects non-sequential numbers', () => {
    const text = '5 apples and 17 oranges make 99 fruit salads.'
    const result = detectBibleVerses(text)
    expect(result.isBible).toBe(false)
  })

  test('rejects text with too few verse-like numbers', () => {
    const text = '1 First item. 2 Second item.'
    const result = detectBibleVerses(text)
    expect(result.isBible).toBe(false) // only 2 numbers
  })

  test('allows small gaps in sequence', () => {
    const text = '1 First verse. 2 Second verse. 4 Fourth verse.' // missing 3
    const result = detectBibleVerses(text)
    expect(result.isBible).toBe(true)
  })

  test('detects john5 sample as Bible', () => {
    const result = detectBibleVerses(SAMPLE_TEXTS.john5)
    expect(result.isBible).toBe(true)
    expect(result.verseNumbers.length).toBeGreaterThan(10)
  })

  test('rejects engelbart sample', () => {
    const result = detectBibleVerses(SAMPLE_TEXTS.engelbart)
    expect(result.isBible).toBe(false)
  })
})

describe('splitByVerseNumber', () => {
  test('splits text at verse numbers', () => {
    const text = '31 First verse. 32 Second verse. 33 Third verse.'
    const verses = splitByVerseNumber(text)
    expect(verses.length).toBe(3)
    expect(verses[0]).toContain('31')
    expect(verses[1]).toContain('32')
    expect(verses[2]).toContain('33')
  })
})

describe('createWordsBible', () => {
  test('parses Bible text with verse indices', () => {
    const text = '1 First verse here. 2 Second verse here. 3 Third verse here.'
    const doc = createWordsBible(text)
    expect(doc.sentenceCount).toBe(3) // one per verse
    expect(doc.wordsBySentence.length).toBe(3)
  })

  test('verse numbers become words with smaller scale', () => {
    const text = '1 First verse. 2 Second verse. 3 Third verse.'
    const doc = createWordsBible(text)
    const firstWord = doc.words[0]
    expect(firstWord.text).toBe('1')
    expect(firstWord.baseScale).toBe(0.85)
  })

  test('handles john5 sample correctly', () => {
    const doc = createWordsBible(SAMPLE_TEXTS.john5)
    expect(doc.sentenceCount).toBeGreaterThan(10) // ~17 verses
    expect(doc.words.length).toBeGreaterThan(100)
  })

  test('each verse starts with number or is a heading', () => {
    const doc = createWordsBible(SAMPLE_TEXTS.john5)

    for (let i = 0; i < doc.sentenceCount; i++) {
      const words = doc.wordsBySentence[i]
      expect(words.length).toBeGreaterThan(0)

      const firstWord = words[0].text
      const isNumber = /^\d+$/.test(firstWord)
      const isHeading = i === 0 && !isNumber // First sentence can be a heading

      expect(isNumber || isHeading).toBe(true)

      // If it's a verse number, second word should exist and be text
      if (isNumber && words.length > 1) {
        expect(/^[A-Za-z"'""]/.test(words[1].text)).toBe(true)
      }
    }
  })

  test('verse numbers are sequential', () => {
    const doc = createWordsBible(SAMPLE_TEXTS.john5)
    const verseNums: number[] = []

    for (let i = 0; i < doc.sentenceCount; i++) {
      const firstWord = doc.wordsBySentence[i][0].text
      if (/^\d+$/.test(firstWord)) {
        verseNums.push(parseInt(firstWord, 10))
      }
    }

    // Check sequential (allow gaps of 1)
    for (let i = 1; i < verseNums.length; i++) {
      const diff = verseNums[i] - verseNums[i - 1]
      expect(diff).toBeGreaterThanOrEqual(1)
      expect(diff).toBeLessThanOrEqual(2)
    }
  })
})

describe('auto-detection in createDocumentFromParagraphs', () => {
  test('auto-detects Bible text and uses verse splitting', () => {
    const paragraphs = [SAMPLE_TEXTS.john5]
    const doc = createDocumentFromParagraphs(paragraphs, false)
    // Should have ~17 verses (sentences)
    expect(doc.sentenceCount).toBeGreaterThan(10)
  })

  test('uses normal sentence splitting for non-Bible text', () => {
    const paragraphs = [SAMPLE_TEXTS.short]
    const doc = createDocumentFromParagraphs(paragraphs, false)
    expect(doc.sentenceCount).toBe(2) // Two sentences
  })
})
