import { describe, expect, test } from 'bun:test'
import { parseText } from './document'

describe('sentence boundary edge cases', () => {
  const singleSentence = [
    'Dr. Smith arrived early.',
    'The U.S.A. is large.',
    'Some things e.g. apples are good.',
    'Cats, dogs, etc. are pets.',
    'Red vs. blue is classic.',
    'See fig. 3 for details.',
    '"Fine," she said quietly.',          // comma after quote-period
    'The value of x. y is higher.',       // lowercase continuation
  ]

  for (const text of singleSentence) {
    test(`single sentence: "${text.slice(0, 30)}..."`, () => {
      expect(parseText(text).sentenceCount).toBe(1)
    })
  }

  test('trailing quote/bracket ends sentence', () => {
    expect(parseText('He said "hello." She waved.').sentenceCount).toBe(2)
    expect(parseText('(That was odd.) Next thing.').sentenceCount).toBe(2)
  })

  test('no terminator → single sentence', () => {
    expect(parseText('words without punctuation ending').sentenceCount).toBe(1)
  })
})
