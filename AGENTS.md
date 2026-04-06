# Project Theory

This program is like a camera rig for prose.

- Desktop canvas mode is the tracking shot: keep one semantic sentence stable while everything else reflows around it.
- Mobile lite mode is the poster compositor: each page maximizes text size to fill the viewport without clipping.

## Real Problem

Make long-form text legible, navigable, and expressive across devices without interface anxiety.

## Organizing Principle

Sentence semantics drive layout and navigation.
Rendering strategy adapts to device constraints:

- Desktop: animated canvas reflow with anchored focus.
- Mobile lite: minimal motion, fit-to-viewport typography.

Reading chrome stays subordinate to the text.
The focused unit should feel physically anchored while surrounding text adapts.

## Hard Constraints

- Focus sentence must remain deterministic during navigation.
- Desktop reflow changes should preserve the focused sentence as the visual anchor.
- Mobile must prioritize speed, legibility, and viewport efficiency over animation flourish.
- Mobile controls should stay minimal and should not compete with the reading surface.
- Layout/runtime decisions should reduce per-frame work and avoid unnecessary allocations.
