import { describe, expect, test } from 'bun:test'
import { markdownToParagraphs, markdownToReadingText, stripJinaPreamble } from './markdown'

const SOURCE = `_File over app_ is a philosophy: if you want to create digital artifacts that last, they must be files you can control, in formats that are easy to retrieve and read. Use tools that give you this freedom.

_File over app_ is an appeal to tool makers: accept that all software is ephemeral, and give people ownership over their data.

* * *

In the fullness of time, the files you create are more important than the tools you use to create them.

Paraphrasing something [I wrote recently](https://obsidian.md/blog/new-obsidian-icon/)

> If you want your writing to still be readable on a computer from the 2060s or 2160s, it’s important that your notes can be read on a computer from the 1960s.

These days I write using an app I help make called [Obsidian](https://stephango.com/obsidian).`

const JINA_WRAPPED = `Title: File over app

URL Source: https://stephango.com/file-over-app

Published Time: 2024-01-01T00:00:00+00:00

Markdown Content:
${SOURCE}`

describe('markdownToReadingText', () => {
  test('parses stephango sample', () => {
    const text = markdownToReadingText(SOURCE)
    expect(text).toMatchSnapshot()
  })

  test('splits stephango paragraphs', () => {
    const paragraphs = markdownToParagraphs(SOURCE)
    expect(paragraphs).toMatchSnapshot()
  })

  test('splits stephango paragraphs without duplicates', () => {
    const paragraphs = markdownToParagraphs(SOURCE)
    const seen = new Set<string>()
    const duplicates = paragraphs.filter((p) => {
      if (seen.has(p)) return true
      seen.add(p)
      return false
    })
    expect(duplicates).toEqual([])
  })

  test('strips jina preamble', () => {
    const stripped = stripJinaPreamble(JINA_WRAPPED)
    expect(stripped.startsWith('_File over app_')).toBe(true)
    expect(stripped.includes('Markdown Content:')).toBe(false)
  })
})
