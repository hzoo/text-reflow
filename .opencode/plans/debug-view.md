# Plan: Add Canvas Debug View

## Goal
Visualize word metrics (pixel width, character count) directly on the canvas to debug header spacing issues.

## Proposed Changes

### 1. Engine State (`src/syntaxExploder/engine.ts`)
- Update `EngineStateUpdate` interface to include optional `debug?: boolean`.
- Add `debug` state variable (default `false`).
- Pass `debug` to `RenderState`.
- Update `commit` method to handle `debug` updates.

### 2. Rendering (`src/syntaxExploder/engine-render.ts`)
- Update `RenderState` type to include `debug: boolean`.
- Implement `drawDebugInfo(w: Word, pos: WordPos)`:
  - Draw red bounding box (`strokeRect`) using `w.pixelWidth` / `w.imageW`.
  - Draw text label: `${w.pixelWidth.toFixed(1)}/${w.displayText.length}`.
- Call `drawDebugInfo` in `drawWord` and `drawWordPlain` when `state.debug` is true.

### 3. App Integration (`src/App.tsx`)
- Add `useSignalEffect` to sync `debug$` signal to engine:
  ```typescript
  useSignalEffect(() => {
    engineRef.current?.commit({ debug: debug$.value })
  })
  ```

## Verification
- Toggle "Debug" in HUD.
- Verify red boxes appear around words.
- Check if header word boxes match visual text width.
