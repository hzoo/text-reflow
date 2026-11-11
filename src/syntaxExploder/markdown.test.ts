import { describe, expect, test } from 'bun:test'
import { markdownToParagraphs, markdownToReadingText, parseDocument, parseMarkdownText, stripJinaPreamble } from './document'

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

  test('keeps document text before a Markdown Content line outside a Jina preamble', () => {
    const source = 'The introduction.\n\nMarkdown Content:\nThe body.'
    expect(markdownToParagraphs(source)).toEqual(['The introduction.', 'Markdown Content:\nThe body.'])
  })

  test('keeps fenced code and table cells in the reader', () => {
    const source = [
      '```sh\n# build the app\nbun run build\n```',
      '````html\n<h2>Title</h2>\n<sup>1</sup>\n````',
      '| Command | Purpose |\n| --- | --- |\n| `bun test` | Run the tests |',
    ].join('\n\n')
    const documents = [
      parseDocument(markdownToParagraphs(source), true),
      parseMarkdownText(markdownToReadingText(source)),
    ]
    for (const doc of documents) {
      const text = doc.words.map(word => word.text).join(' ')
      expect(text).toBe('# build the app bun run build <h2>Title</h2> <sup>1</sup> Command | Purpose bun test | Run the tests')
    }
  })

  test('keeps fenced code and table cells inside a list item', () => {
    const source = '- Setup\n\n  ```sh\n  # build the app\n  bun run build\n  ```\n\n  | Command | Purpose |\n  | --- | --- |\n  | test | Verify |'
    const doc = parseDocument(markdownToParagraphs(source), true)
    expect(doc.words.map(word => word.text).join(' ')).toBe('- Setup # build the app bun run build Command | Purpose test | Verify')
  })

  test('preserves literal heading characters inside quoted code', () => {
    const source = '> ```sh\n> # build\n> # verify\n> ```'
    const doc = parseDocument(markdownToParagraphs(source), true)
    expect(doc.words.map(word => word.text).join(' ')).toBe('> # build # verify')
  })

  test('keeps a link active across a Markdown line break', () => {
    const url = 'https://example.org/destination'
    const doc = parseDocument(markdownToParagraphs(`Hello [the\nlink](${url}). More text.`), true)
    expect(doc.words.filter(word => word.linkUrl === url).map(word => word.text)).toEqual(['the', 'link'])
    expect(doc.words.find(word => word.text === 'More')?.linkUrl).toBeNull()
  })

  test('retains a multiline image as one image with its full alt text', () => {
    const source = '![A small\ndiagram](https://example.org/diagram.png)'
    const doc = parseDocument(markdownToParagraphs(source), true)
    expect(doc.words.filter(word => word.imageUrl).map(word => word.imageAlt)).toEqual(['A small diagram'])
  })

  test('recognizes indented code at the start of a document', () => {
    const code = '    # Literal heading\n    echo hello'
    const sources = [code, `Title: Example\nURL Source: https://example.org\n\nMarkdown Content:\n${code}`]
    for (const source of sources) {
      const doc = parseDocument(markdownToParagraphs(source), true)
      expect(doc.words.map(word => word.text).join(' ')).toBe('# Literal heading echo hello')
    }
  })

  test('preserves escaped punctuation and literal text that resembles reader markers', () => {
    const source = 'Use \\*literal\\* and `[[strong]]`, then continue.'
    const doc = parseDocument(markdownToParagraphs(source), true)
    expect(doc.words.map(word => word.displayText).join('')).toBe('Use *literal* and [[strong]], then continue.')
    expect(doc.words.every(word => word.fontWeight === 'normal')).toBe(true)
  })

  test('keeps labels for unsafe Markdown destinations without making them actionable', () => {
    const source = [
      '[Blocked](javascript:void%200)',
      '![Diagram](javascript:void%200)',
      '[Allowed](https://example.com/guide)',
      '[Bracketed](https://example.com/guide])',
      '[Relative](/help)',
    ].join('\n\n')
    const doc = parseDocument(markdownToParagraphs(source), true)
    expect(doc.words.map(word => word.text)).toContain('Blocked')
    expect(doc.words.map(word => word.text)).toContain('Diagram')
    expect(doc.words.every(word => word.imageUrl === null)).toBe(true)
    expect(doc.words.flatMap(word => word.linkUrl ?? [])).toEqual(['https://example.com/guide', 'https://example.com/guide]', '/help'])
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
