import { createWords, DEFAULT_TEXT } from './model'
import { type BeatId, BEATS } from './experiments'
import { createEngine } from './engine'

export function start(root: HTMLElement) {
  root.innerHTML = ''

  const canvas = document.createElement('canvas')
  canvas.id = 'canv'
  root.appendChild(canvas)

  const words = createWords(DEFAULT_TEXT)
  const engine = createEngine({ canvas, words })

  function setBeat(beat: BeatId) {
    engine.setBeat(beat)
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase()
    if (key === '1') setBeat('plain')
    else if (key === '2') setBeat('cascade')
    else if (key === '3') setBeat('tree')
    else if (key === '4') setBeat('list')
    else if (key === '5') setBeat('magnify')
    else if (key === '6') setBeat('radial')
    else if (key === 'j') engine.nextSentence()
    else if (key === 'k') engine.prevSentence()
    else if (key === 'f') engine.cycleFocusStyle()
    else if (key === 'h') engine.toggleHud()
  })

  // initial
  engine.setBeat('plain')
  engine.start()

  // expose for REPL tinkering
  ;(window as any).syntaxExploder = {
    engine,
    words,
    BEATS,
    setBeat,
  }
}
