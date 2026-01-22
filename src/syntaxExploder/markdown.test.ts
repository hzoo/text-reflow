import { describe, expect, test } from 'bun:test'
import { markdownToParagraphs, markdownToReadingText, stripJinaPreamble } from './document'

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

const IDEA_MACHINES_EXCERPT = `Tech as a system of values, and not just an industry, is heavily driven by its subcultures and their ideologies. Where do these ideologies come from, and how do they influence what’s accomplished?

One of the most visible ideologies in tech is effective altruism (or EA), a philanthropic school of thought [that advocates for](https://www.effectivealtruism.org/articles/introduction-to-effective-altruism)_“us[ing] high-quality evidence and careful reasoning to work out how to help others as much as possible.”_. If you don’t buy into its philosophy, it’s easy to write off effective altruism as yet another eccentric subculture. But effective altruism is both less and more interesting than it seems.`

const HEADER_SPACING = `**An Idea Machine is a self-sustaining organism that contains all the parts needed to turn ideas into outcomes:**`
const ABBR_SENTENCE = `This is a test, e.g. with abbreviations. Next sentence starts here.`
const HTML_HEADINGS = `without asking for permission.\n<h2 class=\"Body-module-scss-module__z40yvW__reading-column headline-5 post-section\" id=\"what-is-claudes-constitution\">What is Claude’s Constitution?</h2>\n<h2 class=\"Body-module-scss-module__z40yvW__reading-column headline-5 post-section\" id=\"our-new-approach-to-claudes-constitution\">Our new approach to Claude’s Constitution</h2>\nClaude’s constitution`
const HTML_SUP = `<p>We think transparency of this kind will become ever more important as AIs start to exert more influence in society<sup>1</sup>.</p>`

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

  test('no empty sentences in full mode excerpt', () => {
    const text = markdownToReadingText(IDEA_MACHINES_EXCERPT)
    const sentences = text.split(/\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
    expect(sentences.length).toBeGreaterThan(2)
    expect(sentences.includes('')).toBe(false)
  })

  test('inline spacing does not collapse words', () => {
    const text = markdownToReadingText(HEADER_SPACING)
    expect(text.includes('Machineis')).toBe(false)
    expect(text.includes('systems')).toBe(false)
  })

  test('abbreviations do not split sentences', () => {
    const text = markdownToReadingText(ABBR_SENTENCE)
    const sentences = text.split(/\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
    expect(sentences.length).toBe(2)
    expect(sentences[0].includes('e.g.')).toBe(true)
  })

  test('extracts html headings with attributes', () => {
    const paragraphs = markdownToParagraphs(HTML_HEADINGS)
    expect(paragraphs).toContain('## What is Claude’s Constitution?')
    expect(paragraphs).toContain('## Our new approach to Claude’s Constitution')
  })

  test('converts html superscripts into footnote markers', () => {
    const paragraphs = markdownToParagraphs(HTML_SUP)
    expect(paragraphs.some((p) => p.includes('society[^1].'))).toBe(true)
  })
})
