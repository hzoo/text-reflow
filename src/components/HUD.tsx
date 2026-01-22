import { LayoutPicker } from './LayoutPicker'
import { FocusPicker } from './FocusPicker'
import { ViewPicker } from './ViewPicker'
import { Scrubber } from './Scrubber'
import { Button } from './Button'
import type { BeatId, FocusStyleId } from '../syntaxExploder/experiments'
import { isMobile } from '../state/signals'

interface HUDProps {
  // State
  beat: BeatId
  focusStyle: FocusStyleId
  viewMode: 'full' | 'paragraph'
  fontSize: number
  maxWidth: number
  extraOpen: boolean
  debug: boolean
  fullPush: boolean
  moveSpeed: number
  panSpeed: number
  focusSpeed: number
  hidden: boolean
  inputOpen: boolean
  onCollapseToggle: () => void

  // Callbacks
  onBeatChange: (beat: BeatId) => void
  onFocusChange: (focus: FocusStyleId) => void
  onViewChange: (view: 'full' | 'paragraph') => void
  onFontSizeChange: (size: number) => void
  onMaxWidthChange: (width: number) => void
  onExtraToggle: () => void
  onDebugToggle: () => void
  onFullPushToggle: () => void
  onMoveSpeedChange: (speed: number) => void
  onPanSpeedChange: (speed: number) => void
  onFocusSpeedChange: (speed: number) => void
  onInputOpen: () => void
  onAutoFont: () => void
}

