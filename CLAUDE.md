# Text Layout Visualization

## Core Principles
- **Sentence = Cursor = Center** — One sentence focused, always at exact screen center
- **Visual Anchoring** — Font/width changes keep sentence fixed; surrounding text reflows around it
- **Smooth Reflow** — Words animate between positions (no jump). Canvas-rendered 60fps
- **Focus Styles** — De-emphasize unfocused text: gray (opacity), redact (rectangles), highlight (color), none
- **Content-Aware Units** — "Sentence" = semantic unit. Bible text auto-detected → verse-based navigation
- **Minimal Chrome** — Reading-first; HUD collapses; indicators subtle

## Layout Modes
- **Reader**: Standard word-wrap
- **Ladder**: Alternating left/right indent per paragraph

## Content Model
Document → Paragraphs → Sentences → Words. Navigation and focus driven by sentence bounds.

## Deployment
- **URL**: https://reflow.henry.ink
- **Platform**: Cloudflare Pages
- **Deploy**: `bun run deploy`

## Code Style
- Keep components under 600 lines; split/refactor as needed
