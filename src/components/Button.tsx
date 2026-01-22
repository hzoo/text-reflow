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
        h-8 px-2.5 rounded-lg transition-all duration-100
        bg-btn-bg hover:bg-btn-hover active:scale-95
        text-accent text-[11px] font-inherit
        border-none cursor-pointer select-none
        ${active ? 'bg-btn-active shadow-inset' : ''}
        ${disabled ? 'opacity-50 cursor-default' : ''}
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
}

export function IconButton({ active, onClick, title, svg }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      class={`
        w-9 h-8 rounded-lg flex items-center justify-center
        transition-all duration-100 border-none cursor-pointer
        bg-btn-bg hover:bg-btn-hover active:scale-95
        max-sm:w-11 max-sm:h-11
        ${active ? 'bg-btn-active shadow-inset' : ''}
      `}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
