import { describe, expect, test } from 'bun:test'
import { parseInlineMarkers } from './document'

describe('parseInlineMarkers', () => {
  test('strong applies bold', () => {
    const segs = parseInlineMarkers('a [[strong]]b[[/strong]] c')
    expect(segs[1].style.fontWeight).toBe('bold')
    expect(segs[0].style.fontWeight).toBe('normal')
    expect(segs[2].style.fontWeight).toBe('normal')
  })

  test('nested strong inside em', () => {
    const segs = parseInlineMarkers('[[em]]i [[strong]]bi[[/strong]] i[[/em]]')
    expect(segs[0].style).toMatchObject({ fontStyle: 'italic', fontWeight: 'normal' })
    expect(segs[1].style).toMatchObject({ fontStyle: 'italic', fontWeight: 'bold' })
    expect(segs[2].style).toMatchObject({ fontStyle: 'italic', fontWeight: 'normal' })
  })

  test('link captures URL with query params', () => {
    const segs = parseInlineMarkers('[[link:https://x.com/a?b=1&c=2]]text[[/link]]')
    expect(segs[0].style.linkUrl).toBe('https://x.com/a?b=1&c=2')
  })

  test('unclosed marker does not crash', () => {
    const segs = parseInlineMarkers('before [[strong]]still bold')
    expect(segs[1].style.fontWeight).toBe('bold')
  })

  test('extra close does not underflow stack', () => {
    const segs = parseInlineMarkers('text [[/strong]] more')
    expect(segs[0].style.fontWeight).toBe('normal')
    expect(segs[1].style.fontWeight).toBe('normal')
  })
})
