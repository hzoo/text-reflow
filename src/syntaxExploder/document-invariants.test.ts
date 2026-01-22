import { describe, expect, test } from 'bun:test'
import { parseText, parseDocument, SAMPLE_TEXTS } from './document'

const ALL_TEXTS: Record<string, string> = {
  ...SAMPLE_TEXTS,
  single: 'Hello.',
  twoSentences: 'First sentence. Second sentence.',
  multiParagraph: 'Para one here.\n\nPara two here.',
  noTerminator: 'words without punctuation ending',
  manyShort: 'A. B. C. D. E.',
}

describe('document model invariants', () => {
  for (const [name, text] of Object.entries(ALL_TEXTS)) {
    describe(name, () => {
      const doc = parseText(text)

      test('sentenceCount matches wordsBySentence length', () => {
        expect(doc.sentenceCount).toBe(doc.wordsBySentence.length)
      })

      test('every word sentenceIndex is in [0, sentenceCount)', () => {
        for (const w of doc.words) {
          expect(w.sentenceIndex).toBeGreaterThanOrEqual(0)
          expect(w.sentenceIndex).toBeLessThan(doc.sentenceCount)
        }
      })

      test('wordsBySentence covers all words (no orphans)', () => {
        const allFromSentences = doc.wordsBySentence.flat()
        expect(allFromSentences.length).toBe(doc.words.length)
      })

      test('wordsBySentence groups match word sentenceIndex', () => {
        for (let s = 0; s < doc.wordsBySentence.length; s++) {
          for (const w of doc.wordsBySentence[s]) {
            expect(w.sentenceIndex).toBe(s)
          }
        }
      })

      test('wordsByParagraph covers all words', () => {
        const allFromParas = doc.wordsByParagraph.flat()
        expect(allFromParas.length).toBe(doc.words.length)
      })

      test('wordsByParagraph groups match word paragraphIndex', () => {
        for (let p = 0; p < doc.wordsByParagraph.length; p++) {
          for (const w of doc.wordsByParagraph[p]) {
            expect(w.paragraphIndex).toBe(p)
          }
        }
      })

      test('paragraphIndex is monotonically non-decreasing', () => {
        for (let i = 1; i < doc.words.length; i++) {
          expect(doc.words[i].paragraphIndex).toBeGreaterThanOrEqual(
            doc.words[i - 1].paragraphIndex
          )
        }
      })

      test('sentenceIndex is monotonically non-decreasing', () => {
        for (let i = 1; i < doc.words.length; i++) {
          expect(doc.words[i].sentenceIndex).toBeGreaterThanOrEqual(
            doc.words[i - 1].sentenceIndex
          )
        }
      })

      test('sentence groups are contiguous in word array', () => {
        // No sentence interleaving: once sentenceIndex changes, it never goes back
        const seen = new Set<number>()
        let prev = -1
        for (const w of doc.words) {
          if (w.sentenceIndex !== prev) {
            expect(seen.has(w.sentenceIndex)).toBe(false)
            seen.add(w.sentenceIndex)
            prev = w.sentenceIndex
          }
        }
      })

      test('all word IDs are unique', () => {
        const ids = new Set(doc.words.map(w => w.id))
        expect(ids.size).toBe(doc.words.length)
      })

      test('metaById has entry for every word', () => {
        for (const w of doc.words) {
          expect(doc.metaById.has(w.id)).toBe(true)
        }
      })
    })
  }
})

describe('parseDocument multi-paragraph invariants', () => {
  test('multi-paragraph text has correct paragraph count', () => {
    const paragraphs = ['First para sentence.', 'Second para sentence.']
    const doc = parseDocument(paragraphs, false)
    expect(doc.wordsByParagraph.length).toBe(2)
  })

  test('paragraph indices span all paragraphs', () => {
    const paragraphs = ['One.', 'Two.', 'Three.']
    const doc = parseDocument(paragraphs, false)
    const paraIndices = new Set(doc.words.map(w => w.paragraphIndex))
    expect(paraIndices.size).toBe(3)
  })

  test('sentences do not cross paragraph boundaries', () => {
    const paragraphs = ['First sentence. Second sentence.', 'Third sentence.']
    const doc = parseDocument(paragraphs, false)
    // Each sentence should have words from only one paragraph
    for (const sentenceWords of doc.wordsBySentence) {
      const paraSet = new Set(sentenceWords.map(w => w.paragraphIndex))
      expect(paraSet.size).toBe(1)
    }
  })
})
