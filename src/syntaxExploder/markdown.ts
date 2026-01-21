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
  const source = stripJinaPreamble(raw)
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
}

export function markdownToParagraphs(raw: string): string[] {
  if (!raw) return []
  const source = stripJinaPreamble(raw)
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
      for (const item of token.items || []) {
        const text = blockTokensToInlineText(item.tokens || [])
        if (text) paragraphs.push(`- ${text}`)
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
      for (const item of token.items || []) {
        const text = blockTokensToInlineText(item.tokens || [])
        if (text) out.push(`- ${text}`)
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
        if (token.href) parts.push(`[[link:${token.href}]]${label}[[/link]]`)
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
