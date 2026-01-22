import { marked } from 'marked'

export function stripJinaPreamble(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const markerIndex = lines.findIndex((line) => line.trim() === 'Markdown Content:')
  if (markerIndex >= 0) return lines.slice(markerIndex + 1).join('\n').trim()
  return normalized.trim()
}

export function markdownToReadingText(raw: string): string {
  if (!raw) return ''
  const source = normalizeHtmlHeadings(normalizeHtmlSuperscripts(stripJinaPreamble(raw)))
  const tokens = marked.lexer(source, { gfm: true, breaks: false })
  const lines: string[] = []
  for (const token of tokens) {
    appendBlockLines(token, lines)
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function stripInlineMarkers(text: string): string {
  return text
    .replace(/\[\[strong\]\]/g, '')
    .replace(/\[\[\/strong\]\]/g, '')
    .replace(/\[\[em\]\]/g, '')
    .replace(/\[\[\/em\]\]/g, '')
    .replace(/\[\[link:[^\]]+\]\]/g, '')
    .replace(/\[\[\/link\]\]/g, '')
    .replace(/\[\[image:[^\]]+\]\]/g, '')
    .replace(/\[\[\/image\]\]/g, '')
}

export function markdownToParagraphs(raw: string): string[] {
  if (!raw) return []
  const source = normalizeHtmlHeadings(normalizeHtmlSuperscripts(stripJinaPreamble(raw)))
  const tokens = marked.lexer(source, { gfm: true, breaks: false })
  const paragraphs: string[] = []
  let buffer: string[] = []

  function flushBuffer() {
    if (buffer.length === 0) return
    const joined = buffer.join('\n').replace(/\n{2,}/g, '\n').trim()
    if (joined) paragraphs.push(joined)
    buffer = []
  }

  for (const token of tokens) {
    if (token.type === 'heading') {
      flushBuffer()
      const text = inlineTokensToText(token.tokens)
      const marker = token.depth === 1 ? '# ' : '## '
      paragraphs.push(`${marker}${text}`)
      continue
    }
    if (token.type === 'paragraph') {
      const text = inlineTokensToText(token.tokens)
      if (text) buffer.push(text)
      flushBuffer()
      continue
    }
    if (token.type === 'list') {
      flushBuffer()
      const isOrdered = Boolean(token.ordered)
      const start = typeof token.start === 'number' ? token.start : 1
      let index = 0
      for (const item of token.items || []) {
        const text = blockTokensToInlineText(item.tokens || [])
        if (!text) continue
        if (isOrdered) {
          const num = start + index
          paragraphs.push(`${num}. ${text}`)
        } else {
          paragraphs.push(`- ${text}`)
        }
        index++
      }
      continue
    }
    if (token.type === 'blockquote') {
      flushBuffer()
      const lines: string[] = []
      for (const inner of token.tokens || []) appendBlockLines(inner, lines)
      const quote = lines.filter((l) => l.trim()).map((line) => `> ${line}`).join('\n')
      if (quote) paragraphs.push(quote)
      continue
    }
    if (token.type === 'html') {
      flushBuffer()
      const blocks = htmlToBlocks(token.text || token.raw || '')
      for (const line of blocks) {
        if (line) paragraphs.push(line)
      }
      continue
    }
    if (token.type === 'hr') {
      flushBuffer()
      continue
    }
  }

  flushBuffer()
  return paragraphs
}

function appendBlockLines(token: any, out: string[]) {
  switch (token.type) {
    case 'heading': {
      const text = inlineTokensToText(token.tokens)
      const marker = token.depth === 1 ? '# ' : '## '
      out.push(`${marker}${text}`)
      out.push('')
      return
    }
    case 'paragraph': {
      const text = inlineTokensToText(token.tokens)
      if (text) out.push(text)
      out.push('')
      return
    }
    case 'list': {
      const isOrdered = Boolean(token.ordered)
      const start = typeof token.start === 'number' ? token.start : 1
      let index = 0
      for (const item of token.items || []) {
        const text = blockTokensToInlineText(item.tokens || [])
        if (!text) continue
        if (isOrdered) {
          const num = start + index
          out.push(`${num}. ${text}`)
        } else {
          out.push(`- ${text}`)
        }
        index++
      }
      out.push('')
      return
    }
    case 'blockquote': {
      const lines: string[] = []
      for (const inner of token.tokens || []) appendBlockLines(inner, lines)
      for (const line of lines.filter((l) => l.trim())) out.push(`> ${line}`)
      out.push('')
      return
    }
    case 'html': {
      const blocks = htmlToBlocks(token.text || token.raw || '')
      for (const line of blocks) out.push(line)
      if (blocks.length > 0) out.push('')
      return
    }
    case 'hr': {
      return
    }
    default:
      return
  }
}

function blockTokensToInlineText(tokens: any[]): string {
  const parts: string[] = []
  for (const token of tokens) {
    if (token.type === 'paragraph' || token.type === 'text') {
      parts.push(inlineTokensToText(token.tokens || token.text || []))
    } else if (token.type === 'list') {
      for (const item of token.items || []) {
        const inner = blockTokensToInlineText(item.tokens || [])
        if (inner) parts.push(inner)
      }
    }
  }
  return collapseSpaces(parts.join(' '))
}

