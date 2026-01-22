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
}: HUDProps) {
  if (hidden && !isMobile()) return null

  return (
    <div
      class={`
        fixed z-10 p-3 rounded-2xl
        bg-hud-bg border border-hud-border shadow-hud
        backdrop-blur-xl
        flex flex-col gap-2.5
        text-xs leading-snug

        top-4 right-4

        max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:right-0
        max-sm:max-w-none max-sm:rounded-b-none max-sm:gap-2
        max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]
      `}
    >
      {/* Mobile handle */}
      <div class="hidden max-sm:block w-9 h-1 bg-btn-bg rounded-sm mx-auto -mt-1 mb-1" />

      {/* Row 1: Layout + View */}
      <div class="flex gap-2 items-center">
        <LayoutPicker value={beat} onChange={onBeatChange} />
        <div class="w-px h-5 bg-hud-border" />
        <ViewPicker value={viewMode} onChange={onViewChange} />
        <div class="flex-1" />
        <FocusPicker value={focusStyle} onChange={onFocusChange} />
      </div>

      {/* Row 3: Font + Width scrubbers */}
      <div class="flex gap-3 items-start">
        <div class="flex flex-col gap-1 flex-1">
          <Label>Font</Label>
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
        <Button onClick={onInputOpen} class="h-6 px-2 text-[10px] max-sm:min-h-11 max-sm:px-3 max-sm:text-xs">
          Text <kbd class="text-[9px] bg-btn-bg rounded px-1 ml-1 opacity-60 max-sm:hidden">I</kbd>
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
