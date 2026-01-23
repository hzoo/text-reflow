import { useCallback } from 'preact/hooks'
import { LiteRoot } from './LiteRoot'
import { PasteToast } from '../components/PasteToast'
import { InputPanel } from '../components/InputPanel'
import { inputMode$, inputTab$ } from '../state/signals'
import { addEntry, fetchUrlToEntry } from '../state/library'

export function LiteApp() {
  const handleLoadUrl = useCallback(async (url: string) => {
    await fetchUrlToEntry(url)
  }, [])

  const handleSubmitText = useCallback((text: string) => {
    addEntry({ content: text, isMarkdown: false })
  }, [])

  return (
    <>
      <LiteRoot />
      <PasteToast />
      <InputPanel
        open={inputMode$.value}
        tab={inputTab$.value}
        onTabChange={(t) => { inputTab$.value = t }}
        onClose={() => { inputMode$.value = false }}
        onLoadUrl={handleLoadUrl}
        onSubmitText={handleSubmitText}
      />
    </>
  )
}
