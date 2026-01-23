import { useComputed } from '@preact/signals'
import { articleMetadata$, firstWordY$, READER_FONT } from '../state/signals'

export function ArticleHeader() {
  const meta = articleMetadata$.value

  const opacity = useComputed(() => {
    const y = firstWordY$.value
    const threshold = window.innerHeight * 0.15 // Title roughly starts here
    const fadeRange = 80
    
    if (y > threshold) return 1
    if (y < threshold - fadeRange) return 0
    return (y - (threshold - fadeRange)) / fadeRange
  })

  const isVisible = useComputed(() => opacity.value > 0.01)

  if (!isVisible.value) return null

  return (
    <div 
      class="fixed top-[12%] left-0 right-0 z-10 flex flex-col items-center px-8 pointer-events-none"
      style={{ 
        opacity: opacity.value,
        fontFamily: READER_FONT 
      }}
    >
      <div class="max-w-2xl text-center">
        <h1 class="text-3xl md:text-4xl font-bold text-accent mb-3 leading-tight tracking-tight">
          {meta.title}
        </h1>
        {meta.hostname && (
          <div class="text-[10px] font-mono uppercase tracking-[0.3em] text-link opacity-70">
            {meta.hostname}
          </div>
        )}
      </div>
    </div>
  )
}
