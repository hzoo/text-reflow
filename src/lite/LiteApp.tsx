import { LiteRoot } from './LiteRoot'
import { PasteToast } from '../components/PasteToast'
import { ControlPanel } from '../components/ControlPanel'

export function LiteApp() {
  return (
    <>
      <LiteRoot />
      <PasteToast />
      <ControlPanel />
    </>
  )
}