export function HUD({
  beat,
  focusStyle,
  viewMode,
  fontSize,
  maxWidth,
  extraOpen,
  debug,
  fullPush,
  moveSpeed,
  panSpeed,
  focusSpeed,
  hidden,
  inputOpen,
  onCollapseToggle,
  onBeatChange,
  onFocusChange,
  onViewChange,
  onFontSizeChange,
  onMaxWidthChange,
  onExtraToggle,
  onDebugToggle,
  onFullPushToggle,
  onMoveSpeedChange,
  onPanSpeedChange,
  onFocusSpeedChange,
  onInputOpen,
  onAutoFont,
}: HUDProps) {
  const isMobileView = isMobile()

  if (hidden && !isMobileView) {
    return (
      <div class="fixed top-4 right-4 z-10">
        <button
          type="button"
          onClick={onCollapseToggle}
          class="flex items-center gap-2 rounded-full bg-hud-bg border border-hud-border shadow-hud px-3 py-2"
          aria-label="Show controls"
        >
          <span class="h-2.5 w-7 rounded-full bg-btn-bg" />
          <span class="text-[9px] uppercase tracking-wider text-hint">Controls</span>
        </button>
      </div>
    )
  }
  if (hidden && isMobileView) {
    return (
      <div class="fixed bottom-4 right-4 z-10">
        <button
          type="button"
          onClick={onCollapseToggle}
          class="flex items-center gap-2 rounded-full bg-hud-bg border border-hud-border shadow-hud px-3 py-2"
          aria-label="Show controls"
        >
          <span class="h-2.5 w-7 rounded-full bg-btn-bg" />
          <span class="text-[9px] uppercase tracking-wider text-hint">Controls</span>
        </button>
      </div>
    )
  }

  return (
    <div
      class={`
        fixed z-30 p-3 rounded-2xl
        bg-hud-bg border border-hud-border shadow-hud
        backdrop-blur-xl
        flex flex-col gap-2.5
        text-xs leading-snug

        top-4 right-4

        max-sm:top-auto max-sm:bottom-4 max-sm:right-4 max-sm:left-auto
        max-sm:w-[calc(100vw-32px)] max-sm:max-w-[360px]
        max-sm:rounded-2xl max-sm:gap-2 max-sm:pb-3
      `}
    >
      {/* Mobile close */}
      <button
        type="button"
        onClick={onCollapseToggle}
        class="hidden max-sm:flex items-center justify-center absolute top-2 right-2 w-9 h-9 rounded-full bg-btn-bg hover:bg-btn-hover text-accent"
        aria-label="Hide controls"
      >
        ×
      </button>
      {/* Mobile handle */}
      <button
        type="button"
        onClick={onCollapseToggle}
        class="hidden max-sm:block w-12 h-2 bg-btn-bg rounded-full mx-auto -mt-1 mb-1"
        aria-label="Hide controls"
      />

      {/* Row 1: Layout + View */}
      <div class="flex gap-4">
        <div class="flex flex-col gap-1">
          <Label kbd="1/2">Layout</Label>
          <LayoutPicker value={beat} onChange={onBeatChange} />
        </div>
        <div class="flex flex-col gap-1">
          <Label kbd="V">View</Label>
          <ViewPicker value={viewMode} onChange={onViewChange} />
        </div>
      </div>

      {/* Row 2: Focus */}
      <div class="flex flex-col gap-1">
        <Label kbd="F">Focus</Label>
        <FocusPicker value={focusStyle} onChange={onFocusChange} />
      </div>

      {/* Row 3: Font + Width scrubbers */}
      <div class="flex gap-3 items-start">
        <div class="flex flex-col gap-1 flex-1">
          <div class="flex items-center justify-between">
            <Label>Font</Label>
            <button
              onClick={onAutoFont}
              class="text-[9px] uppercase tracking-wider text-accent hover:text-text opacity-70 hover:opacity-100 transition-opacity bg-btn-bg px-1 rounded"
              title="Auto-fit font size"
            >
              Auto
            </button>
          </div>
          <Scrubber
            min={12}
            max={48}
            step={1}
            value={fontSize}
            defaultValue={20}
            onChange={onFontSizeChange}
          />
        </div>
        <div class="flex flex-col gap-1 flex-1">
          <Label>Width</Label>
          <Scrubber
            min={300}
            max={1200}
            step={50}
            value={maxWidth}
            defaultValue={800}
            onChange={onMaxWidthChange}
          />
        </div>
      </div>

      {/* Footer */}
      <div class="flex items-center gap-2 pt-1.5 border-t border-hud-border mt-1">
        <Button
          onClick={onInputOpen}
          active={inputOpen}
          class="h-6 px-2 text-[10px] max-sm:min-h-11 max-sm:px-3 max-sm:text-xs"
        >
          {inputOpen ? 'Close' : 'Text'}
          <kbd class="text-[9px] bg-btn-bg rounded px-1 ml-1 opacity-60 max-sm:hidden">
            {inputOpen ? 'Esc' : 'I'}
          </kbd>
        </Button>
        <Button onClick={onExtraToggle} class="h-6 px-2 text-[10px] max-sm:min-h-11 max-sm:px-3 max-sm:text-xs ml-auto">
          ⋯
        </Button>
      </div>

      {/* Extra section */}
      {extraOpen && (
        <div class="flex flex-col gap-2.5 pt-2.5 border-t border-hud-border mt-1">
          <div class="flex gap-3 items-start">
            <div class="flex flex-col gap-1 flex-1">
              <Label>Debug</Label>
              <div class="flex gap-1">
                <Button onClick={onDebugToggle} active={debug} class="h-6 px-2 text-[10px] max-sm:min-h-11">
                  Log
                </Button>
                <Button onClick={onFullPushToggle} active={fullPush} class="h-6 px-2 text-[10px] max-sm:min-h-11" title="Spread sentences apart on hover">
                  Spread
                </Button>
              </div>
            </div>
          </div>

          <div class="flex gap-3 items-start">
            <div class="flex flex-col gap-1 flex-1">
              <Label>Speed</Label>
              <div class="flex flex-col gap-1.5 text-[10px] text-muted bg-btn-bg p-2.5 rounded-xl">
                <div class="flex items-center justify-between gap-0.5">
                  Move
                  <Scrubber
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={moveSpeed}
                    defaultValue={1}
                    onChange={onMoveSpeedChange}
                    class="text-[10px] min-w-6 max-sm:min-h-8 max-sm:min-w-9"
                  />
                </div>
                <div class="flex items-center justify-between gap-0.5">
                  Pan
                  <Scrubber
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={panSpeed}
                    defaultValue={1}
                    onChange={onPanSpeedChange}
                    class="text-[10px] min-w-6 max-sm:min-h-8 max-sm:min-w-9"
                  />
                </div>
                <div class="flex items-center justify-between gap-0.5">
                  Focus
                  <Scrubber
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={focusSpeed}
                    defaultValue={1}
                    onChange={onFocusSpeedChange}
                    class="text-[10px] min-w-6 max-sm:min-h-8 max-sm:min-w-9"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Label({ children, kbd }: { children: string; kbd?: string }) {
  return (
    <span class="text-[9px] text-hint uppercase tracking-wider min-w-10 shrink-0 max-sm:text-[8px]">
      {children}
      {kbd && (
        <kbd class="text-[9px] bg-btn-bg rounded px-1 ml-1 opacity-70 max-sm:hidden">
          {kbd}
        </kbd>
      )}
    </span>
  )
}
