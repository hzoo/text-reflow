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

## Performance Optimization
- **Monomorphic Shapes**: All `Word` objects initialized with full property sets to maintain V8 hidden class stability and avoid JIT de-optimization.
- **Caching Strategy**:
    - **Word Widths**: LRU-capped cache for `measureText` results (keyed by font + text).
    - **Font Strings**: Cached CSS font strings to avoid repeated allocation/concatenation.
    - **Layout Metrics**: `maxRow` and sentence centers are cached after layout to avoid O(N) re-scans.
- **Visible-Range Rendering**: Binary search identifies viewport words; only visible words are drawn or calculated for animation.
- **Hot-Range Animation**: Smooth transitions only apply to words near the viewport; distant words snap to targets to save CPU.
- **DPR Capping**: `devicePixelRatio` capped at 2.0 to balance visual sharpness with fill-rate performance.
- **Loop Cooling**: RequestAnimationFrame loop shuts down automatically when the layout is stable and no animations are active.

## Deployment
- **URL**: https://reflow.henry.ink
- **Platform**: Cloudflare Pages
- **Deploy**: `bun run deploy`

## Code Style
- Keep components under 600 lines; split/refactor as needed
