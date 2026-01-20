# reflow

A tool for making prose feel poetic. Canvas-based text layout explorer that transforms ordinary paragraphs into visual experiences.

## Core Philosophy

**Soul**: Take non-poetic text and make it poetic. Dense essays, technical docs, fiction - reveal their hidden rhythm, structure, and texture through unconventional layouts.

**Design principles** (from user's philosophy):
- Prevent interface anxiety: no extra clicks, no context jumps, no uncertain latency
- Good data-ink ratio: every pixel should earn its place
- No sidebars, no modals unless absolutely necessary
- Linear text forces prioritization - layouts should do the same
- Warm, paper-like aesthetic over cold digital

## Document Model

### Paragraphs
- Document split into paragraphs (smart detection: double newline for prose, single for poetry-like text)
- One paragraph displayed at a time (pagination, not scroll)
- Each paragraph is an independent layout unit

### Within Paragraph
- Sentences detected by `.!?` endings
- Words tokenized with spacing preserved
- Stopwords and punctuation tagged for layout logic

## Navigation

```
Paragraphs:  ← →  or  h l  (vim mode)
Sentences:   j k       (within current paragraph, nice-to-have)
Layouts:     1-6       (switch layout instantly, words animate)
Input:       i         (open text input)
HUD:         h         (toggle)
Focus style: f         (cycle dither/gray/redact/none)
```

## Input

**Trigger**: Press `i` to enter input mode

**Style**: Bottom sheet that slides up from bottom, pushing canvas content up. Textarea for pasting/typing. `Esc` to confirm and render.

**Paragraph splitting**: Smart detect - double newlines for prose, single for verse-like content. First paragraph displays immediately.

**Future**: URL fetching via Jina-style reader (not now)

## UI

### Canvas
- Full viewport
- Warm cream background: `#faf7f0`
- Monospace font: ui-monospace stack
- Text color: `#111`

### HUD (top-right, minimal)
- Single line: `cascade · dither · 3/12`
- Second line: key hints (toggle-able)
- Semi-transparent background
- 10px font

### Position Indicator
- Subtle `3/12` in HUD showing current/total paragraphs
- Always visible when multiple paragraphs exist

### Input Panel
- Bottom sheet style
- Slides up smoothly
- Textarea with same warm aesthetic
- Placeholder: "paste or type text..."
- `Esc` to close and render

## Layouts

Current 6 are experiments. Goal: NOT typical paragraph style. Each should reveal something different.

### Current (keep for now)
1. **plain** - standard wrapped text (baseline)
2. **cascade** - sentences drift right with increasing indent
3. **tree** - clause-based indentation (subordinate clauses indent)
4. **list** - detects parallel structure, arranges in columns
5. **magnify** - sentences as separate blocks with gaps (for focus zoom)
6. **radial** - pivot word centered, text flows around it

### Layout Goals (for future development)
Each layout should reveal one of:
- **Rhythm/pacing**: Short vs long sentences, pause points, breath
- **Argument structure**: Claims, evidence, qualifiers, rebuttals
- **Repetition/echo**: Repeated words/phrases, callbacks, motifs
- **Density/complexity**: Where text is dense vs sparse

### Responsiveness
- `maxCols` should adapt to viewport width (currently hardcoded 80)
- Layouts should fit within viewport (pagination handles overflow)
- Font size remains constant (16px base), layout adapts

### Adaptive Density
- Some layouts dense (maximize text), others spacious
- Per-layout decision, not global setting

## Animation

- Words animate smoothly between layouts (current behavior: exponential ease)
- Keep current transition speed (~300ms feel)
- Sentence focus offset animates smoothly

## Sentence Focus (nice-to-have)

- Hover or j/k to highlight a sentence
- Other sentences dim (dither/gray/redact styles)
- Magnify layout: hovered sentence scales up, others push away
- Not core to reading flow, but enhances exploration

## Technical Notes

### Screen Sizing
- Calculate `maxCols` from viewport: `Math.floor((innerWidth - padding*2) / charW)`
- Cap at reasonable max (100?) for wide screens
- Recalculate on resize

### Paragraph Detection
```
Smart detect:
- If text has >= 2 double-newlines: split on \n\n
- Else if has single newlines: split on \n (poetry mode)
- Else: treat as single paragraph
```

### State
```ts
{
  paragraphs: Paragraph[]     // parsed from input
  currentParagraph: number    // index
  layout: LayoutId
  focusStyle: FocusStyleId
  hoveredSentence: number | null
  showHud: boolean
  inputMode: boolean
}
```

## Immediate TODO

1. Remove debug console.logs if any
2. Make `maxCols` responsive to screen width
3. Fix list-aware grid to fit viewport (reduce columns or item width)
4. Add text input (bottom sheet, 'i' to open)
5. Add paragraph splitting and navigation
6. Add position indicator to HUD

## Future Ideas

- URL fetching (Jina reader API)
- More interesting layouts (rhythm, argument, echo, density)
- Export/share (screenshot? link with encoded text?)
- Touch/swipe for mobile
- Curated sample texts