function inlineTokensToText(tokens: any): string {
  if (typeof tokens === 'string') return collapseInlineSpaces(tokens)
  if (!Array.isArray(tokens)) return ''
  const parts: string[] = []
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        parts.push(collapseInlineSpaces(token.text || ''))
        break
      case 'strong': {
        const inner = inlineTokensToText(token.tokens || token.text || [])
        parts.push(`[[strong]]${inner}[[/strong]]`)
        break
      }
      case 'em': {
        const inner = inlineTokensToText(token.tokens || token.text || [])
        parts.push(`[[em]]${inner}[[/em]]`)
        break
      }
      case 'del':
        parts.push(inlineTokensToText(token.tokens || token.text || []))
        break
      case 'codespan':
        parts.push(collapseInlineSpaces(token.text || ''))
        break
      case 'link': {
        const label = inlineTokensToText(token.tokens || token.text || []) || token.text || ''
        const text = label || token.href || ''
        if (token.href) parts.push(`[[link:${token.href}]]${text}[[/link]]`)
        else parts.push(text)
        break
      }
      case 'image': {
        const label = token.text ? `Image: ${token.text}` : 'Image'
        if (token.href) parts.push(`[[image:${token.href}]]${label}[[/image]]`)
        else parts.push(label)
        break
      }
      case 'br':
        parts.push('\n')
        break
      default:
        break
    }
  }
  return collapseInlineSpaces(parts.join(' '))
}

function collapseSpaces(value: string): string {
  const noBreaks = value.replace(/[\t\f\r ]+/g, ' ').replace(/\s+([.,;:!?])/g, '$1')
  return noBreaks.replace(/\n{3,}/g, '\n\n').trim()
}

function collapseInlineSpaces(value: string): string {
  return value.replace(/[\t\f\r ]+/g, ' ').replace(/\s+([.,;:!?])/g, '$1')
}

function htmlToBlocks(html: string): string[] {
  const trimmed = html.trim()
  if (!trimmed) return []

  if (typeof DOMParser === 'undefined') {
    return extractHtmlBlocksRegex(trimmed)
  }

  const doc = new DOMParser().parseFromString(trimmed, 'text/html')
  const blocks: string[] = []

  function headingMarker(level: number): string {
    return level <= 1 ? '# ' : '## '
  }

  function pushTextBlock(text: string) {
    const cleaned = collapseSpaces(text)
    if (cleaned) blocks.push(cleaned)
  }

  function collect(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (text.trim()) pushTextBlock(text)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
      const level = Number(tag.slice(1)) || 2
      const text = el.textContent || ''
      const cleaned = collapseSpaces(text)
      if (cleaned) blocks.push(`${headingMarker(level)}${cleaned}`)
      return
    }
    if (tag === 'P') {
      pushTextBlock(el.textContent || '')
      return
    }
    if (tag === 'OL' || tag === 'UL') {
      const isOrdered = tag === 'OL'
      const items = Array.from(el.querySelectorAll(':scope > li'))
      items.forEach((li, idx) => {
        const text = collapseSpaces(li.textContent || '')
        if (!text) return
        blocks.push(isOrdered ? `${idx + 1}. ${text}` : `- ${text}`)
      })
      return
    }
    if (tag === 'BLOCKQUOTE') {
      const text = collapseSpaces(el.textContent || '')
      if (text) blocks.push(`> ${text}`)
      return
    }

    for (const child of Array.from(el.childNodes)) {
      collect(child)
    }
  }

  for (const node of Array.from(doc.body.childNodes)) {
    collect(node)
  }
  return blocks
}

function extractHtmlBlocksRegex(html: string): string[] {
  const blocks: string[] = []
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  let match: RegExpExecArray | null
  while ((match = headingRe.exec(html)) !== null) {
    const level = parseInt(match[1], 10)
    const text = collapseSpaces(match[2].replace(/<[^>]+>/g, ' '))
    if (text) blocks.push(`${level <= 1 ? '# ' : '## '}${text}`)
  }
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
  while ((match = paraRe.exec(html)) !== null) {
    const text = collapseSpaces(match[1].replace(/<[^>]+>/g, ' '))
    if (text) blocks.push(text)
  }
  const listRe = /<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/gi
  while ((match = listRe.exec(html)) !== null) {
    const isOrdered = match[1].toLowerCase() === 'ol'
    const body = match[2]
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let liMatch: RegExpExecArray | null
    let idx = 0
    while ((liMatch = liRe.exec(body)) !== null) {
      const text = collapseSpaces(liMatch[1].replace(/<[^>]+>/g, ' '))
      if (!text) continue
      idx++
      blocks.push(isOrdered ? `${idx}. ${text}` : `- ${text}`)
    }
  }
  return blocks
}

function normalizeHtmlHeadings(source: string): string {
  if (!source) return source
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  return source.replace(headingRe, (_, levelRaw, inner) => {
    const level = parseInt(levelRaw, 10)
    const text = collapseSpaces(String(inner).replace(/<[^>]+>/g, ' '))
    if (!text) return ''
    const marker = level <= 1 ? '# ' : '## '
    return `\n${marker}${text}\n`
  })
}

function normalizeHtmlSuperscripts(source: string): string {
  if (!source) return source
  const supRe = /<sup[^>]*>(\d+)<\/sup>/gi
  return source.replace(supRe, '[^$1]')
}
