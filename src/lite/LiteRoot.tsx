import { liteVariant$ } from '../state/signals'
import { LiteScroll } from './LiteScroll'
import { LiteStories } from './LiteStories'
import { LiteHUD } from './LiteHUD'
import './lite.css'

export function LiteRoot() {
  const variant = liteVariant$.value
  return (
    <div class="lite-root">
      {variant === 'scroll' ? <LiteScroll /> : <LiteStories />}
      <LiteHUD />
    </div>
  )
}
