import { liteVariant$ } from '../state/signals'
import { LiteScroll } from './LiteScroll'
import { LitePoster } from './LitePoster'
import { LiteHUD } from './LiteHUD'
import './lite.css'

export function LiteRoot() {
  const variant = liteVariant$.value
  return (
    <div class="lite-root">
      {variant === 'scroll' ? <LiteScroll /> : <LitePoster />}
      <LiteHUD />
    </div>
  )
}
