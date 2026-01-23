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
        h-8 px-3 rounded-full transition-all duration-150
        text-[11px] font-bold tracking-tight
        border-none cursor-pointer select-none
        ${active 
          ? 'bg-accent text-bg shadow-sm scale-[0.98]' 
          : 'bg-btn-bg hover:bg-btn-hover text-accent/80 hover:text-accent'}
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
        w-9 h-8 rounded-lg flex items-center justify-center relative
        transition-all duration-150 border-none cursor-pointer
        max-sm:w-11 max-sm:h-11
        ${active 
          ? 'bg-accent text-bg shadow-sm scale-[0.98]' 
          : 'bg-btn-bg hover:bg-btn-hover text-accent/80 hover:text-accent'}
      `}
    >
      <span class="flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
      {kbd && (
        <kbd class={`absolute top-0.5 right-1 text-[8px] font-bold max-sm:hidden ${active ? 'text-bg opacity-40' : 'text-hint opacity-50'}`}>
          {kbd}
        </kbd>
      )}
    </button>
  )
}
