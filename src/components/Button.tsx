import type { ComponentChildren } from 'preact'

interface ButtonProps {
  active?: boolean
  onClick?: () => void
  class?: string
  title?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  children: ComponentChildren
}

export function Button({ active, onClick, class: className = '', title, type = 'button', disabled, children }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      class={`
        h-8 px-2.5 rounded-md transition-colors duration-150
        bg-btn-bg hover:bg-btn-hover
        text-accent text-[11px] font-medium tracking-tight
        border-none cursor-pointer select-none
        ${active ? 'bg-btn-active shadow-[inset_0_0_0_1px_var(--color-accent)] font-semibold' : ''}
        ${disabled ? 'opacity-40 cursor-default' : ''}
        ${className}
      `}
    >
      {children}
    </button>
  )
}

interface IconButtonProps {
  active?: boolean
  onClick?: () => void
  title?: string
  svg: string
  kbd?: string
}

export function IconButton({ active, onClick, title, svg, kbd }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      class={`
        w-9 h-8 rounded-md flex items-center justify-center relative
        transition-colors duration-150 border-none cursor-pointer
        bg-btn-bg hover:bg-btn-hover
        max-sm:w-11 max-sm:h-11
        ${active ? 'bg-btn-active shadow-[inset_0_0_0_1px_var(--color-accent)]' : ''}
      `}
    >
      <span dangerouslySetInnerHTML={{ __html: svg }} />
      {kbd && (
        <kbd class="absolute top-0.5 right-1 text-[8px] text-hint opacity-50 max-sm:hidden">
          {kbd}
        </kbd>
      )}
    </button>
  )
}
